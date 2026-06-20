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
  getGapSuggestions,
  resolveConsultantManagerUserId,
  resolveDevelopmentViewer,
  type GapSuggestionResult,
} from "@/lib/db/development";
import {
  DEVELOPMENT_MANAGE_ROLES,
  canManagePlan,
  canUpdateActionProgress,
  isValidActionTransition,
  isValidPlanTransition,
  resolveDevelopmentScope,
  type DevelopmentScope,
} from "@/lib/development/visibility";
import {
  actionAddSchema,
  actionProgressSchema,
  actionRemoveSchema,
  actionUpdateSchema,
  planCreateSchema,
  planSetStatusSchema,
  type ActionAddInput,
  type ActionProgressInput,
  type ActionRemoveInput,
  type ActionUpdateInput,
  type PlanCreateInput,
  type PlanSetStatusInput,
} from "@/lib/development/schemas";
import type { DevelopmentActionStatus } from "@/lib/development/types";

const PDI_PATH = "/app/pdi";

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
      "Banco de dados nao configurado para PDI.",
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
  console.error("[pdi action] unexpected error", error);
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

/** Coerce ISO yyyy-mm-dd → Date UTC; null para sem prazo. */
function toDate(iso: string | null | undefined): Date | null {
  return iso ? new Date(`${iso}T00:00:00.000Z`) : null;
}

/**
 * Reaplica no servidor a fronteira de GESTÃO de um plano: o solicitante precisa
 * poder gerenciar a estrutura do PDI deste consultor (ADMIN/PEOPLE amplo, ou
 * gestor do time). O CONSULTANT nunca gerencia estrutura. Lança FORBIDDEN.
 */
async function requireManageConsultant(consultantId: string): Promise<{
  scope: DevelopmentScope;
}> {
  const user = await requireUser();
  const viewer = await resolveDevelopmentViewer(user);
  const scope = resolveDevelopmentScope(viewer);
  const managerUserId = await resolveConsultantManagerUserId(consultantId);
  if (!canManagePlan(scope, { subjectConsultantId: consultantId, managerUserId })) {
    throw new ActionError(
      "FORBIDDEN",
      "Voce nao pode gerenciar o PDI deste consultor.",
    );
  }
  return { scope };
}

// ── Sugestões a partir do gap (US17.01) ─────────────────────────────────────

/**
 * Carrega as sugestões de ações a partir do gap de um consultor (rascunho
 * revisável). RBAC reaplicado dentro de getGapSuggestions (gestor com escopo ou
 * ADMIN/PEOPLE); fora do escopo retorna FORBIDDEN. Nada é persistido aqui.
 */
export async function loadGapSuggestions(
  consultantId: string,
): Promise<ActionResult<GapSuggestionResult>> {
  try {
    ensureDatabase();
    await requireRole(DEVELOPMENT_MANAGE_ROLES);
    const user = await requireUser();
    const result = await getGapSuggestions(user, consultantId);
    if (!result) {
      throw new ActionError(
        "FORBIDDEN",
        "Voce nao pode gerar sugestoes para este consultor.",
      );
    }
    return { ok: true, data: result };
  } catch (error) {
    return toFailure(error);
  }
}

// ── Criar PDI a partir do gap (US17.01) ─────────────────────────────────────

export async function createPlan(
  input: PlanCreateInput,
): Promise<ActionResult<{ id: string }>> {
  try {
    ensureDatabase();
    // Porta de entrada: precisa ser papel de gestão de PDI (a fronteira fina por
    // consultor vem logo abaixo).
    await requireRole(DEVELOPMENT_MANAGE_ROLES);
    const parsed = parseInput(planCreateSchema, input);

    // RBAC por linha: o solicitante precisa poder gerenciar este consultor.
    await requireManageConsultant(parsed.consultantId);

    const consultant = await prisma.consultant.findUnique({
      where: { id: parsed.consultantId },
      select: { id: true },
    });
    if (!consultant) {
      throw new ActionError("NOT_FOUND", "Consultor nao encontrado.");
    }

    // cycleId opcional: valida existência se informado.
    if (parsed.cycleId) {
      const cycle = await prisma.evaluationCycle.findUnique({
        where: { id: parsed.cycleId },
        select: { id: true },
      });
      if (!cycle) {
        throw new ActionError("NOT_FOUND", "Ciclo de avaliacao nao encontrado.");
      }
    }

    // Skills alvo informadas precisam existir no catálogo (defensivo).
    const skillIds = parsed.actions
      .map((a) => a.targetSkillId)
      .filter((id): id is string => Boolean(id));
    if (skillIds.length > 0) {
      const known = await prisma.skill.findMany({
        where: { id: { in: skillIds } },
        select: { id: true },
      });
      const knownSet = new Set(known.map((k) => k.id));
      if (skillIds.some((id) => !knownSet.has(id))) {
        throw new ActionError("INVALID_INPUT", "Skill alvo desconhecida.");
      }
    }

    const user = await requireUser();
    const dbUser = await resolveDbUser(user);

    const plan = await prisma.developmentPlan.create({
      data: {
        consultantId: parsed.consultantId,
        cycleId: parsed.cycleId ?? null,
        ownerUserId: dbUser?.id ?? null,
        status: "ACTIVE",
        periodStart: toDate(parsed.periodStart)!,
        periodEnd: toDate(parsed.periodEnd)!,
        // Ações já revisadas pelo humano (sugestões editadas/removidas).
        actions: {
          create: parsed.actions.map((a) => ({
            type: a.type,
            targetSkillId: a.targetSkillId ?? null,
            description: a.description,
            dueAt: toDate(a.dueAt),
            status: "PLANNED" as const,
          })),
        },
      },
      select: { id: true },
    });

    await audit("DevelopmentPlan", plan.id, "DEVELOPMENT_PLAN_CREATED", null, {
      consultantId: parsed.consultantId,
      cycleId: parsed.cycleId ?? null,
      periodStart: parsed.periodStart,
      periodEnd: parsed.periodEnd,
      actionCount: parsed.actions.length,
    });
    revalidatePath(PDI_PATH);
    return { ok: true, data: { id: plan.id } };
  } catch (error) {
    return toFailure(error);
  }
}

