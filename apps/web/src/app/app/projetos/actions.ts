"use server";

import { revalidatePath } from "next/cache";
import { Prisma, prisma } from "@jumpflow/database";
import type { ZodType } from "zod";
import type { ActionResult, ErrorCode } from "@/lib/actions/result";
import { requireRole, requireUser } from "@/lib/auth/guards";
import {
  FINANCIAL_ROLES,
  hasRole,
  PROJECT_WRITE_ROLES,
  SALE_RATE_ROLES,
} from "@/lib/auth/route-permissions";
import { notifyProjectCreated } from "@/lib/automation/notifications/events";
import { recordAuditEvent } from "@/lib/db/audit";
import { isDatabaseConfigured } from "@/lib/db/config";
import { resolveDbUser } from "@/lib/db/users";
import {
  allocationInputSchema,
  allocationRemoveSchema,
  allocationSkillInputSchema,
  allocationSkillRemoveSchema,
  allocationSkillUpdateSchema,
  allocationUpdateSchema,
  consultantAutoApprovalRuleSchema,
  linkAutoApprovalConsultantsSchema,
  projectAutoApprovalRuleSchema,
  projectBillingConfigSchema,
  projectBillingTypeSchema,
  projectCommercialSchema,
  projectInputSchema,
  projectUpdateSchema,
  removeConsultantAutoApprovalRuleSchema,
  setConsultantAutoApprovalActiveSchema,
  setProjectAutoApprovalActiveSchema,
  saleRateInputSchema,
  saleRateUpdateSchema,
  projectPaymentTypeSchema,
  projectAcceptanceTermSchema,
  receivableInputSchema,
  receivableUpdateSchema,
  receivableRemoveSchema,
  type ProjectPaymentTypeInput,
  type ProjectAcceptanceTermInput,
  type ReceivableInput,
  type ReceivableUpdateInput,
  costRateInputSchema,
  costRateUpdateSchema,
  costRateRemoveSchema,
  type CostRateInput,
  type CostRateUpdateInput,
  type AllocationInput,
  type AllocationRemoveInput,
  type AllocationSkillInput,
  type AllocationSkillRemoveInput,
  type AllocationSkillUpdateInput,
  type AllocationUpdateInput,
  type ConsultantAutoApprovalRuleInput,
  type LinkAutoApprovalConsultantsInput,
  type ProjectAutoApprovalRuleInput,
  type SetConsultantAutoApprovalActiveInput,
  type SetProjectAutoApprovalActiveInput,
  type ProjectBillingConfigInput,
  type ProjectBillingTypeInput,
  type ProjectCommercialInput,
  type ProjectInput,
  type ProjectUpdateInput,
  type SaleRateInput,
  type SaleRateUpdateInput,
} from "@/lib/projects/schemas";
import {
  findOverlappingSaleRate,
  rangesOverlap,
  type SaleRateRange,
} from "@/lib/projects/rates";

// A single Project is the source of truth behind three surfaces (Operação,
// Comercial, Financeiro). A change in any one must refresh all three so none
// shows stale context. PROJECT_WRITE_ROLES/SALE_RATE_ROLES live in
// route-permissions.ts (shared with the route guards).
// Recebimentos previstos são VALORES DE RECEITA (D1): quem os vê/edita é o
// Comercial (SALE_RATE_ROLES) ou o Financeiro (FINANCIAL_ROLES). Como
// FINANCIAL_ROLES ⊂ SALE_RATE_ROLES hoje, a união coincide com SALE_RATE_ROLES,
// mas mantemos o intent explícito para não depender dessa coincidência.
const RECEIVABLE_ROLES = [
  ...new Set([...SALE_RATE_ROLES, ...FINANCIAL_ROLES]),
];

const PROJETOS_PATH = "/app/projetos";
const COMERCIAL_PATH = "/app/comercial";
const FINANCEIRO_PROJETOS_PATH = "/app/financeiro/projetos";

function revalidateProjectViews(): void {
  revalidatePath(PROJETOS_PATH);
  revalidatePath(COMERCIAL_PATH);
  revalidatePath(FINANCEIRO_PROJETOS_PATH);
}

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
      "Banco de dados nao configurado para projetos.",
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
  // Never swallow framework control-flow errors (redirect/notFound), e.g. the
  // redirect("/access-denied") thrown by requireRole on an RBAC failure.
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
  if (
    error instanceof Prisma.PrismaClientKnownRequestError &&
    error.code === "P2002"
  ) {
    return {
      ok: false,
      error: "INVALID_INPUT",
      message: "Ja existe um registro com esses dados.",
    };
  }
  console.error("[projects action] unexpected error", error);
  return {
    ok: false,
    error: "UNEXPECTED",
    message: "Nao foi possivel concluir a acao.",
  };
}

function toDate(iso: string): Date {
  return new Date(`${iso}T00:00:00.000Z`);
}

function projectData(
  input: ProjectInput,
  includeCommercialFields: boolean,
): Prisma.ProjectUncheckedCreateInput {
  const data: Prisma.ProjectUncheckedCreateInput = {
    clientId: input.clientId,
    name: input.name,
    description: input.description,
    status: input.status,
    startDate: toDate(input.startDate),
    endDate: input.endDate ? toDate(input.endDate) : null,
    managerUserId: input.managerUserId,
    // Centro de custo é operacional (não é valor financeiro), gravado pela
    // Operação junto dos demais dados do projeto.
    costCenter: input.costCenter,
    // Flag INFORMATIVA de termo de aceite (operacional). Não toca em
    // acceptanceTermAcceptedAt/By: a marcação de aceite é uma ação à parte.
    requiresAcceptanceTerm: input.requiresAcceptanceTerm ?? false,
  };
  if (!includeCommercialFields) return data;
  // Tipo de cobrança e budget são de titularidade exclusiva do Comercial
  // (updateProjectCommercial), então a Operação não os escreve aqui — evita
  // sobrescrita acidental. Resta o valor hora legado, sem dono em outra tela.
  return {
    ...data,
    billingHourlyRate: input.billingHourlyRate,
  };
}

function allocationData(
  input: AllocationInput,
): Prisma.AllocationUncheckedCreateInput {
  return {
    projectId: input.projectId,
    consultantId: input.consultantId,
    role: input.role,
    allocationPercent: input.allocationPercent,
    startDate: toDate(input.startDate),
    endDate: input.endDate ? toDate(input.endDate) : null,
    status: input.status,
  };
}

