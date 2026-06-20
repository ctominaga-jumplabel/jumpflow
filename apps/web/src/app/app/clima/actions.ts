"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@jumpflow/database";
import type { ZodType } from "zod";
import type { ActionResult, ErrorCode } from "@/lib/actions/result";
import { requireRole, requireUser } from "@/lib/auth/guards";
import { recordAuditEvent } from "@/lib/db/audit";
import { isDatabaseConfigured } from "@/lib/db/config";
import { listActiveConsultantsForSurvey } from "@/lib/db/surveys";
import { getConsultantForUser } from "@/lib/db/timesheet";
import { resolveDbUser } from "@/lib/db/users";
import { generateSurveyToken } from "@/lib/surveys/token";
import {
  buildAnonymousSurveyResponse,
  invitationCanRespond,
  nextInvitationStatusOnSubmit,
  type AnonymousAnswerInput,
} from "@/lib/surveys/anonymity";
import {
  SURVEY_MANAGE_ROLES,
  isValidSurveyTransition,
} from "@/lib/surveys/visibility";
import {
  surveyCreateSchema,
  surveySubmitSchema,
  surveyTransitionSchema,
  type SurveyCreateInput,
  type SurveySubmitInput,
  type SurveyTransitionInput,
} from "@/lib/surveys/schemas";

const CLIMA_PATH = "/app/clima";

class ActionError extends Error {
  constructor(
    readonly code: ErrorCode,
    message: string,
  ) {
    super(message);
  }
}

function ensureDatabase(): void {
  if (!isDatabaseConfigured()) {
    throw new ActionError(
      "NO_DATABASE",
      "Banco de dados nao configurado para pesquisas de clima.",
    );
  }
}

function parseInput<T>(schema: ZodType<T>, input: unknown): T {
  const result = schema.safeParse(input);
  if (!result.success) {
    throw new ActionError("INVALID_INPUT", "Revise os campos informados.");
  }
  return result.data;
}

function toFailure(error: unknown): ActionResult<never> {
  // Nunca engolir o control-flow do framework (redirect/notFound dos guards).
  if (
    typeof error === "object" &&
    error !== null &&
    "digest" in error &&
    typeof (error as { digest?: unknown }).digest === "string" &&
    (error as { digest: string }).digest.startsWith("NEXT_")
  ) {
    throw error;
  }
  if (error instanceof ActionError) {
    return { ok: false, error: error.code, message: error.message };
  }
  console.error("[surveys action] unexpected error", error);
  return {
    ok: false,
    error: "UNEXPECTED",
    message: "Nao foi possivel concluir a acao.",
  };
}

async function audit(
  entityType: string,
  entityId: string,
  action: string,
  before: unknown,
  after: unknown,
) {
  const user = await requireUser();
  const dbUser = await resolveDbUser(user);
  await recordAuditEvent({
    actorUserId: dbUser?.id ?? null,
    entityType,
    entityId,
    action,
    before,
    after,
  });
}

function toUtcDate(iso: string): Date {
  return new Date(`${iso}T00:00:00.000Z`);
}

/**
 * Trunca um instante ao DIA em UTC (zera hora/min/seg/ms). Usado em pesquisa
 * ANONIMA: gravar SurveyResponse.submittedAt no dia reduz a correlacao por
 * proximidade temporal com SurveyInvitation.respondedAt (que mantem timestamp
 * fino). Sem isso, dois timestamps quase iguais permitiriam reidentificar quem
 * respondeu cruzando resposta x convite.
 */
function truncateToUtcDay(date: Date): Date {
  return new Date(
    Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()),
  );
}

// ── Criar pesquisa (gestão — PEOPLE/ADMIN) ──────────────────────────────────

export async function createSurvey(
  input: SurveyCreateInput,
): Promise<ActionResult<{ id: string }>> {
  try {
    ensureDatabase();
    await requireRole(SURVEY_MANAGE_ROLES);
    const parsed = parseInput(surveyCreateSchema, input);
    const user = await requireUser();
    const dbUser = await resolveDbUser(user);

    const survey = await prisma.survey.create({
      data: {
        title: parsed.title,
        description: parsed.description ?? null,
        type: parsed.type,
        anonymous: parsed.anonymous,
        status: "DRAFT",
        periodStart: parsed.periodStart ? toUtcDate(parsed.periodStart) : null,
        periodEnd: parsed.periodEnd ? toUtcDate(parsed.periodEnd) : null,
        createdByUserId: dbUser?.id ?? null,
        questions: {
          create: parsed.questions.map((q, index) => ({
            text: q.text,
            type: q.type,
            options: q.type === "CHOICE" ? q.options : undefined,
            order: index,
          })),
        },
      },
      select: { id: true },
    });

    await audit("Survey", survey.id, "SURVEY_CREATED", null, {
      title: parsed.title,
      type: parsed.type,
      anonymous: parsed.anonymous,
      status: "DRAFT",
      questionCount: parsed.questions.length,
    });
    revalidatePath(CLIMA_PATH);
    return { ok: true, data: { id: survey.id } };
  } catch (error) {
    return toFailure(error);
  }
}

