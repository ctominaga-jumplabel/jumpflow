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
  loadKeyResultContext,
  resolveAutoSourceValue,
  resolveConsultantManagerUserId,
  resolveOkrViewer,
  resolveProjectManagerUserId,
} from "@/lib/db/okrs";
import {
  isAutoSourceApplicable,
  isKnownAutoSource,
} from "@/lib/okrs/auto-source";
import {
  OKR_MANAGE_ROLES,
  canManageObjective,
  canUpdateKeyResultValue,
  isValidObjectiveTransition,
  type ObjectiveRef,
} from "@/lib/okrs/visibility";
import {
  keyResultAddSchema,
  keyResultProgressSchema,
  keyResultRemoveSchema,
  keyResultSyncSchema,
  keyResultUpdateSchema,
  objectiveCreateSchema,
  objectiveSetStatusSchema,
  objectiveUpdateSchema,
  type KeyResultAddInput,
  type KeyResultProgressInput,
  type KeyResultRemoveInput,
  type KeyResultSyncInput,
  type KeyResultUpdateInput,
  type ObjectiveCreateInput,
  type ObjectiveSetStatusInput,
  type ObjectiveUpdateInput,
} from "@/lib/okrs/schemas";
import type { ObjectiveScope } from "@/lib/okrs/types";

const METAS_PATH = "/app/metas";

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
      "Banco de dados nao configurado para metas.",
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
  console.error("[metas action] unexpected error", error);
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

/** Coerce ISO yyyy-mm-dd → Date UTC. */
function toDate(iso: string): Date {
  return new Date(`${iso}T00:00:00.000Z`);
}

/**
 * Reaplica no servidor a fronteira de GESTÃO de um objetivo a partir de um
 * ObjectiveRef já resolvido. Lança FORBIDDEN se o solicitante não puder gerenciar.
 */
async function requireManageObjective(ref: ObjectiveRef): Promise<void> {
  const user = await requireUser();
  const viewer = await resolveOkrViewer(user);
  if (!canManageObjective(viewer, ref)) {
    throw new ActionError(
      "FORBIDDEN",
      "Voce nao pode gerenciar este objetivo.",
    );
  }
}

/**
 * Resolve o ObjectiveRef alvo a partir do payload de CRIAÇÃO (escopo + vínculo) e
 * o managerUserId responsável, validando a existência do consultor/projeto.
 */
async function resolveCreateRef(
  parsed: ObjectiveCreateInput,
): Promise<ObjectiveRef> {
  const scope = parsed.scope;
  if (scope === "CONSULTANT") {
    const consultant = await prisma.consultant.findUnique({
      where: { id: parsed.consultantId! },
      select: { id: true },
    });
    if (!consultant) {
      throw new ActionError("NOT_FOUND", "Consultor nao encontrado.");
    }
    const managerUserId = await resolveConsultantManagerUserId(
      parsed.consultantId!,
    );
    return {
      scope,
      consultantId: parsed.consultantId!,
      projectId: null,
      managerUserId,
    };
  }
  if (scope === "PROJECT") {
    const project = await prisma.project.findUnique({
      where: { id: parsed.projectId! },
      select: { id: true },
    });
    if (!project) {
      throw new ActionError("NOT_FOUND", "Projeto nao encontrado.");
    }
    const managerUserId = await resolveProjectManagerUserId(parsed.projectId!);
    return {
      scope,
      consultantId: null,
      projectId: parsed.projectId!,
      managerUserId,
    };
  }
  // AREA / COMPANY: sem vínculo de linha; gestão por papel (ADMIN/AREA_MANAGER/
  // PEOPLE). managerUserId irrelevante.
  return { scope, consultantId: null, projectId: null, managerUserId: null };
}

/**
 * Valida o autoSource declarado num KR contra o escopo do objetivo. Fonte
 * desconhecida ou não aplicável ao escopo é rejeitada (o usuário escolheu uma
 * fonte inválida); KR sem autoSource é manual e sempre válido.
 */
function ensureAutoSourceValid(
  autoSource: string | null,
  scope: ObjectiveScope,
): void {
  if (!autoSource) return;
  if (!isKnownAutoSource(autoSource)) {
    throw new ActionError("INVALID_INPUT", "Fonte de auto-update desconhecida.");
  }
  if (!isAutoSourceApplicable(autoSource, scope)) {
    throw new ActionError(
      "INVALID_INPUT",
      "Esta fonte de auto-update nao se aplica ao escopo do objetivo.",
    );
  }
}

// ── Criar objetivo + KRs (US OKR.01) ────────────────────────────────────────

