"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@jumpflow/database";
import type { ZodType } from "zod";
import type { ActionResult, ErrorCode } from "@/lib/actions/result";
import { requireRole, requireUser } from "@/lib/auth/guards";
import { recordAuditEvent } from "@/lib/db/audit";
import { isDatabaseConfigured } from "@/lib/db/config";
import { resolveDbUser } from "@/lib/db/users";
import {
  listActiveConsultantsForCycle,
  resolveManagerUserId,
} from "@/lib/db/evaluations";
import { relationshipsForType } from "@/lib/evaluations/responses";
import {
  EVALUATION_MANAGE_ROLES,
  canAnswerResponse,
  isValidCycleTransition,
  responseIsEditable,
} from "@/lib/evaluations/visibility";
import {
  cycleCreateSchema,
  cycleTransitionSchema,
  responseSaveSchema,
  type CycleCreateInput,
  type CycleTransitionInput,
  type ResponseSaveInput,
} from "@/lib/evaluations/schemas";
import type { EvaluationRelationship } from "@/lib/evaluations/types";

const AVALIACOES_PATH = "/app/avaliacoes";

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
      "Banco de dados nao configurado para avaliacoes.",
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
  console.error("[evaluations action] unexpected error", error);
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

// ── Criar ciclo (US16.01) ───────────────────────────────────────────────────

export async function createCycle(
  input: CycleCreateInput,
): Promise<ActionResult<{ id: string }>> {
  try {
    ensureDatabase();
    await requireRole(EVALUATION_MANAGE_ROLES);
    const parsed = parseInput(cycleCreateSchema, input);
    const user = await requireUser();
    const dbUser = await resolveDbUser(user);
    const data = {
      name: parsed.name,
      type: parsed.type,
      periodStart: new Date(`${parsed.periodStart}T00:00:00.000Z`),
      periodEnd: new Date(`${parsed.periodEnd}T00:00:00.000Z`),
      status: "DRAFT" as const,
      createdByUserId: dbUser?.id ?? null,
    };
    const cycle = await prisma.evaluationCycle.create({ data });
    await audit("EvaluationCycle", cycle.id, "EVALUATION_CYCLE_CREATED", null, {
      name: data.name,
      type: data.type,
      periodStart: parsed.periodStart,
      periodEnd: parsed.periodEnd,
      status: data.status,
    });
    revalidatePath(AVALIACOES_PATH);
    return { ok: true, data: { id: cycle.id } };
  } catch (error) {
    return toFailure(error);
  }
}

// ── Transição de status: abrir e fechar (US16.01 + US16.02) ─────────────────

/**
 * Ao ABRIR (DRAFT→OPEN), gera as Evaluation dos consultores ativos e as
 * EvaluationResponse conforme o tipo do ciclo (relationshipsForType). É
 * idempotente: skipDuplicates não recria avaliações/respostas se a abertura for
 * reexecutada. A SELF aponta para o userId do consultor; a MANAGER tenta o
 * gestor de um projeto alocado; PEER/CLIENT ficam sem rater (PEOPLE designa).
 */
async function openCycle(cycleId: string, type: CycleCreateInput["type"]) {
  const consultants = await listActiveConsultantsForCycle();
  const relationships = relationshipsForType(type);

  await prisma.$transaction(async (tx) => {
    // 1) Garante uma Evaluation por consultor (única por ciclo+consultor).
    await tx.evaluation.createMany({
      data: consultants.map((c) => ({
        cycleId,
        subjectConsultantId: c.id,
      })),
      skipDuplicates: true,
    });
    await tx.evaluationCycle.update({
      where: { id: cycleId },
      data: { status: "OPEN" },
    });

    // 2) Para cada avaliação, garante uma resposta por relacionamento. O
    //    @@unique (evaluation, relationship) torna a criação idempotente via
    //    skipDuplicates (trava de corrida sob reabertura concorrente); o check
    //    de leitura abaixo evita recalcular rater para o que já existe.
    const evaluations = await tx.evaluation.findMany({
      where: { cycleId },
      select: { id: true, subjectConsultantId: true },
    });
    for (const ev of evaluations) {
      const existing = await tx.evaluationResponse.findMany({
        where: { evaluationId: ev.id },
        select: { relationship: true },
      });
      const have = new Set(existing.map((e) => e.relationship));
      const consultant = consultants.find(
        (c) => c.id === ev.subjectConsultantId,
      );
      const toCreate: {
        evaluationId: string;
        relationship: EvaluationRelationship;
        raterUserId: string | null;
      }[] = [];
      for (const rel of relationships) {
        if (have.has(rel)) continue;
        let raterUserId: string | null = null;
        if (rel === "SELF") {
          raterUserId = consultant?.userId ?? null;
        } else if (rel === "MANAGER") {
          raterUserId = await resolveManagerUserId(ev.subjectConsultantId);
        }
        // PEER/CLIENT: sem rater designado na abertura (designação manual).
        toCreate.push({ evaluationId: ev.id, relationship: rel, raterUserId });
      }
      if (toCreate.length > 0) {
        await tx.evaluationResponse.createMany({
          data: toCreate,
          skipDuplicates: true,
        });
      }
    }
  });

  return consultants.length;
}

