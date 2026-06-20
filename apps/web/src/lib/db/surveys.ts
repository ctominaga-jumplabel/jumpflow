import { prisma } from "@jumpflow/database";
import type { AppUser } from "@/lib/auth/types";
import { getConsultantForUser } from "@/lib/db/timesheet";
import { buildSurveyDashboard } from "@/lib/surveys/aggregation";
import { canViewSurveyDashboards } from "@/lib/surveys/visibility";
import type {
  SurveyAssignment,
  SurveyDashboard,
  SurveyFormQuestion,
  SurveyInvitationStatus,
  SurveyStatus,
  SurveySummary,
  SurveyType,
} from "@/lib/surveys/types";
import { isDatabaseConfigured } from "./config";

/**
 * Prisma reads for the Pesquisa de Clima / NPS module (EP 7.1).
 *
 * ANONIMATO É REGRA (docs/backlog-talentos.md §3): the dashboard aggregation
 * NEVER touches identity — it loads only answer values (no consultantId exists
 * on SurveyResponse by design), and the math + disclosure floor live in the
 * pure `lib/surveys/aggregation.ts`. The consultor inbox is scoped strictly to
 * the viewer's OWN invitations; another consultant's invitations/responses can
 * never be reached.
 */

/** Parse the `options` Json column of a CHOICE question into a string[]. */
function parseOptions(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  return raw.filter((v): v is string => typeof v === "string");
}

// ── Gestão: lista de pesquisas (PEOPLE/ADMIN) ───────────────────────────────

/** Resumo de todas as pesquisas para a gestão. */
export async function listSurveys(): Promise<SurveySummary[]> {
  if (!isDatabaseConfigured()) return [];
  const rows = await prisma.survey.findMany({
    select: {
      id: true,
      title: true,
      description: true,
      type: true,
      anonymous: true,
      status: true,
      periodStart: true,
      periodEnd: true,
      _count: { select: { questions: true, responses: true } },
      invitations: { select: { status: true } },
    },
    orderBy: [{ createdAt: "desc" }],
  });
  return rows.map((row) => ({
    id: row.id,
    title: row.title,
    description: row.description,
    type: row.type as SurveyType,
    anonymous: row.anonymous,
    status: row.status as SurveyStatus,
    periodStart: row.periodStart?.toISOString() ?? null,
    periodEnd: row.periodEnd?.toISOString() ?? null,
    questionCount: row._count.questions,
    invitationCount: row.invitations.length,
    answeredCount: row.invitations.filter((i) => i.status === "ANSWERED")
      .length,
    responseCount: row._count.responses,
  }));
}

// ── Responder: caixa de entrada do consultor convidado ──────────────────────

/**
 * Convites do consultor logado (e SÓ dele). RBAC: o escopo é a própria
 * identidade — resolvemos o Consultant vinculado ao usuário e filtramos por
 * consultantId. Nunca expõe convite/resposta de terceiros. Inclui as questões
 * para o formulário, mas nenhuma resposta de ninguém (anonimato).
 */
export async function listMySurveyAssignments(
  user: AppUser,
): Promise<SurveyAssignment[]> {
  if (!isDatabaseConfigured()) return [];
  const consultant = await getConsultantForUser(user);
  if (!consultant?.id) return [];

  const invitations = await prisma.surveyInvitation.findMany({
    where: {
      consultantId: consultant.id,
      survey: { status: { in: ["OPEN", "CLOSED"] } },
    },
    select: {
      id: true,
      status: true,
      survey: {
        select: {
          id: true,
          title: true,
          description: true,
          type: true,
          anonymous: true,
          status: true,
          questions: {
            select: {
              id: true,
              text: true,
              type: true,
              options: true,
              order: true,
            },
            orderBy: { order: "asc" },
          },
        },
      },
    },
    orderBy: { createdAt: "desc" },
  });

  return invitations.map((inv) => {
    const questions: SurveyFormQuestion[] = inv.survey.questions.map((q) => ({
      id: q.id,
      text: q.text,
      type: q.type as SurveyFormQuestion["type"],
      options: parseOptions(q.options),
      order: q.order,
    }));
    return {
      invitationId: inv.id,
      surveyId: inv.survey.id,
      surveyTitle: inv.survey.title,
      surveyDescription: inv.survey.description,
      surveyType: inv.survey.type as SurveyType,
      anonymous: inv.survey.anonymous,
      status: inv.status as SurveyInvitationStatus,
      surveyStatus: inv.survey.status as SurveyStatus,
      questions,
    };
  });
}