export async function createObjective(
  input: ObjectiveCreateInput,
): Promise<ActionResult<{ id: string }>> {
  try {
    ensureDatabase();
    await requireRole(OKR_MANAGE_ROLES);
    const parsed = parseInput(objectiveCreateSchema, input);

    const ref = await resolveCreateRef(parsed);
    await requireManageObjective(ref);

    for (const kr of parsed.keyResults) {
      ensureAutoSourceValid(kr.autoSource, parsed.scope);
    }

    const user = await requireUser();
    const dbUser = await resolveDbUser(user);

    const objective = await prisma.objective.create({
      data: {
        scope: parsed.scope,
        referenceKey:
          parsed.scope === "AREA" || parsed.scope === "COMPANY"
            ? parsed.referenceKey
            : null,
        title: parsed.title,
        description: parsed.description,
        periodStart: toDate(parsed.periodStart),
        periodEnd: toDate(parsed.periodEnd),
        status: "DRAFT",
        ownerUserId: dbUser?.id ?? null,
        consultantId: parsed.scope === "CONSULTANT" ? parsed.consultantId : null,
        projectId: parsed.scope === "PROJECT" ? parsed.projectId : null,
        keyResults: {
          create: parsed.keyResults.map((kr) => ({
            title: kr.title,
            metricType: kr.metricType,
            startValue: kr.startValue,
            targetValue: kr.targetValue,
            currentValue: kr.currentValue,
            unit: kr.unit,
            autoSource: kr.autoSource,
          })),
        },
      },
      select: { id: true },
    });

    await audit("Objective", objective.id, "OBJECTIVE_CREATED", null, {
      scope: parsed.scope,
      title: parsed.title,
      consultantId: parsed.consultantId ?? null,
      projectId: parsed.projectId ?? null,
      referenceKey: parsed.referenceKey ?? null,
      periodStart: parsed.periodStart,
      periodEnd: parsed.periodEnd,
      keyResultCount: parsed.keyResults.length,
    });
    revalidatePath(METAS_PATH);
    return { ok: true, data: { id: objective.id } };
  } catch (error) {
    return toFailure(error);
  }
}

// ── Editar metadados do objetivo (US OKR.01) ────────────────────────────────

export async function updateObjective(
  input: ObjectiveUpdateInput,
): Promise<ActionResult<{ id: string }>> {
  try {
    ensureDatabase();
    await requireRole(OKR_MANAGE_ROLES);
    const parsed = parseInput(objectiveUpdateSchema, input);

    const ctx = await loadObjectiveRef(parsed.id);
    await requireManageObjective(ctx.ref);

    await prisma.objective.update({
      where: { id: parsed.id },
      data: {
        title: parsed.title,
        description: parsed.description,
        periodStart: toDate(parsed.periodStart),
        periodEnd: toDate(parsed.periodEnd),
      },
    });
    await audit(
      "Objective",
      parsed.id,
      "OBJECTIVE_UPDATED",
      {
        title: ctx.title,
        periodStart: ctx.periodStartIso,
        periodEnd: ctx.periodEndIso,
      },
      {
        title: parsed.title,
        periodStart: parsed.periodStart,
        periodEnd: parsed.periodEnd,
      },
    );
    revalidatePath(METAS_PATH);
    return { ok: true, data: { id: parsed.id } };
  } catch (error) {
    return toFailure(error);
  }
}

// ── Transição de status do objetivo (US OKR.01) ─────────────────────────────

export async function setObjectiveStatus(
  input: ObjectiveSetStatusInput,
): Promise<
  ActionResult<{ status: "DRAFT" | "ACTIVE" | "COMPLETED" | "CANCELLED" }>
> {
  try {
    ensureDatabase();
    await requireRole(OKR_MANAGE_ROLES);
    const parsed = parseInput(objectiveSetStatusSchema, input);

    const ctx = await loadObjectiveRef(parsed.id);
    await requireManageObjective(ctx.ref);

    const from = ctx.status;
    if (!isValidObjectiveTransition(from, parsed.status)) {
      throw new ActionError(
        "INVALID_INPUT",
        "Transicao de status do objetivo invalida (DRAFT -> ACTIVE -> COMPLETED/CANCELLED).",
      );
    }

    await prisma.objective.update({
      where: { id: parsed.id },
      data: { status: parsed.status },
    });
    await audit(
      "Objective",
      parsed.id,
      `OBJECTIVE_${parsed.status}`,
      { status: from },
      { status: parsed.status },
    );
    revalidatePath(METAS_PATH);
    return { ok: true, data: { status: parsed.status } };
  } catch (error) {
    return toFailure(error);
  }
}

