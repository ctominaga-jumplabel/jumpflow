import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Server-action tests for Checkpoint / 1-on-1 (Melhoria #4, FATIA 2) with a
 * stateful in-memory Prisma mock (same pattern as feed/despesas actions tests).
 * Cobre: RBAC negativo (não-gestor não cria), autoria, PRIVATE→SHARED, archive,
 * e que o AuditEvent NÃO loga o corpo cru (só resumo/contagem).
 */

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
  status: string;
  visibility: string;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Where = Record<string, any>;

const h = vi.hoisted(() => {
  class PrismaClientKnownRequestError extends Error {
    code: string;
    constructor(message: string, opts: { code: string }) {
      super(message);
      this.name = "PrismaClientKnownRequestError";
      this.code = opts.code;
    }
  }

  const store = {
    checkpoints: [] as CheckpointRec[],
    projects: [{ id: "proj-1" }] as { id: string }[],
    audits: [] as Record<string, unknown>[],
    currentUser: {
      id: "dev-user",
      email: "gestor@jumplabel.com.br",
      roles: ["PROJECT_MANAGER"] as string[],
    },
    dbUserId: "pm-1",
    // matrix grants per action (requirePermission/can toggle).
    can: { view: true, create: true, edit: true, delete: true },
    // canTargetConsultant override.
    canTarget: true,
    seq: 0,
  };

  const nextId = (prefix: string) => `${prefix}-${++store.seq}`;

  const prismaMock = {
    checkpoint: {
      findUnique: async ({ where }: { where: Where }) => {
        const row = store.checkpoints.find((c) => c.id === where.id);
        return row ? { ...row } : null;
      },
      findFirst: async ({ where }: { where: Where }) => {
        // not exercised heavily here; return first by id when present.
        const id = where?.AND?.find?.((w: Where) => w.id)?.id ?? where?.id;
        const row = store.checkpoints.find((c) => c.id === id);
        return row ? { ...row } : null;
      },
      create: async ({ data }: { data: Where }) => {
        const row: CheckpointRec = {
          id: nextId("chk"),
          consultantId: data.consultantId,
          managerUserId: data.managerUserId ?? null,
          relatedProjectId: data.relatedProjectId ?? null,
          type: data.type,
          occurredAt: data.occurredAt,
          weekStart: data.weekStart ?? null,
          weekEnd: data.weekEnd ?? null,
          title: data.title ?? null,
          notes: data.notes ?? null,
          status: data.status ?? "DRAFT",
          visibility: data.visibility ?? "PRIVATE",
        };
        store.checkpoints.push(row);
        return { id: row.id };
      },
      update: async ({ where, data }: { where: Where; data: Where }) => {
        const row = store.checkpoints.find((c) => c.id === where.id)!;
        // flatten relation connect/disconnect for relatedProject
        if (data.relatedProject?.connect)
          row.relatedProjectId = data.relatedProject.connect.id;
        if (data.relatedProject?.disconnect) row.relatedProjectId = null;
        for (const k of Object.keys(data)) {
          if (k === "relatedProject") continue;
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          (row as any)[k] = data[k];
        }
        return { ...row };
      },
    },
    project: {
      findUnique: async ({ where }: { where: Where }) => {
        const p = store.projects.find((x) => x.id === where.id);
        return p ? { id: p.id } : null;
      },
    },
    auditEvent: {
      create: async ({ data }: { data: Record<string, unknown> }) => {
        store.audits.push(data);
        return { id: nextId("audit"), ...data };
      },
    },
  };

  return { store, prismaMock, PrismaClientKnownRequestError };
});

vi.mock("@jumpflow/database", () => ({
  prisma: h.prismaMock,
  Prisma: {
    JsonNull: "__JsonNull__",
    PrismaClientKnownRequestError: h.PrismaClientKnownRequestError,
  },
}));

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

vi.mock("@/lib/auth/guards", () => ({
  requireUser: vi.fn(async () => h.store.currentUser),
  // Mirrors the real guard: enforce the matrix grant; on denial the real impl
  // redirects (throws a NEXT_* error). Here we throw a NEXT_REDIRECT-shaped
  // error so the action's toFailure rethrows it as framework control-flow —
  // which the test asserts via rejects (fail-closed).
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

vi.mock("@/lib/db/checkpoint", () => ({
  canTargetConsultant: vi.fn(async () => h.store.canTarget),
}));

import {
  archiveCheckpoint,
  createCheckpoint,
  setVisibility,
  updateCheckpoint,
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
    notes: "Conversa sensível e confidencial sobre carreira do consultor.",
    status: "RECORDED",
    visibility: "PRIVATE",
    ...over,
  };
  h.store.checkpoints.push(row);
  return row;
}

beforeEach(() => {
  vi.stubEnv("DATABASE_URL", "postgresql://u:p@localhost:5432/db");
  h.store.checkpoints = [];
  h.store.audits = [];
  h.store.projects = [{ id: "proj-1" }];
  h.store.seq = 0;
  h.store.can = { view: true, create: true, edit: true, delete: true };
  h.store.canTarget = true;
  h.store.currentUser = {
    id: "dev-user",
    email: "gestor@jumplabel.com.br",
    roles: ["PROJECT_MANAGER"],
  };
  h.store.dbUserId = "pm-1";
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("createCheckpoint / RBAC", () => {
  it("um gestor cria um 1-on-1 PRIVATE por padrão", async () => {
    const r = await createCheckpoint({
      consultantId: "cons-1",
      type: "ONE_ON_ONE",
      occurredAt: new Date("2026-06-10T10:00:00Z"),
      visibility: "PRIVATE",
      notes: "Pontos da conversa.",
    });
    expect(r.ok).toBe(true);
    expect(h.store.checkpoints).toHaveLength(1);
    const row = h.store.checkpoints[0];
    expect(row.visibility).toBe("PRIVATE");
    expect(row.managerUserId).toBe("pm-1");
    expect(row.status).toBe("RECORDED");
  });

  it("fail-closed sem CHECKPOINT.create (não cria; rethrow NEXT_REDIRECT)", async () => {
    h.store.can.create = false;
    await expect(
      createCheckpoint({
        consultantId: "cons-1",
        type: "ONE_ON_ONE",
        occurredAt: new Date("2026-06-10T10:00:00Z"),
        visibility: "PRIVATE",
      }),
    ).rejects.toMatchObject({ digest: "NEXT_REDIRECT" });
    expect(h.store.checkpoints).toHaveLength(0);
  });

  it("nega quando o gestor não pode mirar o consultor (FORBIDDEN)", async () => {
    h.store.canTarget = false;
    const r = await createCheckpoint({
      consultantId: "cons-9",
      type: "CHECKPOINT",
      occurredAt: new Date("2026-06-10T10:00:00Z"),
      visibility: "PRIVATE",
    });
    expect(r).toMatchObject({ ok: false, error: "FORBIDDEN" });
    expect(h.store.checkpoints).toHaveLength(0);
  });

  it("recusa data inválida (INVALID_INPUT)", async () => {
    const r = await createCheckpoint({
      consultantId: "",
      type: "ONE_ON_ONE",
      occurredAt: new Date("2026-06-10T10:00:00Z"),
      visibility: "PRIVATE",
    });
    expect(r).toMatchObject({ ok: false, error: "INVALID_INPUT" });
  });
});

describe("updateCheckpoint — autoria", () => {
  it("o autor edita o próprio checkpoint", async () => {
    const c = seedCheckpoint({ managerUserId: "pm-1" });
    const r = await updateCheckpoint({ id: c.id, title: "Novo título" });
    expect(r.ok).toBe(true);
    expect(h.store.checkpoints[0].title).toBe("Novo título");
  });

  it("um gestor NÃO autor não edita (FORBIDDEN)", async () => {
    const c = seedCheckpoint({ managerUserId: "pm-2" });
    const r = await updateCheckpoint({ id: c.id, title: "Hack" });
    expect(r).toMatchObject({ ok: false, error: "FORBIDDEN" });
    expect(h.store.checkpoints[0].title).toBe("1-on-1 junho");
  });

  it("não edita checkpoint arquivado (NOT_EDITABLE)", async () => {
    const c = seedCheckpoint({ managerUserId: "pm-1", status: "ARCHIVED" });
    const r = await updateCheckpoint({ id: c.id, title: "x" });
    expect(r).toMatchObject({ ok: false, error: "NOT_EDITABLE" });
  });
});

describe("setVisibility — PRIVATE→SHARED", () => {
  it("o autor compartilha (PRIVATE→SHARED) e audita", async () => {
    const c = seedCheckpoint({ managerUserId: "pm-1", visibility: "PRIVATE" });
    const r = await setVisibility({ id: c.id, visibility: "SHARED" });
    expect(r).toMatchObject({ ok: true, data: { visibility: "SHARED" } });
    expect(h.store.checkpoints[0].visibility).toBe("SHARED");
    expect(
      h.store.audits.some((a) => a.action === "CHECKPOINT_VISIBILITY_CHANGED"),
    ).toBe(true);
  });

  it("um não autor não muda visibilidade (FORBIDDEN)", async () => {
    const c = seedCheckpoint({ managerUserId: "pm-2", visibility: "PRIVATE" });
    const r = await setVisibility({ id: c.id, visibility: "SHARED" });
    expect(r).toMatchObject({ ok: false, error: "FORBIDDEN" });
    expect(h.store.checkpoints[0].visibility).toBe("PRIVATE");
  });

  it("ADMIN compartilha checkpoint de outro autor (MANAGE)", async () => {
    h.store.currentUser = {
      id: "dev-admin",
      email: "admin@jumplabel.com.br",
      roles: ["ADMIN"],
    };
    h.store.dbUserId = "admin-1";
    const c = seedCheckpoint({ managerUserId: "pm-2", visibility: "PRIVATE" });
    const r = await setVisibility({ id: c.id, visibility: "SHARED" });
    expect(r).toMatchObject({ ok: true, data: { visibility: "SHARED" } });
  });

  it("idempotente: SHARED→SHARED não gera audit novo", async () => {
    const c = seedCheckpoint({ managerUserId: "pm-1", visibility: "SHARED" });
    const r = await setVisibility({ id: c.id, visibility: "SHARED" });
    expect(r.ok).toBe(true);
    expect(h.store.audits).toHaveLength(0);
  });
});

describe("archiveCheckpoint — soft delete", () => {
  it("o autor arquiva (status ARCHIVED) e audita", async () => {
    const c = seedCheckpoint({ managerUserId: "pm-1" });
    const r = await archiveCheckpoint({ id: c.id });
    expect(r.ok).toBe(true);
    expect(h.store.checkpoints[0].status).toBe("ARCHIVED");
    expect(h.store.audits.some((a) => a.action === "CHECKPOINT_ARCHIVED")).toBe(
      true,
    );
  });

  it("fail-closed sem CHECKPOINT.delete (rethrow NEXT_REDIRECT)", async () => {
    h.store.can.delete = false;
    const c = seedCheckpoint({ managerUserId: "pm-1" });
    await expect(archiveCheckpoint({ id: c.id })).rejects.toMatchObject({
      digest: "NEXT_REDIRECT",
    });
    expect(h.store.checkpoints[0].status).toBe("RECORDED");
  });

  it("um não autor não arquiva (FORBIDDEN)", async () => {
    const c = seedCheckpoint({ managerUserId: "pm-2" });
    const r = await archiveCheckpoint({ id: c.id });
    expect(r).toMatchObject({ ok: false, error: "FORBIDDEN" });
    expect(h.store.checkpoints[0].status).toBe("RECORDED");
  });
});

describe("auditoria não loga o corpo cru (confiança/LGPD)", () => {
  const rawNotes =
    "Conversa muito sensível: o consultor relatou um conflito grave com o cliente e pediu sigilo absoluto.";

  it("CHECKPOINT_CREATED guarda só resumo do notes (sem o texto inteiro)", async () => {
    await createCheckpoint({
      consultantId: "cons-1",
      type: "ONE_ON_ONE",
      occurredAt: new Date("2026-06-10T10:00:00Z"),
      visibility: "PRIVATE",
      notes: rawNotes,
    });
    const audit = h.store.audits.find((a) => a.action === "CHECKPOINT_CREATED")!;
    const after = audit.after as Record<string, unknown>;
    // O resumo carrega SOMENTE comprimento + hash curto — nunca o corpo nem um
    // prefixo do texto (LGPD/confiança).
    expect(after.notesLength).toBe(rawNotes.length);
    expect(after).not.toHaveProperty("notes");
    expect(after).not.toHaveProperty("notesPreview");
    expect(typeof after.notesHash).toBe("string");
    expect(after.notesHash).toHaveLength(12);
    const serialized = JSON.stringify(audit);
    expect(serialized).not.toContain("sigilo absoluto");
    expect(serialized).not.toContain(rawNotes);
    // nem mesmo o prefixo de 40 chars que o antigo Preview vazava
    expect(serialized).not.toContain(rawNotes.slice(0, 40));
  });

  it("CHECKPOINT_UPDATED não expõe o notes anterior nem o novo", async () => {
    const c = seedCheckpoint({ managerUserId: "pm-1", notes: rawNotes });
    const newNotes = "Novo texto igualmente confidencial sobre o consultor.";
    await updateCheckpoint({ id: c.id, notes: newNotes });
    const audit = h.store.audits.find((a) => a.action === "CHECKPOINT_UPDATED")!;
    const serialized = JSON.stringify(audit);
    expect(serialized).not.toContain(rawNotes);
    expect(serialized).not.toContain(newNotes);
    // nem prefixos do antigo Preview (40 chars) de nenhum dos dois textos
    expect(serialized).not.toContain(rawNotes.slice(0, 40));
    expect(serialized).not.toContain(newNotes.slice(0, 40));
    const after = audit.after as Record<string, unknown>;
    expect(after.notesLength).toBe(newNotes.length);
    expect(after).not.toHaveProperty("notesPreview");
    expect(typeof after.notesHash).toBe("string");
  });
});
