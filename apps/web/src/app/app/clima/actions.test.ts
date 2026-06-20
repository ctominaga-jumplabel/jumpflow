import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Server-action tests for the Pesquisa de Clima submit flow, focused on the
 * anonimato hardening (docs/backlog-talentos.md §3, revisão P2):
 *  - pesquisa ANÔNIMA: SurveyResponse.submittedAt truncado ao dia (UTC) e NENHUM
 *    AuditEvent de correlação (convite/consultor x ato de responder);
 *  - pesquisa NÃO anônima: submittedAt com timestamp fino e auditoria normal.
 *
 * In-memory Prisma mock no mesmo padrão de despesas/horas: honra só as
 * where-shapes que a action emite.
 */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Where = Record<string, any>;

interface InvitationRec {
  id: string;
  consultantId: string;
  status: "PENDING" | "ANSWERED" | "EXPIRED";
  respondedAt: Date | null;
  survey: {
    id: string;
    anonymous: boolean;
    status: "DRAFT" | "OPEN" | "CLOSED";
    questions: { id: string; type: string; options: unknown }[];
  };
}

interface ResponseRec {
  id: string;
  surveyId: string;
  invitationId: string | null;
  submittedAt: Date;
}

const h = vi.hoisted(() => {
  const store = {
    invitations: [] as InvitationRec[],
    responses: [] as ResponseRec[],
    audits: [] as Record<string, unknown>[],
    currentUser: {
      id: "dev-user",
      name: "Bia Souza",
      email: "bia@jumplabel.com.br",
      roles: ["CONSULTANT"] as string[],
    },
    consultant: { id: "con-1" } as { id: string } | null,
    seq: 0,
  };

  const nextId = (prefix: string) => `${prefix}-${++store.seq}`;

  const prismaMock = {
    surveyInvitation: {
      findUnique: async ({ where }: { where: Where }) => {
        const inv = store.invitations.find((i) => i.id === where.id);
        if (!inv) return null;
        return {
          id: inv.id,
          consultantId: inv.consultantId,
          status: inv.status,
          survey: {
            id: inv.survey.id,
            anonymous: inv.survey.anonymous,
            status: inv.survey.status,
            questions: inv.survey.questions.map((q) => ({ ...q })),
          },
        };
      },
      updateMany: async ({ where, data }: { where: Where; data: Where }) => {
        const matched = store.invitations.filter(
          (i) => i.id === where.id && i.status === where.status,
        );
        for (const inv of matched) {
          inv.status = data.status;
          inv.respondedAt = data.respondedAt;
        }
        return { count: matched.length };
      },
    },
    surveyResponse: {
      create: async ({ data }: { data: Where }) => {
        const rec: ResponseRec = {
          id: nextId("resp"),
          surveyId: data.surveyId,
          invitationId: data.invitationId ?? null,
          submittedAt: data.submittedAt,
        };
        store.responses.push(rec);
        return { ...rec };
      },
    },
    auditEvent: {
      create: async ({ data }: { data: Record<string, unknown> }) => {
        store.audits.push(data);
        return data;
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

vi.mock("@/lib/db/config", () => ({ isDatabaseConfigured: () => true }));

vi.mock("@/lib/auth/guards", () => ({
  requireUser: vi.fn(async () => h.store.currentUser),
  requireRole: vi.fn(async () => h.store.currentUser),
}));

vi.mock("@/lib/db/timesheet", () => ({
  getConsultantForUser: vi.fn(async () => h.store.consultant),
}));

vi.mock("@/lib/db/users", () => ({
  resolveDbUser: vi.fn(async () => ({ id: h.store.currentUser.id })),
}));

vi.mock("@/lib/db/surveys", () => ({
  listActiveConsultantsForSurvey: vi.fn(async () => []),
}));

import { submitSurveyResponse } from "./actions";

function seedInvitation(over: Partial<InvitationRec["survey"]> = {}): InvitationRec {
  const inv: InvitationRec = {
    id: `inv-${++h.store.seq}`,
    consultantId: "con-1",
    status: "PENDING",
    respondedAt: null,
    survey: {
      id: `survey-${h.store.seq}`,
      anonymous: true,
      status: "OPEN",
      questions: [{ id: `q-${h.store.seq}`, type: "SCALE", options: [] }],
      ...over,
    },
  };
  h.store.invitations.push(inv);
  return inv;
}

beforeEach(() => {
  h.store.invitations = [];
  h.store.responses = [];
  h.store.audits = [];
  h.store.consultant = { id: "con-1" };
  h.store.seq = 0;
  vi.useFakeTimers();
  // Instante com hora/min/seg/ms não-zero, para provar a truncagem.
  vi.setSystemTime(new Date("2026-06-19T13:47:31.456Z"));
});

afterEach(() => {
  vi.useRealTimers();
  vi.clearAllMocks();
});

describe("submitSurveyResponse — anonimato", () => {
  it("pesquisa ANÔNIMA: grava submittedAt truncado ao dia (UTC) e NÃO audita", async () => {
    const inv = seedInvitation({ anonymous: true });

    const result = await submitSurveyResponse({
      invitationId: inv.id,
      answers: [
        {
          questionId: inv.survey.questions[0].id,
          scoreValue: 4,
          choiceValue: undefined,
          textValue: undefined,
        },
      ],
    });

    expect(result.ok).toBe(true);
    expect(h.store.responses).toHaveLength(1);

    const response = h.store.responses[0];
    // Truncado ao dia em UTC (zerado hora/min/seg/ms).
    expect(response.submittedAt.toISOString()).toBe("2026-06-19T00:00:00.000Z");
    // Anonimato: sem vínculo reverso ao convite.
    expect(response.invitationId).toBeNull();

    // Nenhum AuditEvent de correlação em pesquisa anônima.
    expect(h.store.audits).toHaveLength(0);

    // O registro mínimo de "quem respondeu" continua sendo o status do convite.
    expect(h.store.invitations[0].status).toBe("ANSWERED");
  });

  it("pesquisa NÃO anônima: submittedAt com timestamp fino e auditoria normal", async () => {
    const inv = seedInvitation({ anonymous: false });

    const result = await submitSurveyResponse({
      invitationId: inv.id,
      answers: [
        {
          questionId: inv.survey.questions[0].id,
          scoreValue: 4,
          choiceValue: undefined,
          textValue: undefined,
        },
      ],
    });

    expect(result.ok).toBe(true);
    expect(h.store.responses).toHaveLength(1);

    const response = h.store.responses[0];
    // Timestamp fino preservado (não truncado).
    expect(response.submittedAt.toISOString()).toBe("2026-06-19T13:47:31.456Z");
    // Em não-anônima o vínculo via invitationId é permitido.
    expect(response.invitationId).toBe(inv.id);

    // Auditoria normal da mudança do convite (sem conteúdo da resposta).
    expect(h.store.audits).toHaveLength(1);
    const audit = h.store.audits[0] as {
      entityType: string;
      action: string;
      after: { anonymous: boolean };
    };
    expect(audit.entityType).toBe("SurveyInvitation");
    expect(audit.action).toBe("SURVEY_RESPONSE_SUBMITTED");
    expect(audit.after.anonymous).toBe(false);
  });
});