// ── Adicionar KR (gestão, US OKR.02) ────────────────────────────────────────

export async function addKeyResult(
  input: KeyResultAddInput,
): Promise<ActionResult<{ id: string }>> {
  try {
    ensureDatabase();
    await requireRole(OKR_MANAGE_ROLES);
    const parsed = parseInput(keyResultAddSchema, input);

    const ctx = await loadObjectiveRef(parsed.objectiveId);
    await requireManageObjective(ctx.ref);
    ensureAutoSourceValid(parsed.autoSource, ctx.ref.scope);

    const kr = await prisma.keyResult.create({
      data: {
        objectiveId: parsed.objectiveId,
        title: parsed.title,
        metricType: parsed.metricType,
        startValue: parsed.startValue,
        targetValue: parsed.targetValue,
        currentValue: parsed.currentValue,
        unit: parsed.unit,
        autoSource: parsed.autoSource,
      },
      select: { id: true },
    });
    await audit("KeyResult", kr.id, "KEY_RESULT_ADDED", null, {
      objectiveId: parsed.objectiveId,
      title: parsed.title,
      metricType: parsed.metricType,
      targetValue: parsed.targetValue,
      autoSource: parsed.autoSource,
    });
    revalidatePath(METAS_PATH);
    return { ok: true, data: { id: kr.id } };
  } catch (error) {
    return toFailure(error);
  }
}

// ── Editar estrutura de um KR (gestão, US OKR.02) ───────────────────────────

export async function updateKeyResult(
  input: KeyResultUpdateInput,
): Promise<ActionResult<{ id: string }>> {
  try {
    ensureDatabase();
    await requireRole(OKR_MANAGE_ROLES);
    const parsed = parseInput(keyResultUpdateSchema, input);

    const ctx = await loadKeyResultContext(parsed.id);
    if (!ctx) throw new ActionError("NOT_FOUND", "Key Result nao encontrado.");
    await requireManageObjective(ctx.ref);
    ensureAutoSourceValid(parsed.autoSource, ctx.ref.scope);

    const previous = await prisma.keyResult.findUnique({
      where: { id: parsed.id },
      select: {
        title: true,
        metricType: true,
        targetValue: true,
        autoSource: true,
      },
    });

    await prisma.keyResult.update({
      where: { id: parsed.id },
      data: {
        title: parsed.title,
        metricType: parsed.metricType,
        startValue: parsed.startValue,
        targetValue: parsed.targetValue,
        currentValue: parsed.currentValue,
        unit: parsed.unit,
        autoSource: parsed.autoSource,
      },
    });
    await audit(
      "KeyResult",
      parsed.id,
      "KEY_RESULT_UPDATED",
      previous
        ? {
            title: previous.title,
            metricType: previous.metricType,
            targetValue: Number(previous.targetValue),
            autoSource: previous.autoSource,
          }
        : null,
      {
        title: parsed.title,
        metricType: parsed.metricType,
        targetValue: parsed.targetValue,
        autoSource: parsed.autoSource,
      },
    );
    revalidatePath(METAS_PATH);
    return { ok: true, data: { id: parsed.id } };
  } catch (error) {
    return toFailure(error);
  }
}

// ── Remover KR (gestão, US OKR.02) ──────────────────────────────────────────

export async function removeKeyResult(
  input: KeyResultRemoveInput,
): Promise<ActionResult<{ id: string }>> {
  try {
    ensureDatabase();
    await requireRole(OKR_MANAGE_ROLES);
    const parsed = parseInput(keyResultRemoveSchema, input);

    const ctx = await loadKeyResultContext(parsed.id);
    if (!ctx) throw new ActionError("NOT_FOUND", "Key Result nao encontrado.");
    await requireManageObjective(ctx.ref);

    const previous = await prisma.keyResult.findUnique({
      where: { id: parsed.id },
      select: { title: true },
    });
    await prisma.keyResult.delete({ where: { id: parsed.id } });
    await audit(
      "KeyResult",
      parsed.id,
      "KEY_RESULT_REMOVED",
      { title: previous?.title ?? null },
      null,
    );
    revalidatePath(METAS_PATH);
    return { ok: true, data: { id: parsed.id } };
  } catch (error) {
    return toFailure(error);
  }
}

// ── Atualizar currentValue do KR (gestão OU consultor dono, US OKR.03) ──────

