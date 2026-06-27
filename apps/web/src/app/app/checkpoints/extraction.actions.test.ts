import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Server-action tests for Checkpoint Intelligence — FATIA 4 (pipeline de IA +
 * validação humana). Stateful in-memory Prisma mock (mesmo padrão de
 * actions.test.ts). Cobre:
 * - provider OFF (flag/noop) → extractionStatus permanece NONE, nada criado,
 *   retorno honesto unavailable:true;
 * - provider mockado → cria N skills/opps/cases PENDING aiGenerated;
 * - reprocessar não duplica (descarta PENDING aiGenerated antes);
 * - parse inválido → FAILED;
 * - decideOpportunity/decideCase com RBAC negativo (fail-closed) e positivo.
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
  transcription: string | null;
  extractionStatus: string;
  extractedAt: Date | null;
  status: string;
  visibility: string;
}

interface OppRec {
  id: string;
  sourceCheckpointId: string | null;
  aiGenerated: boolean;
  status: string;
  title: string;
  kind: string;
  priority: string;
  decidedByUserId: string | null;
  decidedAt: Date | null;
}

interface CaseRec {
  id: string;
  sourceCheckpointId: string | null;
  aiGenerated: boolean;
  status: string;
  title: string;
  decidedByUserId: string | null;
  decidedAt: Date | null;
}

interface SkillSugRec {
  id: string;
  consultantId: string;
  weekStart: Date;
  weekEnd: Date;
  suggestedName: string;
  suggestedCategory: string | null;
  suggestedLevel: string;
  evidenceSummary: string | null;
  sourceEntryIds: string[];
  status: string;
}

const h = vi.hoisted(() => {
  const store = {
    checkpoints: [] as CheckpointRec[],
    opportunities: [] as OppRec[],
    cases: [] as CaseRec[],
    skillSuggestions: [] as SkillSugRec[],
    audits: [] as Record<string, unknown>[],
    aiUsage: [] as Record<string, unknown>[],
    currentUser: {
      id: "dev-user",
      email: "gestor@jumplabel.com.br",
      roles: ["PROJECT_MANAGER"] as string[],
    },
    dbUserId: "pm-1",
    can: { view: true, create: true, edit: true, delete: true },
    aiEnabled: true,
    aiResponse: null as string | null,
    // Escopo da ORIGEM do insight (decideOpportunity/decideCase): default true
    // (gestor vê o checkpoint de origem). Um teste cross-team coloca false.
    sourceCheckpointInScope: true,
    seq: 0,
  };

  const nextId = (prefix: string) => `${prefix}-${++store.seq}`;

  const matchWhere = (rec: Record<string, unknown>, where: Where): boolean =>
    Object.entries(where).every(([k, v]) => rec[k] === v);

  const prismaMock = {
    checkpoint: {
      findUnique: async ({ where }: { where: Where }) => {
        const row = store.checkpoints.find((c) => c.id === where.id);
        return row ? { ...row } : null;
      },
      update: async ({ where, data }: { where: Where; data: Where }) => {
        const row = store.checkpoints.find((c) => c.id === where.id)!;
        Object.assign(row, data);
        return { ...row };
      },
    },
    opportunity: {
      findUnique: async ({ where }: { where: Where }) => {
        const row = store.opportunities.find((o) => o.id === where.id);
        return row ? { ...row } : null;
      },
      create: async ({ data }: { data: Where }) => {
        const row: OppRec = {
          id: nextId("opp"),
          sourceCheckpointId: data.sourceCheckpointId ?? null,
          aiGenerated: data.aiGenerated ?? false,
          status: data.status ?? "PENDING",
          title: data.title,
          kind: data.kind,
          priority: data.priority,
          decidedByUserId: null,
          decidedAt: null,
        };
        store.opportunities.push(row);
        return { ...row };
      },
      update: async ({ where, data }: { where: Where; data: Where }) => {
        const row = store.opportunities.find((o) => o.id === where.id)!;
        Object.assign(row, data);
        return { ...row };
      },
      deleteMany: async ({ where }: { where: Where }) => {
        const before = store.opportunities.length;
        store.opportunities = store.opportunities.filter(
          (o) => !matchWhere(o as unknown as Record<string, unknown>, where),
        );
        return { count: before - store.opportunities.length };
      },
    },
    case: {
      findUnique: async ({ where }: { where: Where }) => {
        const row = store.cases.find((c) => c.id === where.id);
        return row ? { ...row } : null;
      },
      create: async ({ data }: { data: Where }) => {
        const row: CaseRec = {
          id: nextId("case"),
          sourceCheckpointId: data.sourceCheckpointId ?? null,
          aiGenerated: data.aiGenerated ?? false,
          status: data.status ?? "PENDING",
          title: data.title,
          decidedByUserId: null,
          decidedAt: null,
        };
        store.cases.push(row);
        return { ...row };
      },
      update: async ({ where, data }: { where: Where; data: Where }) => {
        const row = store.cases.find((c) => c.id === where.id)!;
        Object.assign(row, data);
        return { ...row };
      },
      deleteMany: async ({ where }: { where: Where }) => {
        const before = store.cases.length;
        store.cases = store.cases.filter(
          (c) => !matchWhere(c as unknown as Record<string, unknown>, where),
        );
        return { count: before - store.cases.length };
      },
    },
    skillSuggestion: {
      upsert: async ({
        where,
        update,
        create,
      }: {
        where: Where;
        update: Where;
        create: Where;
      }) => {
        const key = where.consultantId_weekStart_suggestedName;
        const found = store.skillSuggestions.find(
          (s) =>
            s.consultantId === key.consultantId &&
            s.weekStart.getTime() === key.weekStart.getTime() &&
            s.suggestedName === key.suggestedName,
        );
        if (found) {
          Object.assign(found, update);
          return { ...found };
        }
        const row: SkillSugRec = {
          id: nextId("sug"),
          consultantId: create.consultantId,
          weekStart: create.weekStart,
          weekEnd: create.weekEnd,
          suggestedName: create.suggestedName,
          suggestedCategory: create.suggestedCategory ?? null,
          suggestedLevel: create.suggestedLevel,
          evidenceSummary: create.evidenceSummary ?? null,
          sourceEntryIds: create.sourceEntryIds ?? [],
          status: "PENDING",
        };
        store.skillSuggestions.push(row);
        return { ...row };
      },
    },
    auditEvent: {
      create: async ({ data }: { data: Record<string, unknown> }) => {
        store.audits.push(data);
        return { id: nextId("audit"), ...data };
      },
    },
    $transaction: async (fn: (tx: unknown) => Promise<unknown>) =>
      fn(prismaMock),
  };

  return { store, prismaMock };
});

