import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Escopo de DONO da aba "Meu Curriculo" (EP-M06 / US-M06.03).
 *
 * Prova que:
 *  - a resolucao consultor-por-usuario e feita no servidor (getConsultantForUser
 *    a partir do usuario logado); o cliente NUNCA informa o consultantId;
 *  - saveMyCurriculumBio grava SEMPRE no consultor do usuario logado, mesmo que
 *    o payload tente injetar um consultantId de terceiro (ele e ignorado);
 *  - usuario SEM consultant vinculado recebe NO_CONSULTANT (nunca vaza/edita
 *    curriculo de outra pessoa);
 *  - a bio propria e auditada (CONSULTANT_CURRICULUM_BIO_SELF_SAVED).
 *
 * Mock de Prisma em memoria no padrao de clima/despesas.
 */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Where = Record<string, any>;

interface ConsultantRec {
  id: string;
  userId: string | null;
  curriculumHeadline: string | null;
  curriculumSummary: string | null;
}

const h = vi.hoisted(() => {
  const store = {
    consultants: [] as ConsultantRec[],
    audits: [] as Record<string, unknown>[],
    currentUser: {
      id: "user-1",
      name: "Bia Souza",
      email: "bia@jumplabel.com.br",
      roles: ["CONSULTANT"] as string[],
    },
    // O consultant resolvido para o usuario logado (null = sem cadastro).
    resolvedConsultant: null as ConsultantRec | null,
    seq: 0,
  };

  const prismaMock = {
    consultant: {
      update: async ({ where, data }: { where: Where; data: Where }) => {
        const row = store.consultants.find((c) => c.id === where.id);
        if (!row) throw new Error("consultant not found");
        if ("curriculumHeadline" in data) row.curriculumHeadline = data.curriculumHeadline;
        if ("curriculumSummary" in data) row.curriculumSummary = data.curriculumSummary;
        return { ...row };
      },
    },
    auditEvent: {
      create: async ({ data }: { data: Record<string, unknown> }) => {
        store.audits.push(data);
        return { id: `audit-${++store.seq}` };
      },
    },
    $transaction: async (fn: (tx: unknown) => Promise<unknown>) => fn(prismaMock),
  };

  return { store, prismaMock };
});

vi.mock("@jumpflow/database", () => ({
  prisma: h.prismaMock,
  Prisma: {
    PrismaClientKnownRequestError: class extends Error {
      code = "";
    },
  },
}));

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

vi.mock("@/lib/db/config", () => ({ isDatabaseConfigured: () => true }));

vi.mock("@/lib/auth/guards", () => ({
  requireUser: vi.fn(async () => h.store.currentUser),
  requireRole: vi.fn(async () => h.store.currentUser),
}));

vi.mock("@/lib/db/timesheet", () => ({
  // Resolucao de dono: SEMPRE devolve o consultant vinculado ao usuario logado.
  getConsultantForUser: vi.fn(async () => h.store.resolvedConsultant),
}));

vi.mock("@/lib/db/users", () => ({
  resolveDbUser: vi.fn(async () => ({ id: h.store.currentUser.id })),
}));

vi.mock("@/lib/db/audit", () => ({
  buildAuditEventData: (data: Record<string, unknown>) => data,
}));

vi.mock("@/lib/consultants/curriculum", () => ({
  buildConsultantCurriculum: vi.fn(async (consultantId: string) => ({
    consultantId,
    generatedAt: "2026-07-03T00:00:00.000Z",
    identity: {
      name: "Bia Souza",
      jobTitle: null,
      seniority: "Pleno",
      area: null,
      headline: null,
      summary: null,
    },
    education: [],
    languages: [],
    skills: [],
    certificates: [],
    projects: [],
    highlights: [],
  })),
}));

import { loadMyCurriculum, saveMyCurriculumBio } from "./actions";