export async function updateKeyResultValue(
  input: KeyResultProgressInput,
): Promise<ActionResult<{ currentValue: number }>> {
  try {
    ensureDatabase();
    const user = await requireUser();
    const parsed = parseInput(keyResultProgressSchema, input);

    const ctx = await loadKeyResultContext(parsed.id);
    if (!ctx) throw new ActionError("NOT_FOUND", "Key Result nao encontrado.");

    const viewer = await resolveOkrViewer(user);
    if (!canUpdateKeyResultValue(viewer, ctx.ref)) {
      throw new ActionError(
        "FORBIDDEN",
        "Voce nao pode atualizar este Key Result.",
      );
    }

    await prisma.keyResult.update({
      where: { id: parsed.id },
      data: { currentValue: parsed.currentValue },
    });
    await audit(
      "KeyResult",
      parsed.id,
      "KEY_RESULT_VALUE_UPDATED",
      { currentValue: ctx.currentValue },
      { currentValue: parsed.currentValue },
    );
    revalidatePath(METAS_PATH);
    return { ok: true, data: { currentValue: parsed.currentValue } };
  } catch (error) {
    return toFailure(error);
  }
}

// ── Recalcular currentValue a partir do autoSource (US OKR.04) ──────────────

/**
 * Sincroniza o currentValue de um KR a partir do seu autoSource operacional.
 * Quem pode: quem pode atualizar o KR (gestão ou consultor dono). KR sem fonte
 * conhecida/aplicável retorna INVALID_INPUT (nada a sincronizar). Lê dado real
 * (TimeEntry); nunca inventa valor.
 */
export async function syncKeyResultFromSource(
  input: KeyResultSyncInput,
): Promise<ActionResult<{ currentValue: number }>> {
  try {
    ensureDatabase();
    const user = await requireUser();
    const parsed = parseInput(keyResultSyncSchema, input);

    const ctx = await loadKeyResultContext(parsed.id);
    if (!ctx) throw new ActionError("NOT_FOUND", "Key Result nao encontrado.");

    const viewer = await resolveOkrViewer(user);
    if (!canUpdateKeyResultValue(viewer, ctx.ref)) {
      throw new ActionError(
        "FORBIDDEN",
        "Voce nao pode sincronizar este Key Result.",
      );
    }

    const value = await resolveAutoSourceValue({
      autoSource: ctx.autoSource,
      scope: ctx.ref.scope,
      consultantId: ctx.ref.consultantId,
      projectId: ctx.ref.projectId,
      periodStart: ctx.periodStart,
      periodEnd: ctx.periodEnd,
    });
    if (value === null) {
      throw new ActionError(
        "INVALID_INPUT",
        "Este Key Result nao tem fonte operacional reconhecida para sincronizar.",
      );
    }

    await prisma.keyResult.update({
      where: { id: parsed.id },
      data: { currentValue: value },
    });
    await audit(
      "KeyResult",
      parsed.id,
      "KEY_RESULT_AUTO_SYNCED",
      { currentValue: ctx.currentValue },
      { currentValue: value, autoSource: ctx.autoSource },
    );
    revalidatePath(METAS_PATH);
    return { ok: true, data: { currentValue: value } };
  } catch (error) {
    return toFailure(error);
  }
}

// ── Helper: carrega ObjectiveRef + metadados pelo id do objetivo ────────────

async function loadObjectiveRef(objectiveId: string): Promise<{
  ref: ObjectiveRef;
  status: "DRAFT" | "ACTIVE" | "COMPLETED" | "CANCELLED";
  title: string;
  periodStartIso: string;
  periodEndIso: string;
}> {
  const o = await prisma.objective.findUnique({
    where: { id: objectiveId },
    select: {
      scope: true,
      status: true,
      title: true,
      consultantId: true,
      projectId: true,
      periodStart: true,
      periodEnd: true,
      project: { select: { managerUserId: true } },
      consultant: {
        select: {
          allocations: {
            select: { project: { select: { managerUserId: true } } },
          },
        },
      },
    },
  });
  if (!o) throw new ActionError("NOT_FOUND", "Objetivo nao encontrado.");
  const scope = o.scope as ObjectiveScope;
  let managerUserId: string | null = null;
  if (scope === "PROJECT") {
    managerUserId = o.project?.managerUserId ?? null;
  } else if (scope === "CONSULTANT") {
    managerUserId =
      o.consultant?.allocations.find((a) => a.project.managerUserId)?.project
        .managerUserId ?? null;
  }
  return {
    ref: {
      scope,
      consultantId: o.consultantId,
      projectId: o.projectId,
      managerUserId,
    },
    status: o.status as "DRAFT" | "ACTIVE" | "COMPLETED" | "CANCELLED",
    title: o.title,
    periodStartIso: o.periodStart.toISOString().slice(0, 10),
    periodEndIso: o.periodEnd.toISOString().slice(0, 10),
  };
}