// ── Abrir / fechar pesquisa ─────────────────────────────────────────────────

/**
 * Ao ABRIR (DRAFT→OPEN), gera um SurveyInvitation por consultor ativo
 * (público-alvo) com tokenHash único (digest sha256 do token cru, nunca o
 * token em si). Idempotente sob reabertura: skipDuplicates + @@unique
 * (surveyId, consultantId) impede duplicar convites.
 */
async function openSurvey(surveyId: string): Promise<number> {
  const consultants = await listActiveConsultantsForSurvey();

  await prisma.$transaction(async (tx) => {
    const existing = await tx.surveyInvitation.findMany({
      where: { surveyId },
      select: { consultantId: true },
    });
    const have = new Set(existing.map((e) => e.consultantId));
    const toCreate = consultants
      .filter((c) => !have.has(c.id))
      .map((c) => ({
        surveyId,
        consultantId: c.id,
        // tokenHash: só o digest é persistido (padrão UserInvitation). O token
        // cru é descartado — não há fluxo de link público no MVP.
        tokenHash: generateSurveyToken().tokenHash,
        status: "PENDING" as const,
      }));
    if (toCreate.length > 0) {
      await tx.surveyInvitation.createMany({
        data: toCreate,
        skipDuplicates: true,
      });
    }
    await tx.survey.update({
      where: { id: surveyId },
      data: { status: "OPEN" },
    });
  });

  return consultants.length;
}

export async function transitionSurvey(
  input: SurveyTransitionInput,
): Promise<ActionResult<{ status: "OPEN" | "CLOSED" }>> {
  try {
    ensureDatabase();
    await requireRole(SURVEY_MANAGE_ROLES);
    const parsed = parseInput(surveyTransitionSchema, input);
    const survey = await prisma.survey.findUnique({
      where: { id: parsed.id },
      select: { id: true, status: true },
    });
    if (!survey) throw new ActionError("NOT_FOUND", "Pesquisa nao encontrada.");
    const from = survey.status as "DRAFT" | "OPEN" | "CLOSED";
    if (!isValidSurveyTransition(from, parsed.to)) {
      throw new ActionError(
        "INVALID_INPUT",
        "Transicao de status invalida (DRAFT -> OPEN -> CLOSED).",
      );
    }

    if (parsed.to === "OPEN") {
      const count = await openSurvey(survey.id);
      await audit(
        "Survey",
        survey.id,
        "SURVEY_OPENED",
        { status: from },
        { status: "OPEN", invitationsGenerated: count },
      );
    } else {
      await prisma.survey.update({
        where: { id: survey.id },
        data: { status: "CLOSED" },
      });
      await audit(
        "Survey",
        survey.id,
        "SURVEY_CLOSED",
        { status: from },
        { status: "CLOSED" },
      );
    }
    revalidatePath(CLIMA_PATH);
    return { ok: true, data: { status: parsed.to } };
  } catch (error) {
    return toFailure(error);
  }
}

// ── Submeter resposta (consultor convidado) ─────────────────────────────────

/**
 * US: responder a pesquisa UMA vez, respeitando o anonimato.
 *
 * Fronteiras (servidor):
 *  - Só o próprio convidado responde: validamos que o invitation pertence ao
 *    Consultant vinculado ao usuário logado.
 *  - Só com survey OPEN + invitation PENDING (resposta única).
 *  - Em pesquisa ANÔNIMA, a SurveyResponse é criada SEM invitationId (via
 *    buildAnonymousSurveyResponse), e o invitation só é marcado ANSWERED — sem
 *    nenhum vínculo gravado entre resposta e identidade.
 *  - Validamos cada answer contra o tipo real da questão (não confiamos no
 *    cliente). Tudo numa transação para impedir corrida de dupla submissão.
 */
