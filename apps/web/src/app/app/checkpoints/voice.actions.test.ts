import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Server-action tests for Checkpoint Intelligence — FATIA 3 (voz). Stateful
 * in-memory Prisma mock (mesmo padrão de actions.test.ts / extraction.actions).
 * Cobre:
 * - flag de voz OFF → attach/transcribe/getUrl recusam honestamente;
 * - attach: storage não configurado → NO_STORAGE; arquivo inválido → erro;
 *   sucesso grava audioStorageKey + transcriptionStatus=PENDING;
 * - transcribe: provider DISABLED/NO_RESULT → honesto (status volta a NONE, sem
 *   texto inventado); provider mockado → transcription preenchida + DONE;
 *   auditoria NÃO vaza o texto cru da transcrição;
 * - getCheckpointAudioUrl: consultor avaliado NÃO obtém a URL do áudio (FORBIDDEN).
 */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Where = Record<string, any>;

interface CheckpointRec {
  id: string;
  consultantId: string;
  managerUserId: string | null;
  relatedProjectId: string | null;
  type: string;
  occurredAt: Date;
  weekStart: Date | null;
  weekEnd: Date | null;
  title: string | null;
  notes: string | null;
  audioStorageKey: string | null;
  transcription: string | null;
  transcriptionStatus: string;
  extractionStatus: string;
  extractedAt: Date | null;
  status: string;
  visibility: string;
}

const h = vi.hoisted(() => {
  const store = {
    checkpoints: [] as CheckpointRec[],
    audits: [] as Record<string, unknown>[],
    uploads: [] as { key: string; contentType: string }[],
    deletes: [] as string[],
    currentUser: {
      id: "dev-user",
      email: "gestor@jumplabel.com.br",
      roles: ["PROJECT_MANAGER"] as string[],
    },
    dbUserId: "pm-1",
    can: { view: true, create: true, edit: true, delete: true },
    seq: 0,
    // Toggles for the mocked collaborators.
    voiceEnabled: true,
    storageConfigured: true,
    // Signed-url helper outcome (db layer is mocked wholesale below).
    audioUrlOutcome: {
      ok: true,
      data: { url: "https://signed.example/audio" },
    } as
      | { ok: true; data: { url: string } }
      | { ok: false; error: string; message: string },
    // transcribeAudio mock outcome.
    transcribeOutcome: {
      ok: true,
      text: "Transcricao real do audio do checkpoint.",
      language: "pt-BR",
      model: "whisper-1",
    } as
      | { ok: true; text: string; language?: string; model?: string }
      | { ok: false; reason: string; message: string },
  };

  const nextId = (prefix: string) => `${prefix}-${++store.seq}`;

  const prismaMock = {
    checkpoint: {
      findUnique: async ({ where }: { where: Where }) => {
        const row = store.checkpoints.find((c) => c.id === where.id);
        return row ? { ...row } : null;
      },
      update: async ({ where, data }: { where: Where; data: Where }) => {
        const row = store.checkpoints.find((c) => c.id === where.id)!;
        for (const k of Object.keys(data)) {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          (row as any)[k] = data[k];
        }
        return { ...row };
      },
    },
    auditEvent: {
      create: async ({ data }: { data: Record<string, unknown> }) => {
        store.audits.push(data);
        return { id: nextId("audit"), ...data };
      },
    },
  };

  return { store, prismaMock, nextId };
});

vi.mock("@jumpflow/database", () => ({
  prisma: h.prismaMock,
  Prisma: {
    JsonNull: "__JsonNull__",
    PrismaClientKnownRequestError: class extends Error {
      code: string;
      constructor(message: string, opts: { code: string }) {
        super(message);
        this.code = opts.code;
      }
    },
  },
}));

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