const MINE: ConsultantRec = {
  id: "con-mine",
  userId: "user-1",
  curriculumHeadline: null,
  curriculumSummary: null,
};
const SOMEONE_ELSE: ConsultantRec = {
  id: "con-other",
  userId: "user-2",
  curriculumHeadline: "Alheio",
  curriculumSummary: "Bio de outra pessoa",
};

beforeEach(() => {
  h.store.consultants = [
    { ...MINE },
    { ...SOMEONE_ELSE },
  ];
  h.store.audits = [];
  h.store.resolvedConsultant = { ...MINE };
  h.store.seq = 0;
});

afterEach(() => {
  vi.clearAllMocks();
});

describe("loadMyCurriculum — escopo de dono", () => {
  it("carrega o curriculo do consultor resolvido do usuario logado", async () => {
    const result = await loadMyCurriculum();
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data.curriculum.consultantId).toBe("con-mine");
    }
  });

  it("retorna NO_CONSULTANT quando o usuario nao tem cadastro de consultor", async () => {
    h.store.resolvedConsultant = null;
    const result = await loadMyCurriculum();
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toBe("NO_CONSULTANT");
  });
});

describe("saveMyCurriculumBio — escopo de dono", () => {
  it("grava a bio do PROPRIO consultor", async () => {
    const result = await saveMyCurriculumBio({
      headline: "Engenheira de dados",
      summary: "Resumo profissional.",
    });
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.data.consultantId).toBe("con-mine");

    const mine = h.store.consultants.find((c) => c.id === "con-mine")!;
    expect(mine.curriculumHeadline).toBe("Engenheira de dados");
    expect(mine.curriculumSummary).toBe("Resumo profissional.");
  });

  it("audita a edicao da propria bio", async () => {
    await saveMyCurriculumBio({ headline: "Nova bio", summary: undefined });
    expect(h.store.audits).toHaveLength(1);
    expect(h.store.audits[0]).toMatchObject({
      entityType: "Consultant",
      entityId: "con-mine",
      action: "CONSULTANT_CURRICULUM_BIO_SELF_SAVED",
    });
  });

  it("IGNORA consultantId de terceiro no payload e nunca edita a bio alheia", async () => {
    // Payload malicioso tentando gravar no consultant de outra pessoa. O
    // consultantId nao faz parte do schema (pick de headline/summary) e o
    // servidor usa sempre o consultor resolvido do usuario logado.
    // Objeto em variavel (nao literal): o consultantId extra passa pela checagem
    // estrutural, simulando um payload que tenta injetar o alvo. O servidor
    // ignora — usa sempre o consultor resolvido do usuario logado.
    const payload = {
      consultantId: "con-other",
      headline: "Tentativa de sequestro",
      summary: undefined,
    };
    const result = await saveMyCurriculumBio(payload);
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.data.consultantId).toBe("con-mine");

    // A bio da outra pessoa permanece INTACTA.
    const other = h.store.consultants.find((c) => c.id === "con-other")!;
    expect(other.curriculumHeadline).toBe("Alheio");
    expect(other.curriculumSummary).toBe("Bio de outra pessoa");

    // A minha foi atualizada.
    const mine = h.store.consultants.find((c) => c.id === "con-mine")!;
    expect(mine.curriculumHeadline).toBe("Tentativa de sequestro");
  });

  it("rejeita salvar quando o usuario nao tem consultant vinculado", async () => {
    h.store.resolvedConsultant = null;
    const result = await saveMyCurriculumBio({ headline: "x", summary: undefined });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toBe("NO_CONSULTANT");
    // Nenhuma bio foi tocada.
    expect(
      h.store.consultants.every(
        (c) => c.curriculumHeadline === MINE.curriculumHeadline || c.id === "con-other",
      ),
    ).toBe(true);
  });

  it("rejeita headline acima do limite (INVALID_INPUT)", async () => {
    const result = await saveMyCurriculumBio({ headline: "a".repeat(161), summary: undefined });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toBe("INVALID_INPUT");
  });
});