vi.mock("@jumpflow/database", () => ({
  prisma: h.prismaMock,
  Prisma: { JsonNull: "__JsonNull__" },
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
        throw Object.assign(new Error("forbidden"), {
          digest: "NEXT_REDIRECT",
        });
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

vi.mock("@/lib/db/config", () => ({ isDatabaseConfigured: () => true }));

vi.mock("@/lib/db/audit", () => ({
  recordAuditEvent: vi.fn(async (input: Record<string, unknown>) => {
    h.store.audits.push(input);
  }),
}));

vi.mock("@/lib/db/checkpoint", () => ({
  canTargetConsultant: vi.fn(async () => true),
  canViewCheckpointInScope: vi.fn(async () => h.store.sourceCheckpointInScope),
}));

vi.mock("@/lib/checkpoint/flags", () => ({
  isCheckpointAiEnabled: () => h.store.aiEnabled,
}));

vi.mock("@/lib/ai/provider", async () => {
  const actual = await vi.importActual<typeof import("@/lib/ai/provider")>(
    "@/lib/ai/provider",
  );
  return {
    ...actual,
    getAiTextProvider: () => ({
      complete: async () => h.store.aiResponse,
    }),
  };
});

vi.mock("@/lib/ai/log", () => ({
  recordAiUsage: vi.fn(async (input: Record<string, unknown>) => {
    h.store.aiUsage.push(input);
  }),
}));

import {
  decideCase,
  decideOpportunity,
  extractCheckpointInsights,
} from "./actions";

function seedCheckpoint(over: Partial<CheckpointRec> = {}): CheckpointRec {
  const row: CheckpointRec = {
    id: `chk-${++h.store.seq}`,
    consultantId: "cons-1",
    managerUserId: "pm-1",
    relatedProjectId: "proj-1",
    type: "ONE_ON_ONE",
    occurredAt: new Date("2026-06-03T12:00:00Z"),
    weekStart: new Date("2026-06-01T00:00:00Z"),
    weekEnd: new Date("2026-06-07T00:00:00Z"),
    title: "1-on-1",
    notes: "O consultor dominou Terraform e o cliente quer expandir o squad.",
    transcription: null,
    extractionStatus: "NONE",
    extractedAt: null,
    status: "RECORDED",
    visibility: "PRIVATE",
    ...over,
  };
  h.store.checkpoints.push(row);
  return row;
}

const GOOD_RESPONSE = JSON.stringify({
  skills: [
    { name: "Terraform", category: "Infra", level: "avançado", quote: "dominou Terraform" },
    { name: "Negociação", quote: "alinhou expansão" },
  ],
  opportunities: [
    { kind: "expansion", title: "Expandir squad", priority: "alta", clientHint: "ACME", quote: "quer expandir" },
  ],
  cases: [{ title: "Stack provisionada", summary: "IaC pronto", quote: "subiu tudo" }],
});

beforeEach(() => {
  vi.stubEnv("DATABASE_URL", "postgresql://u:p@localhost:5432/db");
  h.store.checkpoints = [];
  h.store.opportunities = [];
  h.store.cases = [];
  h.store.skillSuggestions = [];
  h.store.audits = [];
  h.store.aiUsage = [];
  h.store.seq = 0;
  h.store.can = { view: true, create: true, edit: true, delete: true };
  h.store.aiEnabled = true;
  h.store.aiResponse = GOOD_RESPONSE;
  h.store.sourceCheckpointInScope = true;
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

describe("extractCheckpointInsights — provider indisponível (honesto)", () => {
  it("flag F4 OFF → NONE, nada criado, unavailable:true", async () => {
    h.store.aiEnabled = false;
    const c = seedCheckpoint();
    const r = await extractCheckpointInsights(c.id);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.data.unavailable).toBe(true);
    expect(h.store.checkpoints[0].extractionStatus).toBe("NONE");
    expect(h.store.opportunities).toHaveLength(0);
    expect(h.store.cases).toHaveLength(0);
    expect(h.store.skillSuggestions).toHaveLength(0);
  });

  it("provider noop (complete → null) → NONE, nada criado", async () => {
    h.store.aiResponse = null;
    const c = seedCheckpoint();
    const r = await extractCheckpointInsights(c.id);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.data.unavailable).toBe(true);
    expect(h.store.checkpoints[0].extractionStatus).toBe("NONE");
    expect(h.store.opportunities).toHaveLength(0);
  });

  it("sem corpo (notes/transcription vazios) → não chama nada, NONE", async () => {
    const c = seedCheckpoint({ notes: null, transcription: null });
    const r = await extractCheckpointInsights(c.id);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.data.unavailable).toBe(true);
    expect(h.store.checkpoints[0].extractionStatus).toBe("NONE");
  });
});

describe("extractCheckpointInsights — sucesso", () => {
  it("cria N skills/opps/cases PENDING aiGenerated e marca DONE", async () => {
    const c = seedCheckpoint();
    const r = await extractCheckpointInsights(c.id);
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.data.unavailable).toBe(false);
      expect(r.data.skills).toBe(2);
      expect(r.data.opportunities).toBe(1);
      expect(r.data.cases).toBe(1);
    }
    expect(h.store.skillSuggestions).toHaveLength(2);
    expect(h.store.skillSuggestions.every((s) => s.status === "PENDING")).toBe(true);
    expect(h.store.skillSuggestions[0].sourceEntryIds).toEqual([`checkpoint:${c.id}`]);
    expect(h.store.opportunities).toHaveLength(1);
    expect(h.store.opportunities[0]).toMatchObject({
      status: "PENDING",
      aiGenerated: true,
      kind: "EXPANSION",
      priority: "HIGH",
    });
    expect(h.store.cases).toHaveLength(1);
    expect(h.store.cases[0]).toMatchObject({ status: "PENDING", aiGenerated: true });
    expect(h.store.checkpoints[0].extractionStatus).toBe("DONE");
    expect(h.store.checkpoints[0].extractedAt).toBeInstanceOf(Date);
    expect(h.store.aiUsage.some((u) => u.status === "SUCCESS")).toBe(true);
    // auditoria só com contagens, sem corpo cru
    const audit = h.store.audits.find((a) => a.action === "CHECKPOINT_EXTRACTED");
    expect(JSON.stringify(audit)).not.toContain("Terraform");
  });

  it("reprocessar NÃO duplica (descarta PENDING aiGenerated antes)", async () => {
    const c = seedCheckpoint();
    await extractCheckpointInsights(c.id);
    await extractCheckpointInsights(c.id);
    expect(h.store.opportunities).toHaveLength(1);
    expect(h.store.cases).toHaveLength(1);
    // skills via upsert idempotente: também não duplica
    expect(h.store.skillSuggestions).toHaveLength(2);
  });

  it("não descarta candidatos JÁ decididos ao reprocessar", async () => {
    const c = seedCheckpoint();
    await extractCheckpointInsights(c.id);
    // gestor aceita a oportunidade
    h.store.opportunities[0].status = "ACCEPTED";
    await extractCheckpointInsights(c.id);
    // a aceita permanece + a nova PENDING entra
    expect(h.store.opportunities.filter((o) => o.status === "ACCEPTED")).toHaveLength(1);
    expect(h.store.opportunities.filter((o) => o.status === "PENDING")).toHaveLength(1);
  });
});