vi.mock("@/lib/auth/guards", () => ({
  requireUser: vi.fn(async () => h.store.currentUser),
  requirePermission: vi.fn(
    async (
      _code: string,
      action: "view" | "create" | "edit" | "delete" = "view",
    ) => {
      if (h.store.can[action] !== true) {
        throw Object.assign(new Error("forbidden"), { digest: "NEXT_REDIRECT" });
      }
      return h.store.currentUser;
    },
  ),
}));

vi.mock("@/lib/db/users", () => ({
  resolveDbUser: vi.fn(async () => ({
    id: h.store.dbUserId,
    name: "Gestor",
    email: h.store.currentUser.email,
  })),
}));

vi.mock("@/lib/db/config", () => ({
  isDatabaseConfigured: () => true,
}));

vi.mock("@/lib/db/audit", () => ({
  recordAuditEvent: vi.fn(async (input: Record<string, unknown>) => {
    h.store.audits.push(input);
  }),
}));

// db/checkpoint: only the signed-url helper + canTargetConsultant are imported
// by the action; mock them so the action's RBAC/scope is exercised via the
// helper outcome toggle (the helper itself is unit-tested at the db layer).
vi.mock("@/lib/db/checkpoint", () => ({
  canTargetConsultant: vi.fn(async () => true),
  getCheckpointAudioSignedUrl: vi.fn(async () => h.store.audioUrlOutcome),
}));

vi.mock("@/lib/checkpoint/flags", () => ({
  isCheckpointVoiceEnabled: () => h.store.voiceEnabled,
  isCheckpointAiEnabled: () => false,
}));

vi.mock("@/lib/storage/provider", () => ({
  CHECKPOINT_AUDIO_BUCKET: "checkpoint-audio",
  isStorageConfigured: () => h.store.storageConfigured,
  getCheckpointAudioStorageProvider: () =>
    h.store.storageConfigured
      ? {
          upload: async (key: string, _body: unknown, contentType: string) => {
            h.store.uploads.push({ key, contentType });
          },
          delete: async (key: string) => {
            h.store.deletes.push(key);
          },
          getSignedUrl: async () => "https://signed.example/raw-audio",
        }
      : null,
}));

vi.mock("@/lib/transcription/transcribe", () => ({
  ALLOWED_AUDIO_MIME_TYPES: ["audio/webm", "audio/mpeg", "audio/mp4"],
  MAX_AUDIO_BYTES: 25 * 1024 * 1024,
  transcribeAudio: vi.fn(async () => h.store.transcribeOutcome),
}));

import {
  attachCheckpointAudio,
  getCheckpointAudioUrl,
  transcribeCheckpoint,
} from "./actions";

function seedCheckpoint(over: Partial<CheckpointRec> = {}): CheckpointRec {
  const row: CheckpointRec = {
    id: `seed-chk-${++h.store.seq}`,
    consultantId: "cons-1",
    managerUserId: "pm-1",
    relatedProjectId: null,
    type: "ONE_ON_ONE",
    occurredAt: new Date("2026-06-01T12:00:00Z"),
    weekStart: null,
    weekEnd: null,
    title: "1-on-1 junho",
    notes: null,
    audioStorageKey: null,
    transcription: null,
    transcriptionStatus: "NONE",
    extractionStatus: "NONE",
    extractedAt: null,
    status: "RECORDED",
    visibility: "PRIVATE",
    ...over,
  };
  h.store.checkpoints.push(row);
  return row;
}

function audioFormData(
  checkpointId: string,
  file: File | null,
): FormData {
  const fd = new FormData();
  fd.set("checkpointId", checkpointId);
  if (file) fd.set("file", file);
  return fd;
}

function webmFile(bytes = 1024, name = "nota.webm", type = "audio/webm"): File {
  return new File([new Uint8Array(bytes)], name, { type });
}