// ── Mudar status do PLANO (US17.01) ─────────────────────────────────────────

export async function setPlanStatus(
  input: PlanSetStatusInput,
): Promise<ActionResult<{ status: "ACTIVE" | "COMPLETED" | "CANCELLED" }>> {
  try {
    ensureDatabase();
    await requireRole(DEVELOPMENT_MANAGE_ROLES);
    const parsed = parseInput(planSetStatusSchema, input);

    const plan = await prisma.developmentPlan.findUnique({
      where: { id: parsed.id },
      select: { id: true, status: true, consultantId: true },
    });
    if (!plan) throw new ActionError("NOT_FOUND", "PDI nao encontrado.");

    await requireManageConsultant(plan.consultantId);

    const from = plan.status as "ACTIVE" | "COMPLETED" | "CANCELLED";
    if (!isValidPlanTransition(from, parsed.status)) {
      throw new ActionError(
        "INVALID_INPUT",
        "Transicao de status do PDI invalida.",
      );
    }

    await prisma.developmentPlan.update({
      where: { id: plan.id },
      data: { status: parsed.status },
    });
    await audit(
      "DevelopmentPlan",
      plan.id,
      parsed.status === "COMPLETED"
        ? "DEVELOPMENT_PLAN_COMPLETED"
        : "DEVELOPMENT_PLAN_CANCELLED",
      { status: from },
      { status: parsed.status },
    );
    revalidatePath(PDI_PATH);
    return { ok: true, data: { status: parsed.status } };
  } catch (error) {
    return toFailure(error);
  }
}

// ── Adicionar ação (gestão, US17.02) ────────────────────────────────────────

async function ensureKnownSkill(skillId: string | null | undefined) {
  if (!skillId) return;
  const skill = await prisma.skill.findUnique({
    where: { id: skillId },
    select: { id: true },
  });
  if (!skill) {
    throw new ActionError("INVALID_INPUT", "Skill alvo desconhecida.");
  }
}

export async function addAction(
  input: ActionAddInput,
): Promise<ActionResult<{ id: string }>> {
  try {
    ensureDatabase();
    await requireRole(DEVELOPMENT_MANAGE_ROLES);
    const parsed = parseInput(actionAddSchema, input);

    const plan = await prisma.developmentPlan.findUnique({
      where: { id: parsed.planId },
      select: { id: true, consultantId: true },
    });
    if (!plan) throw new ActionError("NOT_FOUND", "PDI nao encontrado.");

    await requireManageConsultant(plan.consultantId);
    await ensureKnownSkill(parsed.targetSkillId);

    const action = await prisma.developmentAction.create({
      data: {
        planId: parsed.planId,
        type: parsed.type,
        targetSkillId: parsed.targetSkillId ?? null,
        description: parsed.description,
        dueAt: toDate(parsed.dueAt),
        status: "PLANNED",
      },
      select: { id: true },
    });
    await audit(
      "DevelopmentAction",
      action.id,
      "DEVELOPMENT_ACTION_ADDED",
      null,
      {
        planId: parsed.planId,
        type: parsed.type,
        targetSkillId: parsed.targetSkillId ?? null,
        description: parsed.description,
        dueAt: parsed.dueAt ?? null,
      },
    );
    revalidatePath(PDI_PATH);
    return { ok: true, data: { id: action.id } };
  } catch (error) {
    return toFailure(error);
  }
}

// ── Editar estrutura da ação (gestão, US17.02) ──────────────────────────────