describe("extractCheckpointInsights — parse inválido", () => {
  it("retorno não-JSON → FAILED + log FAILED + nada criado", async () => {
    h.store.aiResponse = "desculpe, não consegui";
    const c = seedCheckpoint();
    const r = await extractCheckpointInsights(c.id);
    expect(r).toMatchObject({ ok: false, error: "UNEXPECTED" });
    expect(h.store.checkpoints[0].extractionStatus).toBe("FAILED");
    expect(h.store.opportunities).toHaveLength(0);
    expect(h.store.cases).toHaveLength(0);
    expect(h.store.skillSuggestions).toHaveLength(0);
    expect(h.store.aiUsage.some((u) => u.status === "FAILED")).toBe(true);
  });
});

describe("extractCheckpointInsights — RBAC", () => {
  it("fail-closed sem CHECKPOINT.edit (rethrow NEXT_REDIRECT)", async () => {
    h.store.can.edit = false;
    const c = seedCheckpoint();
    await expect(extractCheckpointInsights(c.id)).rejects.toMatchObject({
      digest: "NEXT_REDIRECT",
    });
    expect(h.store.checkpoints[0].extractionStatus).toBe("NONE");
  });

  it("não-autor não processa (FORBIDDEN)", async () => {
    const c = seedCheckpoint({ managerUserId: "pm-2" });
    const r = await extractCheckpointInsights(c.id);
    expect(r).toMatchObject({ ok: false, error: "FORBIDDEN" });
  });
});