export async function submitSurveyResponse(
  input: SurveySubmitInput,
): Promise<ActionResult<{ ok: true }>> {
  try {
    ensureDatabase();
    const user = await requireUser();
    const parsed = parseInput(surveySubmitSchema, input);

    const consultant = await getConsultantForUser(user);
    if (!consultant?.id) {
      throw new ActionError(
        "NO_CONSULTANT",
        "Apenas consultores convidados podem responder.",
      );
    }

    const invitation = await prisma.surveyInvitation.findUnique({
      where: { id: parsed.invitationId },
      select: {
        id: true,
        consultantId: true,
        status: true,
        survey: {
          select: {
            id: true,
            anonymous: true,
            status: true,
            questions: {
              select: { id: true, type: true, options: true },
            },
          },
        },
      },
    });
    if (!invitation) {
      throw new ActionError("NOT_FOUND", "Convite nao encontrado.");
    }
    // RBAC (anonimato/escopo): o convite tem de ser DESTE consultor. Nunca
    // permitimos responder pelo convite de outro — o servidor é a fronteira.
    if (invitation.consultantId !== consultant.id) {
      throw new ActionError(
        "FORBIDDEN",
        "Voce so pode responder o convite atribuido a voce.",
      );
    }
    if (invitation.survey.status !== "OPEN") {
      throw new ActionError(
        "NOT_EDITABLE",
        "A pesquisa nao esta aberta para respostas.",
      );
    }
    if (!invitationCanRespond(invitation.status as "PENDING")) {
      throw new ActionError(
        "ALREADY_DECIDED",
        "Voce ja respondeu esta pesquisa.",
      );
    }

    // Valida cada answer contra o tipo real da questão (defensivo).
    const questionById = new Map(
      invitation.survey.questions.map((q) => [q.id, q]),
    );
    const answers: AnonymousAnswerInput[] = [];
    for (const a of parsed.answers) {
      const q = questionById.get(a.questionId);
      if (!q) {
        throw new ActionError("INVALID_INPUT", "Pergunta desconhecida.");
      }
      if (q.type === "SCALE") {
        if (a.scoreValue === undefined || a.scoreValue < 1 || a.scoreValue > 5) {
          throw new ActionError("INVALID_INPUT", "Nota de escala invalida (1-5).");
        }
        answers.push({
          questionId: q.id,
          scoreValue: a.scoreValue,
          choiceValue: null,
          textValue: null,
        });
      } else if (q.type === "NPS") {
        if (a.scoreValue === undefined || a.scoreValue < 0 || a.scoreValue > 10) {
          throw new ActionError("INVALID_INPUT", "Nota NPS invalida (0-10).");
        }
        answers.push({
          questionId: q.id,
          scoreValue: a.scoreValue,
          choiceValue: null,
          textValue: null,
        });
      } else if (q.type === "CHOICE") {
        const options = Array.isArray(q.options)
          ? (q.options as unknown[]).filter(
              (v): v is string => typeof v === "string",
            )
          : [];
        if (!a.choiceValue || !options.includes(a.choiceValue)) {
          throw new ActionError("INVALID_INPUT", "Escolha invalida.");
        }
        answers.push({
          questionId: q.id,
          scoreValue: null,
          choiceValue: a.choiceValue,
          textValue: null,
        });
      } else {
        // TEXT: opcional; só grava se veio conteúdo.
        if (a.textValue) {
          answers.push({
            questionId: q.id,
            scoreValue: null,
            choiceValue: null,
            textValue: a.textValue,
          });
        }
      }
    }

    if (answers.length === 0) {
      throw new ActionError("NOTHING_TO_SUBMIT", "Responda ao menos uma pergunta.");
    }

    // Monta a resposta de forma anônima-segura (sem identidade; invitationId
    // nulo em pesquisa anônima) ANTES de qualquer I/O. Em pesquisa ANÔNIMA o
    // submittedAt é truncado ao dia (UTC) para não correlacionar por proximidade
    // temporal com o respondedAt fino do convite; em não-anônima mantém o
    // timestamp normal.
    const now = new Date();
    const responseData = buildAnonymousSurveyResponse({
      surveyId: invitation.survey.id,
      anonymous: invitation.survey.anonymous,
      invitationId: invitation.id,
      submittedAt: invitation.survey.anonymous ? truncateToUtcDay(now) : now,
      answers,
    });

    await prisma.$transaction(async (tx) => {
      // Marca ANSWERED com guarda @unique-status: a segunda submissão falha.
      const marked = await tx.surveyInvitation.updateMany({
        where: { id: invitation.id, status: "PENDING" },
        data: {
          status: nextInvitationStatusOnSubmit("PENDING"),
          respondedAt: new Date(),
        },
      });
      if (marked.count !== 1) {
        // Perdeu a corrida: outra submissão chegou primeiro.
        throw new ActionError(
          "ALREADY_DECIDED",
          "Voce ja respondeu esta pesquisa.",
        );
      }
      await tx.surveyResponse.create({ data: responseData });
    });

    // Auditoria (LGPD): em pesquisa ANÔNIMA NÃO registramos AuditEvent algum no
    // submit — o AuditEvent carrega actorUserId/timestamp fino e correlacionaria
    // o ato de responder à identidade do consultor. O registro mínimo necessário
    // já é o invitation.status = ANSWERED. Em pesquisa NÃO anônima auditamos
    // normalmente a MUDANÇA do convite (respondeu), NUNCA o conteúdo da resposta.
    if (!invitation.survey.anonymous) {
      await audit(
        "SurveyInvitation",
        invitation.id,
        "SURVEY_RESPONSE_SUBMITTED",
        { status: "PENDING" },
        { status: "ANSWERED", anonymous: false },
      );
    }
    revalidatePath(CLIMA_PATH);
    return { ok: true, data: { ok: true } };
  } catch (error) {
    return toFailure(error);
  }
}