export async function updateAction(
  input: ActionUpdateInput,
): Promise<ActionResult<{ id: string }>> {
  try {
    ensureDatabase();
    await requireRole(DEVELOPMENT_MANAGE_ROLES);
    const parsed = parseInput(actionUpdateSchema, input);

    const action = await prisma.developmentAction.findUnique({
      where: { id: parsed.id },
      select: {
        id: true,
        type: true,
        targetSkillId: true,
        description: true,
        dueAt: true,
        plan: { select: { consultantId: true } },
      },
    });
    if (!action) throw new ActionError("NOT_FOUND", "Acao nao encontrada.");

    await requireManageConsultant(action.plan.consultantId);
    await ensureKnownSkill(parsed.targetSkillId);

    await prisma.developmentAction.update({
      where: { id: parsed.id },
      data: {
        type: parsed.type,
        targetSkillId: parsed.targetSkillId ?? null,
        description: parsed.description,
        dueAt: toDate(parsed.dueAt),
      },
    });
    await audit(
      "DevelopmentAction",
      parsed.id,
      "DEVELOPMENT_ACTION_UPDATED",
      {
        type: action.type,
        targetSkillId: action.targetSkillId,
        description: action.description,
        dueAt: action.dueAt?.toISOString().slice(0, 10) ?? null,
      },
      {
        type: parsed.type,
        targetSkillId: parsed.targetSkillId ?? null,
        description: parsed.description,
        dueAt: parsed.dueAt ?? null,
      },
    );
    revalidatePath(PDI_PATH);
    return { ok: true, data: { id: parsed.id } };
  } catch (error) {
    return toFailure(error);
  }
}

// ── Remover ação (gestão, US17.02) ──────────────────────────────────────────

export async function removeAction(
  input: ActionRemoveInput,
): Promise<ActionResult<{ id: string }>> {
  try {
    ensureDatabase();
    await requireRole(DEVELOPMENT_MANAGE_ROLES);
    const parsed = parseInput(actionRemoveSchema, input);

    const action = await prisma.developmentAction.findUnique({
      where: { id: parsed.id },
      select: {
        id: true,
        type: true,
        description: true,
        plan: { select: { consultantId: true } },
      },
    });
    if (!action) throw new ActionError("NOT_FOUND", "Acao nao encontrada.");

    await requireManageConsultant(action.plan.consultantId);

    await prisma.developmentAction.delete({ where: { id: parsed.id } });
    await audit(
      "DevelopmentAction",
      parsed.id,
      "DEVELOPMENT_ACTION_REMOVED",
      { type: action.type, description: action.description },
      null,
    );
    revalidatePath(PDI_PATH);
    return { ok: true, data: { id: parsed.id } };
  } catch (error) {
    return toFailure(error);
  }
}

// ── Atualizar progresso da ação (gestão OU consultor dono, US17.02/03) ──────

/**
 * Atualiza status (transição válida) + evidenceNote de uma ação. Quem pode:
 * gestores com escopo (estrutura+progresso) E o consultor dono do PDI (só
 * progresso das PRÓPRIAS ações — LGPD §3). O servidor é a fronteira: o
 * CONSULTANT só muda status/evidência, nunca a estrutura.
 */
export async function updateActionProgress(
  input: ActionProgressInput,
): Promise<ActionResult<{ status: DevelopmentActionStatus }>> {
  try {
    ensureDatabase();
    const user = await requireUser();
    const parsed = parseInput(actionProgressSchema, input);

    const action = await prisma.developmentAction.findUnique({
      where: { id: parsed.id },
      select: {
        id: true,
        status: true,
        evidenceNote: true,
        plan: {
          select: {
            consultantId: true,
            consultant: {
              select: {
                allocations: {
                  select: { project: { select: { managerUserId: true } } },
                },
              },
            },
          },
        },
      },
    });
    if (!action) throw new ActionError("NOT_FOUND", "Acao nao encontrada.");

    const viewer = await resolveDevelopmentViewer(user);
    const scope = resolveDevelopmentScope(viewer);
    const managerUserId =
      action.plan.consultant.allocations.find((a) => a.project.managerUserId)
        ?.project.managerUserId ?? null;
    const planRef = {
      subjectConsultantId: action.plan.consultantId,
      managerUserId,
    };
    if (!canUpdateActionProgress(scope, viewer, planRef)) {
      throw new ActionError(
        "FORBIDDEN",
        "Voce nao pode atualizar o progresso desta acao.",
      );
    }

    const from = action.status as DevelopmentActionStatus;
    if (!isValidActionTransition(from, parsed.status)) {
      throw new ActionError(
        "INVALID_INPUT",
        "Transicao de status da acao invalida (PLANNED -> IN_PROGRESS -> DONE/CANCELLED).",
      );
    }

    await prisma.developmentAction.update({
      where: { id: parsed.id },
      data: { status: parsed.status, evidenceNote: parsed.evidenceNote },
    });
    await audit(
      "DevelopmentAction",
      parsed.id,
      "DEVELOPMENT_ACTION_PROGRESS_UPDATED",
      { status: from, evidenceNote: action.evidenceNote },
      { status: parsed.status, evidenceNote: parsed.evidenceNote },
    );
    revalidatePath(PDI_PATH);
    return { ok: true, data: { status: parsed.status } };
  } catch (error) {
    return toFailure(error);
  }
}