describe("decideOpportunity / decideCase — validação humana", () => {
  function seedOpp(over: Partial<OppRec> = {}): OppRec {
    const row: OppRec = {
      id: `opp-${++h.store.seq}`,
      sourceCheckpointId: "chk-1",
      aiGenerated: true,
      status: "PENDING",
      title: "Op",
      kind: "EXPANSION",
      priority: "MEDIUM",
      decidedByUserId: null,
      decidedAt: null,
      ...over,
    };
    h.store.opportunities.push(row);
    return row;
  }
  function seedCase(over: Partial<CaseRec> = {}): CaseRec {
    const row: CaseRec = {
      id: `case-${++h.store.seq}`,
      sourceCheckpointId: "chk-1",
      aiGenerated: true,
      status: "PENDING",
      title: "Cs",
      decidedByUserId: null,
      decidedAt: null,
      ...over,
    };
    h.store.cases.push(row);
    return row;
  }

  it("aceita oportunidade (status + decidedBy + audit)", async () => {
    const o = seedOpp();
    const r = await decideOpportunity({ id: o.id, decision: "ACCEPTED" });
    expect(r).toMatchObject({ ok: true, data: { status: "ACCEPTED" } });
    expect(h.store.opportunities[0].status).toBe("ACCEPTED");
    expect(h.store.opportunities[0].decidedByUserId).toBe("pm-1");
    expect(h.store.audits.some((a) => a.action === "OPPORTUNITY_DECIDED")).toBe(true);
  });

  it("descarta case", async () => {
    const c = seedCase();
    const r = await decideCase({ id: c.id, decision: "DISMISSED" });
    expect(r).toMatchObject({ ok: true, data: { status: "DISMISSED" } });
    expect(h.store.cases[0].status).toBe("DISMISSED");
  });

  it("já decidida → ALREADY_DECIDED", async () => {
    const o = seedOpp({ status: "ACCEPTED" });
    const r = await decideOpportunity({ id: o.id, decision: "DISMISSED" });
    expect(r).toMatchObject({ ok: false, error: "ALREADY_DECIDED" });
  });

  it("inexistente → NOT_FOUND", async () => {
    const r = await decideCase({ id: "nope", decision: "ACCEPTED" });
    expect(r).toMatchObject({ ok: false, error: "NOT_FOUND" });
  });

  it("decisão inválida → INVALID_INPUT", async () => {
    const o = seedOpp();
    // @ts-expect-error decisão fora do enum
    const r = await decideOpportunity({ id: o.id, decision: "MAYBE" });
    expect(r).toMatchObject({ ok: false, error: "INVALID_INPUT" });
  });

  it("RBAC negativo: sem OPPORTUNITY.edit (rethrow NEXT_REDIRECT)", async () => {
    h.store.can.edit = false;
    const o = seedOpp();
    await expect(
      decideOpportunity({ id: o.id, decision: "ACCEPTED" }),
    ).rejects.toMatchObject({ digest: "NEXT_REDIRECT" });
    expect(h.store.opportunities[0].status).toBe("PENDING");
  });

  it("RBAC negativo: sem CASE.edit (rethrow NEXT_REDIRECT)", async () => {
    h.store.can.edit = false;
    const c = seedCase();
    await expect(
      decideCase({ id: c.id, decision: "ACCEPTED" }),
    ).rejects.toMatchObject({ digest: "NEXT_REDIRECT" });
    expect(h.store.cases[0].status).toBe("PENDING");
  });

  // Escopo de ORIGEM: ter OPPORTUNITY/CASE.edit (matriz) NÃO basta. Um gestor do
  // time A não decide um insight cujo checkpoint de origem (PRIVATE do time B)
  // ele não poderia ver. Anti-enumeração: colapsa no MESMO NOT_FOUND de inexistente.
  it("cross-team: insight de checkpoint fora de escopo → NOT_FOUND (não decide)", async () => {
    h.store.sourceCheckpointInScope = false; // checkpoint de origem do time B
    const o = seedOpp({ sourceCheckpointId: "chk-time-b" });
    const r = await decideOpportunity({ id: o.id, decision: "ACCEPTED" });
    expect(r).toMatchObject({ ok: false, error: "NOT_FOUND" });
    expect(h.store.opportunities[0].status).toBe("PENDING");
    expect(h.store.audits.some((a) => a.action === "OPPORTUNITY_DECIDED")).toBe(
      false,
    );
  });

  it("cross-team: case de checkpoint fora de escopo → NOT_FOUND (não decide)", async () => {
    h.store.sourceCheckpointInScope = false;
    const c = seedCase({ sourceCheckpointId: "chk-time-b" });
    const r = await decideCase({ id: c.id, decision: "ACCEPTED" });
    expect(r).toMatchObject({ ok: false, error: "NOT_FOUND" });
    expect(h.store.cases[0].status).toBe("PENDING");
    expect(h.store.audits.some((a) => a.action === "CASE_DECIDED")).toBe(false);
  });

  it("insight SEM sourceCheckpointId decide normalmente (sem checagem de escopo)", async () => {
    h.store.sourceCheckpointInScope = false; // mesmo fora de escopo: não há origem
    const o = seedOpp({ sourceCheckpointId: null });
    const r = await decideOpportunity({ id: o.id, decision: "ACCEPTED" });
    expect(r).toMatchObject({ ok: true, data: { status: "ACCEPTED" } });
  });
});