export async function transitionCycle(
  input: CycleTransitionInput,
): Promise<ActionResult<{ status: "OPEN" | "CLOSED" }>> {
  try {
    ensureDatabase();
    await requireRole(EVALUATION_MANAGE_ROLES);
    const parsed = parseInput(cycleTransitionSchema, input);
    const cycle = await prisma.evaluationCycle.findUnique({
      where: { id: parsed.id },
      select: { id: true, status: true, type: true },
    });
    if (!cycle) throw new ActionError("NOT_FOUND", "Ciclo nao encontrado.");
    const from = cycle.status as "DRAFT" | "OPEN" | "CLOSED";
    if (!isValidCycleTransition(from, parsed.to)) {
      throw new ActionError(
        "INVALID_INPUT",
        "Transicao de status invalida (DRAFT -> OPEN -> CLOSED).",
      );
    }

    if (parsed.to === "OPEN") {
      const count = await openCycle(
        cycle.id,
        cycle.type as CycleCreateInput["type"],
      );
      await audit(
        "EvaluationCycle",
        cycle.id,
        "EVALUATION_CYCLE_OPENED",
        { status: from },
        { status: "OPEN", evaluationsGenerated: count },
      );
    } else {
      await prisma.evaluationCycle.update({
        where: { id: cycle.id },
        data: { status: "CLOSED" },
      });
      await audit(
        "EvaluationCycle",
        cycle.id,
        "EVALUATION_CYCLE_CLOSED",
        { status: from },
        { status: "CLOSED" },
      );
    }
    revalidatePath(AVALIACOES_PATH);
    return { ok: true, data: { status: parsed.to } };
  } catch (error) {
    return toFailure(error);
  }
}

// ── Salvar/submeter resposta (US16.03) ──────────────────────────────────────

export async function saveResponse(
  input: ResponseSaveInput,
): Promise<ActionResult<{ status: "IN_PROGRESS" | "COMPLETED" }>> {
  try {
    ensureDatabase();
    const user = await requireUser();
    const parsed = parseInput(responseSaveSchema, input);

    const response = await prisma.evaluationResponse.findUnique({
      where: { id: parsed.responseId },
      select: {
        id: true,
        evaluationId: true,
        raterUserId: true,
        status: true,
        evaluation: {
          select: {
            subjectConsultantId: true,
            cycle: { select: { status: true } },
          },
        },
      },
    });
    if (!response) {
      throw new ActionError("NOT_FOUND", "Resposta nao encontrada.");
    }

    // RBAC (LGPD §3): só o próprio avaliador (raterUserId) responde. Nunca
    // permitimos preencher a resposta de outro avaliador — o servidor é a
    // fronteira, não a UI.
    const dbUser = await resolveDbUser(user);
    if (!canAnswerResponse({ userId: dbUser?.id ?? null }, response.raterUserId)) {
      throw new ActionError(
        "FORBIDDEN",
        "Voce so pode responder a avaliacao atribuida a voce.",
      );
    }

    // Só aceita com o ciclo OPEN (US16.03).
    const cycleStatus = response.evaluation.cycle.status as
      | "DRAFT"
      | "OPEN"
      | "CLOSED";
    if (!responseIsEditable(cycleStatus)) {
      throw new ActionError(
        "NOT_EDITABLE",
        "A avaliacao so pode ser respondida com o ciclo aberto.",
      );
    }

    // Valida que as skills pertencem ao catálogo (defensivo; o form deriva do
    // perfil, mas o servidor não confia no cliente).
    const skillIds = parsed.answers.map((a) => a.skillId);
    if (skillIds.length > 0) {
      const known = await prisma.skill.findMany({
        where: { id: { in: skillIds } },
        select: { id: true },
      });
      if (known.length !== new Set(skillIds).size) {
        throw new ActionError("INVALID_INPUT", "Competencia desconhecida.");
      }
    }

    const submit = parsed.submit;
    await prisma.$transaction(async (tx) => {
      // Upsert por (responseId, skillId): regrava as notas do avaliador.
      for (const a of parsed.answers) {
        await tx.evaluationAnswer.upsert({
          where: {
            responseId_skillId: {
              responseId: response.id,
              skillId: a.skillId,
            },
          },
          create: {
            responseId: response.id,
            skillId: a.skillId,
            score: a.score,
            comment: a.comment ?? null,
          },
          update: { score: a.score, comment: a.comment ?? null },
        });
      }
      await tx.evaluationResponse.update({
        where: { id: response.id },
        data: submit
          ? { status: "COMPLETED", submittedAt: new Date() }
          : { status: "IN_PROGRESS" },
      });
      // Mantém o status da Evaluation coerente: COMPLETED quando todas as
      // respostas estão COMPLETED; senão IN_PROGRESS.
      const siblings = await tx.evaluationResponse.findMany({
        where: { evaluationId: response.evaluationId },
        select: { status: true },
      });
      const allCompleted =
        siblings.length > 0 && siblings.every((s) => s.status === "COMPLETED");
      await tx.evaluation.update({
        where: { id: response.evaluationId },
        data: { status: allCompleted ? "COMPLETED" : "IN_PROGRESS" },
      });
    });

    await audit(
      "EvaluationResponse",
      response.id,
      submit ? "EVALUATION_RESPONSE_SUBMITTED" : "EVALUATION_RESPONSE_SAVED",
      { status: response.status },
      { status: submit ? "COMPLETED" : "IN_PROGRESS", answers: parsed.answers.length },
    );
    revalidatePath(AVALIACOES_PATH);
    return {
      ok: true,
      data: { status: submit ? "COMPLETED" : "IN_PROGRESS" },
    };
  } catch (error) {
    return toFailure(error);
  }
}