beforeEach(() => {
  vi.stubEnv("DATABASE_URL", "postgresql://u:p@localhost:5432/db");
  h.store.checkpoints = [];
  h.store.audits = [];
  h.store.uploads = [];
  h.store.deletes = [];
  h.store.seq = 0;
  h.store.can = { view: true, create: true, edit: true, delete: true };
  h.store.voiceEnabled = true;
  h.store.storageConfigured = true;
  h.store.currentUser = {
    id: "dev-user",
    email: "gestor@jumplabel.com.br",
    roles: ["PROJECT_MANAGER"],
  };
  h.store.dbUserId = "pm-1";
  h.store.audioUrlOutcome = {
    ok: true,
    data: { url: "https://signed.example/audio" },
  };
  h.store.transcribeOutcome = {
    ok: true,
    text: "Transcricao real do audio do checkpoint.",
    language: "pt-BR",
    model: "whisper-1",
  };
  // global fetch used to read the stored audio during transcription.
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => ({
      ok: true,
      headers: { get: () => "audio/webm" },
      arrayBuffer: async () => new Uint8Array(2048).buffer,
    })),
  );
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});

describe("attachCheckpointAudio — flag + storage + validação", () => {
  it("voz OFF recusa honestamente (FORBIDDEN, sem upload)", async () => {
    h.store.voiceEnabled = false;
    const c = seedCheckpoint();
    const r = await attachCheckpointAudio(audioFormData(c.id, webmFile()));
    expect(r).toMatchObject({ ok: false, error: "FORBIDDEN" });
    expect(h.store.uploads).toHaveLength(0);
    expect(h.store.checkpoints[0].audioStorageKey).toBeNull();
  });

  it("storage não configurado → NO_STORAGE (não finge upload)", async () => {
    h.store.storageConfigured = false;
    const c = seedCheckpoint();
    const r = await attachCheckpointAudio(audioFormData(c.id, webmFile()));
    expect(r).toMatchObject({ ok: false, error: "NO_STORAGE" });
    expect(h.store.checkpoints[0].audioStorageKey).toBeNull();
  });

  it("arquivo de tipo inválido → INVALID_FILE", async () => {
    const c = seedCheckpoint();
    const bad = new File([new Uint8Array(10)], "nota.txt", {
      type: "text/plain",
    });
    const r = await attachCheckpointAudio(audioFormData(c.id, bad));
    expect(r).toMatchObject({ ok: false, error: "INVALID_FILE" });
    expect(h.store.uploads).toHaveLength(0);
  });

  it("extensão incoerente com o tipo → INVALID_FILE", async () => {
    const c = seedCheckpoint();
    const bad = webmFile(1024, "nota.mp3", "audio/webm");
    const r = await attachCheckpointAudio(audioFormData(c.id, bad));
    expect(r).toMatchObject({ ok: false, error: "INVALID_FILE" });
  });

  it("áudio acima do limite → FILE_TOO_LARGE", async () => {
    const c = seedCheckpoint();
    const big = webmFile(26 * 1024 * 1024);
    const r = await attachCheckpointAudio(audioFormData(c.id, big));
    expect(r).toMatchObject({ ok: false, error: "FILE_TOO_LARGE" });
  });

  it("sucesso grava audioStorageKey + transcriptionStatus=PENDING e audita sem corpo cru", async () => {
    const c = seedCheckpoint();
    const r = await attachCheckpointAudio(audioFormData(c.id, webmFile()));
    expect(r.ok).toBe(true);
    const row = h.store.checkpoints[0];
    expect(row.audioStorageKey).toMatch(/^checkpoints\//);
    expect(row.transcriptionStatus).toBe("PENDING");
    expect(h.store.uploads).toHaveLength(1);
    const audit = h.store.audits.find(
      (a) => a.action === "CHECKPOINT_AUDIO_ATTACHED",
    )!;
    expect(audit).toBeTruthy();
    // O audit nunca carrega o áudio nem texto cru.
    expect(JSON.stringify(audit)).not.toContain("Transcricao");
  });

  it("um gestor NÃO autor não anexa (FORBIDDEN)", async () => {
    const c = seedCheckpoint({ managerUserId: "pm-2" });
    const r = await attachCheckpointAudio(audioFormData(c.id, webmFile()));
    expect(r).toMatchObject({ ok: false, error: "FORBIDDEN" });
  });

  it("reanexar remove o áudio anterior do bucket (sem órfão)", async () => {
    const c = seedCheckpoint({
      audioStorageKey: "checkpoints/seed/old-audio.webm",
      transcriptionStatus: "DONE",
    });
    const r = await attachCheckpointAudio(audioFormData(c.id, webmFile()));
    expect(r.ok).toBe(true);
    expect(h.store.deletes).toContain("checkpoints/seed/old-audio.webm");
  });

  it("reanexar invalida a transcrição/extração stale (limpa transcription + reseta status)", async () => {
    const c = seedCheckpoint({
      audioStorageKey: "checkpoints/seed/old-audio.webm",
      transcription: "Transcricao antiga do audio anterior.",
      transcriptionStatus: "DONE",
      extractionStatus: "DONE",
      extractedAt: new Date("2026-06-02T00:00:00Z"),
    });
    const r = await attachCheckpointAudio(audioFormData(c.id, webmFile()));
    expect(r.ok).toBe(true);
    const row = h.store.checkpoints[0];
    // áudio trocado → transcrição antiga não corresponde mais ao áudio atual
    expect(row.transcription).toBeNull();
    expect(row.transcriptionStatus).toBe("PENDING");
    // extração derivada da transcrição obsoleta volta a NONE para reprocesso
    expect(row.extractionStatus).toBe("NONE");
    expect(row.extractedAt).toBeNull();
  });

  it("NÃO reseta extração ao anexar áudio pela primeira vez (sem áudio anterior)", async () => {
    const c = seedCheckpoint({
      audioStorageKey: null,
      // cenário improvável mas defensivo: extração veio só das notes
      extractionStatus: "DONE",
      extractedAt: new Date("2026-06-02T00:00:00Z"),
    });
    const r = await attachCheckpointAudio(audioFormData(c.id, webmFile()));
    expect(r.ok).toBe(true);
    const row = h.store.checkpoints[0];
    expect(row.transcriptionStatus).toBe("PENDING");
    // primeiro anexo (sem áudio anterior): não invalida nada do que já existia
    expect(row.extractionStatus).toBe("DONE");
    expect(row.extractedAt).not.toBeNull();
  });
});

describe("transcribeCheckpoint — honestidade do provider", () => {
  it("voz OFF recusa honestamente (FORBIDDEN)", async () => {
    h.store.voiceEnabled = false;
    const c = seedCheckpoint({ audioStorageKey: "checkpoints/x/a.webm" });
    const r = await transcribeCheckpoint(c.id);
    expect(r).toMatchObject({ ok: false, error: "FORBIDDEN" });
  });

  it("sem áudio anexado → NOT_FOUND", async () => {
    const c = seedCheckpoint({ audioStorageKey: null });
    const r = await transcribeCheckpoint(c.id);
    expect(r).toMatchObject({ ok: false, error: "NOT_FOUND" });
  });

  it("provider DISABLED → unavailable:true, status volta a NONE, sem texto inventado", async () => {
    h.store.transcribeOutcome = {
      ok: false,
      reason: "DISABLED",
      message: "desativada",
    };
    const c = seedCheckpoint({
      audioStorageKey: "checkpoints/x/a.webm",
      transcriptionStatus: "PENDING",
    });
    const r = await transcribeCheckpoint(c.id);
    expect(r).toMatchObject({ ok: true, data: { unavailable: true } });
    const row = h.store.checkpoints[0];
    expect(row.transcription).toBeNull();
    expect(row.transcriptionStatus).toBe("NONE");
  });

  it("provider NO_RESULT (sem credencial) → unavailable:true, sem inventar texto", async () => {
    h.store.transcribeOutcome = {
      ok: false,
      reason: "NO_RESULT",
      message: "nenhuma",
    };
    const c = seedCheckpoint({
      audioStorageKey: "checkpoints/x/a.webm",
      transcriptionStatus: "PENDING",
    });
    const r = await transcribeCheckpoint(c.id);
    expect(r).toMatchObject({ ok: true, data: { unavailable: true } });
    expect(h.store.checkpoints[0].transcription).toBeNull();
  });

  it("provider INVALID_TYPE → FAILED", async () => {
    h.store.transcribeOutcome = {
      ok: false,
      reason: "INVALID_TYPE",
      message: "tipo invalido",
    };
    const c = seedCheckpoint({
      audioStorageKey: "checkpoints/x/a.webm",
      transcriptionStatus: "PENDING",
    });
    const r = await transcribeCheckpoint(c.id);
    expect(r).toMatchObject({ ok: false, error: "INVALID_FILE" });
    expect(h.store.checkpoints[0].transcriptionStatus).toBe("FAILED");
  });

  it("provider mockado com sucesso → transcription preenchida + DONE", async () => {
    const c = seedCheckpoint({
      audioStorageKey: "checkpoints/x/a.webm",
      transcriptionStatus: "PENDING",
    });
    const r = await transcribeCheckpoint(c.id);
    expect(r).toMatchObject({ ok: true, data: { status: "DONE" } });
    const row = h.store.checkpoints[0];
    expect(row.transcription).toBe("Transcricao real do audio do checkpoint.");
    expect(row.transcriptionStatus).toBe("DONE");
  });

  it("auditoria NÃO vaza a transcrição crua (só resumo/idioma)", async () => {
    const secret = "Conversa confidencial: o consultor pediu sigilo absoluto.";
    h.store.transcribeOutcome = {
      ok: true,
      text: secret,
      language: "pt-BR",
      model: "whisper-1",
    };
    const c = seedCheckpoint({
      audioStorageKey: "checkpoints/x/a.webm",
      transcriptionStatus: "PENDING",
    });
    await transcribeCheckpoint(c.id);
    const audit = h.store.audits.find(
      (a) => a.action === "CHECKPOINT_TRANSCRIBED",
    )!;
    expect(audit).toBeTruthy();
    const serialized = JSON.stringify(audit);
    expect(serialized).not.toContain("sigilo absoluto");
    expect(serialized).not.toContain(secret);
    // O resumo carrega tamanho, não o corpo.
    expect((audit.after as Record<string, unknown>).transcriptionLength).toBe(
      secret.length,
    );
  });
});

describe("getCheckpointAudioUrl — escopo de leitura do cru", () => {
  it("voz OFF recusa (FORBIDDEN)", async () => {
    h.store.voiceEnabled = false;
    const r = await getCheckpointAudioUrl({ checkpointId: "seed-chk-1" });
    expect(r).toMatchObject({ ok: false, error: "FORBIDDEN" });
  });

  it("gestor autorizado obtém a URL assinada", async () => {
    const r = await getCheckpointAudioUrl({ checkpointId: "seed-chk-1" });
    expect(r).toMatchObject({ ok: true, data: { url: expect.any(String) } });
  });

  it("consultor avaliado NÃO obtém a URL do áudio cru (FORBIDDEN anti-enumeração)", async () => {
    // O helper de DB aplica read-scope + canViewCheckpointRaw; o consultor
    // avaliado sempre recai em FORBIDDEN.
    h.store.currentUser = {
      id: "dev-cons",
      email: "consultor@jumplabel.com.br",
      roles: ["CONSULTANT"],
    };
    h.store.audioUrlOutcome = {
      ok: false,
      error: "FORBIDDEN",
      message: "sem acesso",
    };
    const r = await getCheckpointAudioUrl({ checkpointId: "seed-chk-1" });
    expect(r).toMatchObject({ ok: false, error: "FORBIDDEN" });
  });
});