// ── Dashboards agregados (PEOPLE/ADMIN/AREA_MANAGER) ─────────────────────────

/**
 * Dashboard agregado de uma pesquisa. RBAC: apenas papéis de dashboard. A
 * agregação é montada por `buildSurveyDashboard` (pura): carregamos apenas os
 * VALORES das respostas por questão — nunca o consultantId (que não existe na
 * SurveyResponse) — e o piso mínimo de exibição é aplicado pela função pura.
 * Retorna null quando a pesquisa não existe.
 */
export async function getSurveyDashboard(
  user: AppUser,
  surveyId: string,
): Promise<SurveyDashboard | null> {
  if (!isDatabaseConfigured()) return null;
  if (!canViewSurveyDashboards(user.roles)) return null;

  const survey = await prisma.survey.findUnique({
    where: { id: surveyId },
    select: {
      id: true,
      title: true,
      type: true,
      status: true,
      anonymous: true,
      _count: { select: { invitations: true, responses: true } },
      questions: {
        select: { id: true, text: true, type: true, options: true, order: true },
        orderBy: { order: "asc" },
      },
    },
  });
  if (!survey) return null;

  // Carrega SOMENTE os valores das respostas por questão. Nenhuma identidade é
  // selecionada (SurveyResponse não tem consultantId; ignoramos invitationId de
  // propósito — não correlacionamos resposta x convite no agregado).
  const answers = await prisma.surveyAnswer.findMany({
    where: { response: { surveyId } },
    select: {
      questionId: true,
      scoreValue: true,
      choiceValue: true,
    },
  });

  const scoresByQuestion = new Map<string, number[]>();
  const choicesByQuestion = new Map<string, string[]>();
  for (const a of answers) {
    if (typeof a.scoreValue === "number") {
      const list = scoresByQuestion.get(a.questionId) ?? [];
      list.push(a.scoreValue);
      scoresByQuestion.set(a.questionId, list);
    }
    if (typeof a.choiceValue === "string") {
      const list = choicesByQuestion.get(a.questionId) ?? [];
      list.push(a.choiceValue);
      choicesByQuestion.set(a.questionId, list);
    }
  }

  return buildSurveyDashboard({
    surveyId: survey.id,
    surveyTitle: survey.title,
    surveyType: survey.type as SurveyType,
    status: survey.status as SurveyStatus,
    anonymous: survey.anonymous,
    invitationCount: survey._count.invitations,
    responseCount: survey._count.responses,
    questions: survey.questions.map((q) => ({
      id: q.id,
      text: q.text,
      type: q.type as "SCALE" | "NPS" | "TEXT" | "CHOICE",
      options: parseOptions(q.options),
      scores: scoresByQuestion.get(q.id) ?? [],
      choices: choicesByQuestion.get(q.id) ?? [],
    })),
  });
}

/** Consultores ativos para gerar convites ao abrir a pesquisa (público-alvo). */
export async function listActiveConsultantsForSurvey(): Promise<
  { id: string }[]
> {
  if (!isDatabaseConfigured()) return [];
  const rows = await prisma.consultant.findMany({
    where: { status: "ACTIVE" },
    select: { id: true },
    orderBy: { name: "asc" },
  });
  return rows.map((r) => ({ id: r.id }));
}