function saleRateData(
  input: SaleRateInput,
): Prisma.ProjectSaleRateUncheckedCreateInput {
  return {
    projectId: input.projectId,
    consultantId: input.consultantId,
    allocationId: input.allocationId,
    startsAt: toDate(input.startsAt),
    endsAt: input.endsAt ? toDate(input.endsAt) : null,
    hourlyRate: input.hourlyRate,
    currency: input.currency,
    note: input.note,
  };
}

function dateToIso(value: Date): string {
  return value.toISOString().slice(0, 10);
}

function toRateRange(row: {
  id: string;
  projectId: string;
  consultantId: string | null;
  allocationId: string | null;
  startsAt: Date;
  endsAt: Date | null;
  hourlyRate: Prisma.Decimal;
}): SaleRateRange {
  return {
    id: row.id,
    projectId: row.projectId,
    consultantId: row.consultantId,
    allocationId: row.allocationId,
    startsAt: dateToIso(row.startsAt),
    endsAt: row.endsAt ? dateToIso(row.endsAt) : null,
    hourlyRate: Number(row.hourlyRate),
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

async function ensureNoSaleRateOverlap(
  tx: Prisma.TransactionClient,
  candidate: SaleRateRange,
) {
  const where: Prisma.ProjectSaleRateWhereInput = candidate.allocationId
    ? { allocationId: candidate.allocationId }
    : candidate.consultantId
      ? {
          projectId: candidate.projectId,
          consultantId: candidate.consultantId,
          allocationId: null,
        }
      : { projectId: candidate.projectId, consultantId: null, allocationId: null };
  const existing = await tx.projectSaleRate.findMany({ where });
  const overlap = findOverlappingSaleRate(existing.map(toRateRange), candidate);
  if (overlap) {
    throw new ActionError(
      "INVALID_INPUT",
      "Ja existe valor de venda vigente nesse escopo e periodo.",
    );
  }
}

async function ensureSaleRateScope(
  tx: Prisma.TransactionClient,
  input: SaleRateInput,
): Promise<SaleRateRange> {
  if (input.allocationId) {
    const allocation = await tx.allocation.findUnique({
      where: { id: input.allocationId },
      select: { projectId: true, consultantId: true },
    });
    if (!allocation || allocation.projectId !== input.projectId) {
      throw new ActionError(
        "INVALID_INPUT",
        "A alocacao do valor de venda precisa pertencer ao projeto.",
      );
    }
    return {
      projectId: input.projectId,
      consultantId: null,
      allocationId: input.allocationId,
      startsAt: input.startsAt,
      endsAt: input.endsAt,
      hourlyRate: input.hourlyRate,
    };
  }
  if (input.consultantId) {
    const consultant = await tx.consultant.findUnique({
      where: { id: input.consultantId },
      select: { id: true },
    });
    if (!consultant) {
      throw new ActionError("INVALID_INPUT", "Consultor nao encontrado.");
    }
  }
  return {
    projectId: input.projectId,
    consultantId: input.consultantId,
    allocationId: null,
    startsAt: input.startsAt,
    endsAt: input.endsAt,
    hourlyRate: input.hourlyRate,
  };
}

export async function createProject(
  input: ProjectInput,
): Promise<ActionResult<{ id: string }>> {
  try {
    ensureDatabase();
    const user = await requireRole(PROJECT_WRITE_ROLES);
    const parsed = parseInput(projectInputSchema, input);
    const canWriteCommercials = hasRole(user, SALE_RATE_ROLES);
    const data = projectData(parsed, canWriteCommercials);
    const project = await prisma.project.create({ data });
    await audit("Project", project.id, "PROJECT_CREATED", null, data);
    // Best-effort notification (Financeiro + comercial). Never throws.
    await notifyProjectCreated(project.id);
    revalidateProjectViews();
    return { ok: true, data: { id: project.id } };
  } catch (error) {
    return toFailure(error);
  }
}

export async function updateProject(
  input: ProjectUpdateInput,
): Promise<ActionResult<{ id: string }>> {
  try {
    ensureDatabase();
    const user = await requireRole(PROJECT_WRITE_ROLES);
    const parsed = parseInput(projectUpdateSchema, input);
    const previous = await prisma.project.findUnique({ where: { id: parsed.id } });
    if (!previous) throw new ActionError("NOT_FOUND", "Projeto nao encontrado.");
    const canWriteCommercials = hasRole(user, SALE_RATE_ROLES);
    const data = projectData(parsed, canWriteCommercials);
    await prisma.project.update({ where: { id: parsed.id }, data });
    await audit("Project", parsed.id, "PROJECT_UPDATED", previous, data);
    revalidateProjectViews();
    return { ok: true, data: { id: parsed.id } };
  } catch (error) {
    return toFailure(error);
  }
}

/**
 * Atualiza apenas os campos comerciais do projeto (tipo de cobrança e budget),
 * a partir da superfície Comercial. Separado de updateProject (Operação) para
 * que o Comercial não precise reenviar — nem ter permissão sobre — os dados
 * operacionais. Gated por SALE_RATE_ROLES; audita como mudança comercial.
 */
export async function updateProjectCommercial(
  input: ProjectCommercialInput,
): Promise<ActionResult<{ id: string }>> {
  try {
    ensureDatabase();
    await requireRole(SALE_RATE_ROLES);
    const parsed = parseInput(projectCommercialSchema, input);
    const previous = await prisma.project.findUnique({
      where: { id: parsed.id },
      select: { billingTypeId: true, budgetHours: true, commercialContractRef: true },
    });
    if (!previous) throw new ActionError("NOT_FOUND", "Projeto nao encontrado.");
    const data = {
      billingTypeId: parsed.billingTypeId ?? null,
      budgetHours: parsed.budgetHours ?? null,
      commercialContractRef: parsed.commercialContractRef ?? null,
    };
    await prisma.project.update({ where: { id: parsed.id }, data });
    await audit("Project", parsed.id, "PROJECT_UPDATED", previous, data);
    revalidateProjectViews();
    return { ok: true, data: { id: parsed.id } };
  } catch (error) {
    return toFailure(error);
  }
}

/**
 * Atualiza apenas o Tipo de Cobrança do projeto, a partir do Financeiro. O
 * BillingType define o chargeType que o motor de regras consome, então o
 * Financeiro precisa selecioná-lo junto da configuração de cobrança. Patch
 * isolado (não toca budget/valores de venda do Comercial). Gated FINANCIAL_ROLES.
 */
export async function updateProjectBillingType(
  input: ProjectBillingTypeInput,
): Promise<ActionResult<{ id: string }>> {
  try {
    ensureDatabase();
    await requireRole(FINANCIAL_ROLES);
    const parsed = parseInput(projectBillingTypeSchema, input);
    const previous = await prisma.project.findUnique({
      where: { id: parsed.id },
      select: { billingTypeId: true },
    });
    if (!previous) throw new ActionError("NOT_FOUND", "Projeto nao encontrado.");
    const data = { billingTypeId: parsed.billingTypeId ?? null };
    await prisma.project.update({ where: { id: parsed.id }, data });
    await audit("Project", parsed.id, "PROJECT_UPDATED", previous, data);
    revalidateProjectViews();
    return { ok: true, data: { id: parsed.id } };
  } catch (error) {
    return toFailure(error);
  }
}

function billingConfigData(
  input: ProjectBillingConfigInput,
): Prisma.ProjectBillingConfigUncheckedCreateInput {
  return {
    projectId: input.projectId,
    periodicity: input.periodicity,
    roundingRule: input.roundingRule,
    fixedAmount: input.fixedAmount ?? null,
    includedHours: input.includedHours ?? null,
    overageRate: input.overageRate ?? null,
    overageTreatment: input.overageTreatment,
    perConsultantAmount: input.perConsultantAmount ?? null,
    reimbursableExpenses: input.reimbursableExpenses,
    reimbursableMarkupPct: input.reimbursableMarkupPct ?? null,
    discountPct: input.discountPct ?? null,
    penaltyPct: input.penaltyPct ?? null,
    adjustmentIndex: input.adjustmentIndex,
    adjustmentPct: input.adjustmentPct ?? null,
    withholdIss: input.withholdIss,
    withholdingPct: input.withholdingPct ?? null,
    closingDay: input.closingDay ?? null,
    dueDay: input.dueDay ?? null,
    requireApproval: input.requireApproval,
    overtimeAppliesTo: input.overtimeAppliesTo,
    overtimeBillingPct: input.overtimeBillingPct ?? null,
    overtimeExcessHours: input.overtimeExcessHours ?? null,
    overtimeExcessRate: input.overtimeExcessRate ?? null,
    billDuringVacation: input.billDuringVacation,
    notes: input.notes ?? null,
  };
}

/**
 * Configuracao de cobranca por projeto (motor de regras parametrizavel).
 * Editada pelo Financeiro (FINANCIAL_ROLES) — distinta do PROJECT_WRITE_ROLES,
 * pois define as regras comerciais/financeiras que o motor de faturamento usa.
 */
export async function upsertProjectBillingConfig(
  input: ProjectBillingConfigInput,
): Promise<ActionResult<{ id: string }>> {
  try {
    ensureDatabase();
    await requireRole(FINANCIAL_ROLES);
    const parsed = parseInput(projectBillingConfigSchema, input);
    const project = await prisma.project.findUnique({
      where: { id: parsed.projectId },
      select: { id: true },
    });
    if (!project) throw new ActionError("NOT_FOUND", "Projeto nao encontrado.");
    const previous = await prisma.projectBillingConfig.findUnique({
      where: { projectId: parsed.projectId },
    });
    const data = billingConfigData(parsed);
    const saved = await prisma.projectBillingConfig.upsert({
      where: { projectId: parsed.projectId },
      update: data,
      create: data,
    });
    await audit(
      "ProjectBillingConfig",
      saved.id,
      "PROJECT_BILLING_CONFIG_UPDATED",
      previous,
      data,
    );
    revalidateProjectViews();
    return { ok: true, data: { id: saved.id } };
  } catch (error) {
    return toFailure(error);
  }
}

// ── Aprovação automática (Operação) ──────────────────────────────────────
// Regra por projeto e regras por consultor. A existência de QUALQUER regra por
// consultor no projeto ativa o modo exclusivo no motor (a regra do projeto
// deixa de valer; consultores não vinculados ficam manuais).

const autoApprovalRuleData = (input: {
  weekendEnabled: boolean;
  hoursRangeEnabled: boolean;
  minMinutes: number;
  maxMinutes: number;
}) => ({
  weekendEnabled: input.weekendEnabled,
  hoursRangeEnabled: input.hoursRangeEnabled,
  minMinutes: input.minMinutes,
  maxMinutes: input.maxMinutes,
});

/**
 * Invariante: se o projeto tem QUALQUER regra por consultor ATIVA, a regra do
 * projeto fica inativa (suspensa explicitamente — o motor já a ignora no modo
 * exclusivo, mas aqui refletimos isso no dado/UI). Chamado após qualquer ação
 * que ative uma regra de consultor. Audita quando inativa.
 */
async function deactivateProjectRuleForExclusiveMode(
  projectId: string,
): Promise<void> {
  const activeConsultantRules = await prisma.consultantAutoApprovalRule.count({
    where: { projectId, active: true },
  });
  if (activeConsultantRules === 0) return;
  const projectRule = await prisma.projectAutoApprovalRule.findUnique({
    where: { projectId },
    select: { id: true, active: true },
  });
  if (!projectRule || !projectRule.active) return;
  await prisma.projectAutoApprovalRule.update({
    where: { projectId },
    data: { active: false },
  });
  await audit(
    "ProjectAutoApprovalRule",
    projectRule.id,
    "PROJECT_AUTO_APPROVAL_RULE_DEACTIVATED",
    { active: true },
    { active: false, reason: "consultant_rule_registered" },
  );
}

/** Cria/atualiza a regra de aprovação automática do projeto (upsert 1:1). */
export async function upsertProjectAutoApprovalRule(
  input: ProjectAutoApprovalRuleInput,
): Promise<ActionResult<{ id: string }>> {
  try {
    ensureDatabase();
    await requireRole(PROJECT_WRITE_ROLES);
    const parsed = parseInput(projectAutoApprovalRuleSchema, input);
    const project = await prisma.project.findUnique({
      where: { id: parsed.projectId },
      select: { id: true },
    });
    if (!project) throw new ActionError("NOT_FOUND", "Projeto nao encontrado.");
    const previous = await prisma.projectAutoApprovalRule.findUnique({
      where: { projectId: parsed.projectId },
    });
    const data = autoApprovalRuleData(parsed);
    const saved = await prisma.projectAutoApprovalRule.upsert({
      where: { projectId: parsed.projectId },
      update: data,
      create: { projectId: parsed.projectId, ...data },
    });
    await audit(
      "ProjectAutoApprovalRule",
      saved.id,
      "PROJECT_AUTO_APPROVAL_RULE_SAVED",
      previous,
      data,
    );
    revalidateProjectViews();
    return { ok: true, data: { id: saved.id } };
  } catch (error) {
    return toFailure(error);
  }
}

/**
 * Vincula consultores à aprovação automática do projeto (modo exclusivo): cria
 * uma ConsultantAutoApprovalRule por consultor, semeada a partir da regra do
 * projeto (ou defaults). Idempotente: ignora consultores que já têm regra.
 */
export async function linkConsultantsToAutoApproval(
  input: LinkAutoApprovalConsultantsInput,
): Promise<ActionResult<{ created: number }>> {
  try {
    ensureDatabase();
    await requireRole(PROJECT_WRITE_ROLES);
    const parsed = parseInput(linkAutoApprovalConsultantsSchema, input);
    const projectRule = await prisma.projectAutoApprovalRule.findUnique({
      where: { projectId: parsed.projectId },
    });
    const seed = autoApprovalRuleData(
      projectRule ?? {
        weekendEnabled: false,
        hoursRangeEnabled: false,
        minMinutes: 1,
        maxMinutes: 1439,
      },
    );
    // Só vincula consultores efetivamente alocados ao projeto (a regra vale para
    // "consultores cadastrados no projeto"). A UI já filtra, mas a action valida.
    const [allocated, existing] = await Promise.all([
      prisma.allocation.findMany({
        where: { projectId: parsed.projectId, consultantId: { in: parsed.consultantIds } },
        select: { consultantId: true },
        distinct: ["consultantId"],
      }),
      prisma.consultantAutoApprovalRule.findMany({
        where: { projectId: parsed.projectId, consultantId: { in: parsed.consultantIds } },
        select: { consultantId: true },
      }),
    ]);
    const allocatedIds = new Set(allocated.map((a) => a.consultantId));
    const existingIds = new Set(existing.map((r) => r.consultantId));
    const toCreate = parsed.consultantIds.filter(
      (id) => allocatedIds.has(id) && !existingIds.has(id),
    );
    if (toCreate.length > 0) {
      await prisma.consultantAutoApprovalRule.createMany({
        data: toCreate.map((consultantId) => ({
          consultantId,
          projectId: parsed.projectId,
          ...seed,
        })),
      });
      await audit(
        "Project",
        parsed.projectId,
        "AUTO_APPROVAL_CONSULTANTS_LINKED",
        null,
        { consultantIds: toCreate, seed },
      );
      // Cadastrar regra(s) por consultor inativa a regra do projeto.
      await deactivateProjectRuleForExclusiveMode(parsed.projectId);
    }
    revalidateProjectViews();
    return { ok: true, data: { created: toCreate.length } };
  } catch (error) {
    return toFailure(error);
  }
}

/** Atualiza a regra de aprovação automática de um consultor (por id implícito). */
export async function upsertConsultantAutoApprovalRule(
  input: ConsultantAutoApprovalRuleInput,
): Promise<ActionResult<{ id: string }>> {
  try {
    ensureDatabase();
    await requireRole(PROJECT_WRITE_ROLES);
    const parsed = parseInput(consultantAutoApprovalRuleSchema, input);
    const allocation = await prisma.allocation.findFirst({
      where: { projectId: parsed.projectId, consultantId: parsed.consultantId },
      select: { id: true },
    });
    if (!allocation) {
      throw new ActionError(
        "INVALID_INPUT",
        "Consultor nao esta alocado neste projeto.",
      );
    }
    const previous = await prisma.consultantAutoApprovalRule.findUnique({
      where: {
        consultantId_projectId: {
          consultantId: parsed.consultantId,
          projectId: parsed.projectId,
        },
      },
    });
    const data = autoApprovalRuleData(parsed);
    const saved = await prisma.consultantAutoApprovalRule.upsert({
      where: {
        consultantId_projectId: {
          consultantId: parsed.consultantId,
          projectId: parsed.projectId,
        },
      },
      update: data,
      create: {
        consultantId: parsed.consultantId,
        projectId: parsed.projectId,
        ...data,
      },
    });
    await audit(
      "ConsultantAutoApprovalRule",
      saved.id,
      "CONSULTANT_AUTO_APPROVAL_RULE_SAVED",
      previous,
      data,
    );
    // Cadastrar/ativar uma regra por consultor inativa a regra do projeto.
    await deactivateProjectRuleForExclusiveMode(parsed.projectId);
    revalidateProjectViews();
    return { ok: true, data: { id: saved.id } };
  } catch (error) {
    return toFailure(error);
  }
}

/** Remove a regra de aprovação automática de um consultor. */
export async function deleteConsultantAutoApprovalRule(
  input: { id: string },
): Promise<ActionResult<{ id: string }>> {
  try {
    ensureDatabase();
    await requireRole(PROJECT_WRITE_ROLES);
    const parsed = parseInput(removeConsultantAutoApprovalRuleSchema, input);
    const previous = await prisma.consultantAutoApprovalRule.findUnique({
      where: { id: parsed.id },
    });
    if (!previous) throw new ActionError("NOT_FOUND", "Regra nao encontrada.");
    await prisma.consultantAutoApprovalRule.delete({ where: { id: parsed.id } });
    await audit(
      "ConsultantAutoApprovalRule",
      parsed.id,
      "CONSULTANT_AUTO_APPROVAL_RULE_DELETED",
      previous,
      null,
    );
    revalidateProjectViews();
    return { ok: true, data: { id: parsed.id } };
  } catch (error) {
    return toFailure(error);
  }
}

/** Inativa/reativa a regra de aprovação automática do projeto. */
export async function setProjectAutoApprovalActive(
  input: SetProjectAutoApprovalActiveInput,
): Promise<ActionResult<{ active: boolean }>> {
  try {
    ensureDatabase();
    await requireRole(PROJECT_WRITE_ROLES);
    const parsed = parseInput(setProjectAutoApprovalActiveSchema, input);
    const previous = await prisma.projectAutoApprovalRule.findUnique({
      where: { projectId: parsed.projectId },
      select: { id: true, active: true },
    });
    if (!previous) throw new ActionError("NOT_FOUND", "Regra nao encontrada.");
    if (previous.active === parsed.active) {
      return { ok: true, data: { active: previous.active } };
    }
    // Não reativa a regra do projeto enquanto houver regra por consultor ativa
    // (modo exclusivo): inative as regras por consultor primeiro.
    if (parsed.active) {
      const activeConsultantRules = await prisma.consultantAutoApprovalRule.count({
        where: { projectId: parsed.projectId, active: true },
      });
      if (activeConsultantRules > 0) {
        throw new ActionError(
          "INVALID_INPUT",
          "Inative as regras por consultor antes de reativar a regra do projeto.",
        );
      }
    }
    await prisma.projectAutoApprovalRule.update({
      where: { projectId: parsed.projectId },
      data: { active: parsed.active },
    });
    await audit(
      "ProjectAutoApprovalRule",
      previous.id,
      parsed.active
        ? "PROJECT_AUTO_APPROVAL_RULE_ACTIVATED"
        : "PROJECT_AUTO_APPROVAL_RULE_DEACTIVATED",
      { active: previous.active },
      { active: parsed.active },
    );
    revalidateProjectViews();
    return { ok: true, data: { active: parsed.active } };
  } catch (error) {
    return toFailure(error);
  }
}

/** Inativa/reativa a regra de aprovação automática de um consultor. */
export async function setConsultantAutoApprovalActive(
  input: SetConsultantAutoApprovalActiveInput,
): Promise<ActionResult<{ active: boolean }>> {
  try {
    ensureDatabase();
    await requireRole(PROJECT_WRITE_ROLES);
    const parsed = parseInput(setConsultantAutoApprovalActiveSchema, input);
    const previous = await prisma.consultantAutoApprovalRule.findUnique({
      where: { id: parsed.id },
      select: { id: true, active: true, projectId: true },
    });
    if (!previous) throw new ActionError("NOT_FOUND", "Regra nao encontrada.");
    if (previous.active === parsed.active) {
      return { ok: true, data: { active: previous.active } };
    }
    await prisma.consultantAutoApprovalRule.update({
      where: { id: parsed.id },
      data: { active: parsed.active },
    });
    await audit(
      "ConsultantAutoApprovalRule",
      previous.id,
      parsed.active
        ? "CONSULTANT_AUTO_APPROVAL_RULE_ACTIVATED"
        : "CONSULTANT_AUTO_APPROVAL_RULE_DEACTIVATED",
      { active: previous.active },
      { active: parsed.active },
    );
    // Reativar uma regra por consultor reativa o modo exclusivo → inativa a
    // regra do projeto.
    if (parsed.active) {
      await deactivateProjectRuleForExclusiveMode(previous.projectId);
    }
    revalidateProjectViews();
    return { ok: true, data: { active: parsed.active } };
  } catch (error) {
    return toFailure(error);
  }
}

export async function createAllocation(
  input: AllocationInput,
): Promise<ActionResult<{ id: string }>> {
  try {
    ensureDatabase();
    await requireRole(PROJECT_WRITE_ROLES);
    const parsed = parseInput(allocationInputSchema, input);
    const allocation = await prisma.allocation.create({
      data: allocationData(parsed),
    });
    await audit("Allocation", allocation.id, "ALLOCATION_CREATED", null, parsed);
    revalidateProjectViews();
    return { ok: true, data: { id: allocation.id } };
  } catch (error) {
    return toFailure(error);
  }
}

export async function updateAllocation(
  input: AllocationUpdateInput,
): Promise<ActionResult<{ id: string }>> {
  try {
    ensureDatabase();
    await requireRole(PROJECT_WRITE_ROLES);
    const parsed = parseInput(allocationUpdateSchema, input);
    const previous = await prisma.allocation.findUnique({ where: { id: parsed.id } });
    if (!previous) throw new ActionError("NOT_FOUND", "Vinculo nao encontrado.");
    await prisma.allocation.update({
      where: { id: parsed.id },
      data: allocationData(parsed),
    });
    await audit("Allocation", parsed.id, "ALLOCATION_UPDATED", previous, parsed);
    revalidateProjectViews();
    return { ok: true, data: { id: parsed.id } };
  } catch (error) {
    return toFailure(error);
  }
}

export interface RemoveAllocationResult {
  id: string;
  /** "deactivated" = kept as INACTIVE (had hours); "deleted" = hard removed. */
  outcome: "deactivated" | "deleted";
}

/**
 * Remove a consultant link from a project.
 * - If the allocation already has ANY time entry, it is kept for history and
 *   flagged INACTIVE (so logged hours, revenue and payments stay intact).
 * - If it has NO time entry, it is treated as a linking mistake and hard
 *   deleted, cleaning up its dependent rows (timesheet default, sale/cost rates,
 *   allocation skills) in a single transaction.
 */
export async function removeAllocation(
  input: AllocationRemoveInput,
): Promise<ActionResult<RemoveAllocationResult>> {
  try {
    ensureDatabase();
    await requireRole(PROJECT_WRITE_ROLES);
    const parsed = parseInput(allocationRemoveSchema, input);
    const allocation = await prisma.allocation.findUnique({
      where: { id: parsed.id },
      select: { id: true, status: true, consultantId: true, projectId: true },
    });
    if (!allocation) throw new ActionError("NOT_FOUND", "Vinculo nao encontrado.");

    const entryCount = await prisma.timeEntry.count({
      where: { allocationId: parsed.id },
    });

    if (entryCount > 0) {
      // Has logged hours: deactivate, keep the row for history.
      if (allocation.status === "INACTIVE") {
        return { ok: true, data: { id: parsed.id, outcome: "deactivated" } };
      }
      await prisma.allocation.update({
        where: { id: parsed.id },
        data: { status: "INACTIVE" },
      });
      await audit(
        "Allocation",
        parsed.id,
        "ALLOCATION_DEACTIVATED",
        allocation,
        { status: "INACTIVE" },
      );
      revalidateProjectViews();
      return { ok: true, data: { id: parsed.id, outcome: "deactivated" } };
    }

    // No logged hours: linking mistake — hard delete with dependent cleanup.
    await prisma.$transaction(async (tx) => {
      await tx.allocationSkill.deleteMany({ where: { allocationId: parsed.id } });
      await tx.projectSaleRate.deleteMany({ where: { allocationId: parsed.id } });
      await tx.consultantAllocationCostRate.deleteMany({
        where: { allocationId: parsed.id },
      });
      await tx.timesheetDefault.deleteMany({ where: { allocationId: parsed.id } });
      await tx.allocation.delete({ where: { id: parsed.id } });
    });
    await audit("Allocation", parsed.id, "ALLOCATION_DELETED", allocation, null);
    revalidateProjectViews();
    return { ok: true, data: { id: parsed.id, outcome: "deleted" } };
  } catch (error) {
    return toFailure(error);
  }
}

export async function createSaleRate(
  input: SaleRateInput,
): Promise<ActionResult<{ id: string }>> {
  try {
    ensureDatabase();
    await requireRole(SALE_RATE_ROLES);
    const parsed = parseInput(saleRateInputSchema, input);
    const rate = await prisma.$transaction(async (tx) => {
      const candidate = await ensureSaleRateScope(tx, parsed);
      await ensureNoSaleRateOverlap(tx, candidate);
      return tx.projectSaleRate.create({ data: saleRateData(parsed) });
    });
    await audit("ProjectSaleRate", rate.id, "PROJECT_SALE_RATE_CREATED", null, parsed);
    revalidateProjectViews();
    return { ok: true, data: { id: rate.id } };
  } catch (error) {
    return toFailure(error);
  }
}

export async function updateSaleRate(
  input: SaleRateUpdateInput,
): Promise<ActionResult<{ id: string }>> {
  try {
    ensureDatabase();
    await requireRole(SALE_RATE_ROLES);
    const parsed = parseInput(saleRateUpdateSchema, input);
    const previous = await prisma.projectSaleRate.findUnique({
      where: { id: parsed.id },
    });
    if (!previous) {
      throw new ActionError("NOT_FOUND", "Valor de venda nao encontrado.");
    }
    await prisma.$transaction(async (tx) => {
      const candidate = { ...(await ensureSaleRateScope(tx, parsed)), id: parsed.id };
      await ensureNoSaleRateOverlap(tx, candidate);
      await tx.projectSaleRate.update({
        where: { id: parsed.id },
        data: saleRateData(parsed),
      });
    });
    await audit("ProjectSaleRate", parsed.id, "PROJECT_SALE_RATE_UPDATED", previous, parsed);
    revalidateProjectViews();
    return { ok: true, data: { id: parsed.id } };
  } catch (error) {
    return toFailure(error);
  }
}

// ── Tipo de pagamento (comercial) ────────────────────────────────────────
// Condição/prazo de pagamento do cliente. Patch isolado (não toca budget/valor
// de venda). Gated por SALE_RATE_ROLES; auditado como mudança comercial.

export async function updateProjectPaymentType(
  input: ProjectPaymentTypeInput,
): Promise<ActionResult<{ id: string }>> {
  try {
    ensureDatabase();
    await requireRole(SALE_RATE_ROLES);
    const parsed = parseInput(projectPaymentTypeSchema, input);
    const previous = await prisma.project.findUnique({
      where: { id: parsed.id },
      select: { paymentType: true },
    });
    if (!previous) throw new ActionError("NOT_FOUND", "Projeto nao encontrado.");
    const data = { paymentType: parsed.paymentType ?? null };
    await prisma.project.update({ where: { id: parsed.id }, data });
    await audit("Project", parsed.id, "PROJECT_PAYMENT_TYPE_UPDATED", previous, data);
    revalidateProjectViews();
    return { ok: true, data: { id: parsed.id } };
  } catch (error) {
    return toFailure(error);
  }
}

// ── Termo de aceite (INFORMATIVO) ─────────────────────────────────────────
// Marca o termo como aceito (data + usuário atual). Operacional
// (PROJECT_WRITE_ROLES). NÃO bloqueia lançamento nem faturamento (D3). A flag
// requiresAcceptanceTerm é editada no ProjectModal (updateProject).

export async function markProjectAcceptanceAccepted(
  input: ProjectAcceptanceTermInput,
): Promise<ActionResult<{ id: string; acceptedAt: string }>> {
  try {
    ensureDatabase();
    const user = await requireRole(PROJECT_WRITE_ROLES);
    const parsed = parseInput(projectAcceptanceTermSchema, input);
    const previous = await prisma.project.findUnique({
      where: { id: parsed.id },
      select: {
        requiresAcceptanceTerm: true,
        acceptanceTermAcceptedAt: true,
        acceptanceTermAcceptedByUserId: true,
      },
    });
    if (!previous) throw new ActionError("NOT_FOUND", "Projeto nao encontrado.");
    if (!previous.requiresAcceptanceTerm) {
      throw new ActionError(
        "INVALID_INPUT",
        "Este projeto nao exige termo de aceite.",
      );
    }
    if (previous.acceptanceTermAcceptedAt) {
      // Idempotente: já aceito, não regrava a data/autor.
      return {
        ok: true,
        data: {
          id: parsed.id,
          acceptedAt: previous.acceptanceTermAcceptedAt.toISOString(),
        },
      };
    }
    const dbUser = await resolveDbUser(user);
    const acceptedAt = new Date();
    const data = {
      acceptanceTermAcceptedAt: acceptedAt,
      acceptanceTermAcceptedByUserId: dbUser?.id ?? null,
    };
    await prisma.project.update({ where: { id: parsed.id }, data });
    await audit("Project", parsed.id, "PROJECT_ACCEPTANCE_TERM_ACCEPTED", previous, data);
    revalidateProjectViews();
    return { ok: true, data: { id: parsed.id, acceptedAt: acceptedAt.toISOString() } };
  } catch (error) {
    return toFailure(error);
  }
}

// ── Recebimentos previstos do cliente (lado receita) ──────────────────────
// ProjectReceivableSchedule: parcelas com data/valor/situação. Dado financeiro
// (D1), gated por RECEIVABLE_ROLES (comercial ∪ financeiro) e auditado. Dedupe:
// rejeita uma parcela idêntica (mesma data + valor + rótulo) no projeto.

function receivableData(
  input: ReceivableInput,
): Prisma.ProjectReceivableScheduleUncheckedCreateInput {
  return {
    projectId: input.projectId,
    dueAt: toDate(input.dueAt),
    amount: input.amount,
    label: input.label,
    status: input.status,
    note: input.note ?? null,
  };
}

async function ensureNoDuplicateReceivable(
  input: ReceivableInput,
  excludeId?: string,
): Promise<void> {
  const existing = await prisma.projectReceivableSchedule.findMany({
    where: {
      projectId: input.projectId,
      dueAt: toDate(input.dueAt),
      label: input.label,
    },
    select: { id: true, amount: true },
  });
  const duplicate = existing.some(
    (row) => row.id !== excludeId && Number(row.amount) === input.amount,
  );
  if (duplicate) {
    throw new ActionError(
      "INVALID_INPUT",
      "Ja existe um recebimento identico (mesma data, valor e rotulo).",
    );
  }
}

export async function createReceivable(
  input: ReceivableInput,
): Promise<ActionResult<{ id: string }>> {
  try {
    ensureDatabase();
    await requireRole(RECEIVABLE_ROLES);
    const parsed = parseInput(receivableInputSchema, input);
    const project = await prisma.project.findUnique({
      where: { id: parsed.projectId },
      select: { id: true },
    });
    if (!project) throw new ActionError("NOT_FOUND", "Projeto nao encontrado.");
    await ensureNoDuplicateReceivable(parsed);
    const created = await prisma.projectReceivableSchedule.create({
      data: receivableData(parsed),
      select: { id: true },
    });
    await audit(
      "ProjectReceivableSchedule",
      created.id,
      "PROJECT_RECEIVABLE_CREATED",
      null,
      parsed,
    );
    revalidateProjectViews();
    return { ok: true, data: created };
  } catch (error) {
    return toFailure(error);
  }
}

export async function updateReceivable(
  input: ReceivableUpdateInput,
): Promise<ActionResult<{ id: string }>> {
  try {
    ensureDatabase();
    await requireRole(RECEIVABLE_ROLES);
    const parsed = parseInput(receivableUpdateSchema, input);
    const previous = await prisma.projectReceivableSchedule.findUnique({
      where: { id: parsed.id },
    });
    if (!previous) {
      throw new ActionError("NOT_FOUND", "Recebimento nao encontrado.");
    }
    await ensureNoDuplicateReceivable(parsed, parsed.id);
    await prisma.projectReceivableSchedule.update({
      where: { id: parsed.id },
      data: receivableData(parsed),
    });
    await audit(
      "ProjectReceivableSchedule",
      parsed.id,
      "PROJECT_RECEIVABLE_UPDATED",
      previous,
      parsed,
    );
    revalidateProjectViews();
    return { ok: true, data: { id: parsed.id } };
  } catch (error) {
    return toFailure(error);
  }
}

export async function deleteReceivable(
  input: { id: string },
): Promise<ActionResult<{ id: string }>> {
  try {
    ensureDatabase();
    await requireRole(RECEIVABLE_ROLES);
    const parsed = parseInput(receivableRemoveSchema, input);
    const previous = await prisma.projectReceivableSchedule.findUnique({
      where: { id: parsed.id },
    });
    if (!previous) {
      throw new ActionError("NOT_FOUND", "Recebimento nao encontrado.");
    }
    await prisma.projectReceivableSchedule.delete({ where: { id: parsed.id } });
    await audit(
      "ProjectReceivableSchedule",
      parsed.id,
      "PROJECT_RECEIVABLE_DELETED",
      previous,
      null,
    );
    revalidateProjectViews();
    return { ok: true, data: { id: parsed.id } };
  } catch (error) {
    return toFailure(error);
  }
}

// ── Custo por alocação (margem/PR) ───────────────────────────────────────
// Valor que PAGAMOS pelo consultor numa alocação, com vigência. Distinto do
// valor de venda (ProjectSaleRate). Editado só pelo Financeiro (FINANCIAL_ROLES).

/** Load the allocation a cost rate targets and return its consultant/project. */
async function loadAllocationForCostRate(
  tx: Prisma.TransactionClient,
  allocationId: string,
): Promise<{ consultantId: string; projectId: string }> {
  const allocation = await tx.allocation.findUnique({
    where: { id: allocationId },
    select: { consultantId: true, projectId: true },
  });
  if (!allocation) {
    throw new ActionError("NOT_FOUND", "Alocação não encontrada.");
  }
  return allocation;
}

async function ensureNoCostRateOverlap(
  tx: Prisma.TransactionClient,
  allocationId: string,
  candidate: { id?: string; startsAt: string; endsAt?: string | null },
): Promise<void> {
  const existing = await tx.consultantAllocationCostRate.findMany({
    where: { allocationId },
    select: { id: true, startsAt: true, endsAt: true },
  });
  const overlap = existing.some((row) => {
    if (candidate.id && row.id === candidate.id) return false;
    return rangesOverlap(
      { startsAt: dateToIso(row.startsAt), endsAt: row.endsAt ? dateToIso(row.endsAt) : null },
      { startsAt: candidate.startsAt, endsAt: candidate.endsAt ?? null },
    );
  });
  if (overlap) {
    throw new ActionError(
      "INVALID_INPUT",
      "Já existe custo vigente para esta alocação no período.",
    );
  }
}

export async function createCostRate(
  input: CostRateInput,
): Promise<ActionResult<{ id: string }>> {
  try {
    ensureDatabase();
    await requireRole(FINANCIAL_ROLES);
    const parsed = parseInput(costRateInputSchema, input);
    const created = await prisma.$transaction(async (tx) => {
      const allocation = await loadAllocationForCostRate(tx, parsed.allocationId);
      await ensureNoCostRateOverlap(tx, parsed.allocationId, parsed);
      return tx.consultantAllocationCostRate.create({
        data: {
          consultantId: allocation.consultantId,
          allocationId: parsed.allocationId,
          startsAt: toDate(parsed.startsAt),
          endsAt: parsed.endsAt ? toDate(parsed.endsAt) : null,
          hourlyCost: parsed.hourlyCost,
          currency: parsed.currency,
          note: parsed.note,
        },
        select: { id: true },
      });
    });
    await audit("ConsultantAllocationCostRate", created.id, "COST_RATE_CREATED", null, parsed);
    revalidateProjectViews();
    return { ok: true, data: created };
  } catch (error) {
    return toFailure(error);
  }
}

export async function updateCostRate(
  input: CostRateUpdateInput,
): Promise<ActionResult<{ id: string }>> {
  try {
    ensureDatabase();
    await requireRole(FINANCIAL_ROLES);
    const parsed = parseInput(costRateUpdateSchema, input);
    const previous = await prisma.consultantAllocationCostRate.findUnique({
      where: { id: parsed.id },
    });
    if (!previous) throw new ActionError("NOT_FOUND", "Custo não encontrado.");
    await prisma.$transaction(async (tx) => {
      await ensureNoCostRateOverlap(tx, parsed.allocationId, parsed);
      await tx.consultantAllocationCostRate.update({
        where: { id: parsed.id },
        data: {
          startsAt: toDate(parsed.startsAt),
          endsAt: parsed.endsAt ? toDate(parsed.endsAt) : null,
          hourlyCost: parsed.hourlyCost,
          currency: parsed.currency,
          note: parsed.note,
        },
      });
    });
    await audit("ConsultantAllocationCostRate", parsed.id, "COST_RATE_UPDATED", previous, parsed);
    revalidateProjectViews();
    return { ok: true, data: { id: parsed.id } };
  } catch (error) {
    return toFailure(error);
  }
}

export async function deleteCostRate(
  input: { id: string },
): Promise<ActionResult<{ id: string }>> {
  try {
    ensureDatabase();
    await requireRole(FINANCIAL_ROLES);
    const parsed = parseInput(costRateRemoveSchema, input);
    const previous = await prisma.consultantAllocationCostRate.findUnique({
      where: { id: parsed.id },
    });
    if (!previous) throw new ActionError("NOT_FOUND", "Custo não encontrado.");
    await prisma.consultantAllocationCostRate.delete({ where: { id: parsed.id } });
    await audit("ConsultantAllocationCostRate", parsed.id, "COST_RATE_DELETED", previous, null);
    revalidateProjectViews();
    return { ok: true, data: parsed };
  } catch (error) {
    return toFailure(error);
  }
}

async function ensureActiveSkill(skillId: string): Promise<void> {
  const skill = await prisma.skill.findUnique({
    where: { id: skillId },
    select: { status: true },
  });
  if (!skill) {
    throw new ActionError("NOT_FOUND", "Skill nao encontrada no catalogo.");
  }
  if (skill.status !== "ACTIVE") {
    throw new ActionError(
      "INVALID_INPUT",
      "Selecione uma skill ativa do catalogo.",
    );
  }
}

// Tags a catalog Skill onto a specific Allocation (consultant on a project).
// This is intentionally independent from ConsultantSkill (the consultant's own
// validated skill profile) — it only records the skill used on this project.
export async function addAllocationSkill(
  input: AllocationSkillInput,
): Promise<ActionResult<{ id: string }>> {
  try {
    ensureDatabase();
    await requireRole(PROJECT_WRITE_ROLES);
    const parsed = parseInput(allocationSkillInputSchema, input);
    const allocation = await prisma.allocation.findUnique({
      where: { id: parsed.allocationId },
      select: { id: true },
    });
    if (!allocation) {
      throw new ActionError("NOT_FOUND", "Vinculo nao encontrado.");
    }
    await ensureActiveSkill(parsed.skillId);
    const created = await prisma.allocationSkill.create({
      data: {
        allocationId: parsed.allocationId,
        skillId: parsed.skillId,
        level: parsed.level,
        note: parsed.note,
      },
    });
    await audit(
      "AllocationSkill",
      created.id,
      "ALLOCATION_SKILL_ADDED",
      null,
      parsed,
    );
    revalidateProjectViews();
    return { ok: true, data: { id: created.id } };
  } catch (error) {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2002"
    ) {
      return {
        ok: false,
        error: "INVALID_INPUT",
        message: "Skill ja adicionada a esta alocacao.",
      };
    }
    return toFailure(error);
  }
}

export async function updateAllocationSkill(
  input: AllocationSkillUpdateInput,
): Promise<ActionResult<{ id: string }>> {
  try {
    ensureDatabase();
    await requireRole(PROJECT_WRITE_ROLES);
    const parsed = parseInput(allocationSkillUpdateSchema, input);
    const previous = await prisma.allocationSkill.findUnique({
      where: { id: parsed.id },
    });
    if (!previous) {
      throw new ActionError("NOT_FOUND", "Skill da alocacao nao encontrada.");
    }
    await prisma.allocationSkill.update({
      where: { id: parsed.id },
      data: { level: parsed.level ?? null, note: parsed.note ?? null },
    });
    await audit(
      "AllocationSkill",
      parsed.id,
      "ALLOCATION_SKILL_UPDATED",
      previous,
      parsed,
    );
    revalidateProjectViews();
    return { ok: true, data: { id: parsed.id } };
  } catch (error) {
    return toFailure(error);
  }
}

export async function removeAllocationSkill(
  input: AllocationSkillRemoveInput,
): Promise<ActionResult<{ id: string }>> {
  try {
    ensureDatabase();
    await requireRole(PROJECT_WRITE_ROLES);
    const parsed = parseInput(allocationSkillRemoveSchema, input);
    const previous = await prisma.allocationSkill.findUnique({
      where: { id: parsed.id },
    });
    if (!previous) {
      throw new ActionError("NOT_FOUND", "Skill da alocacao nao encontrada.");
    }
    await prisma.allocationSkill.delete({ where: { id: parsed.id } });
    await audit(
      "AllocationSkill",
      parsed.id,
      "ALLOCATION_SKILL_REMOVED",
      previous,
      null,
    );
    revalidateProjectViews();
    return { ok: true, data: { id: parsed.id } };
  } catch (error) {
    return toFailure(error);
  }
}
