"use server";

import { revalidatePath } from "next/cache";
import { Prisma, prisma } from "@jumpflow/database";
import type { ZodType } from "zod";
import type { ActionResult, ErrorCode } from "@/lib/actions/result";
import { requireRole, requireUser } from "@/lib/auth/guards";
import { hasRole } from "@/lib/auth/route-permissions";
import type { RoleName } from "@/lib/auth/types";
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
  projectInputSchema,
  projectUpdateSchema,
  saleRateInputSchema,
  saleRateUpdateSchema,
  type AllocationInput,
  type AllocationRemoveInput,
  type AllocationSkillInput,
  type AllocationSkillRemoveInput,
  type AllocationSkillUpdateInput,
  type AllocationUpdateInput,
  type ProjectInput,
  type ProjectUpdateInput,
  type SaleRateInput,
  type SaleRateUpdateInput,
} from "@/lib/projects/schemas";
import { findOverlappingSaleRate, type SaleRateRange } from "@/lib/projects/rates";

const PROJETOS_PATH = "/app/projetos";
const PROJECT_WRITE_ROLES: RoleName[] = [
  "ADMIN",
  "AREA_MANAGER",
  "PROJECT_MANAGER",
  "SALES",
];
const SALE_RATE_WRITE_ROLES: RoleName[] = [
  "ADMIN",
  "AREA_MANAGER",
  "FINANCE",
  "SALES",
];

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
  };
  if (!includeCommercialFields) return data;
  return {
    ...data,
    // Tipo de cobrança é decisão comercial: gravado junto dos demais campos
    // comerciais (apenas perfis com acesso a valores podem alterá-lo).
    billingTypeId: input.billingTypeId ?? null,
    billingHourlyRate: input.billingHourlyRate,
    budgetHours: input.budgetHours,
    costCenter: input.costCenter,
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
    const canWriteCommercials = hasRole(user, SALE_RATE_WRITE_ROLES);
    const data = projectData(parsed, canWriteCommercials);
    const project = await prisma.project.create({ data });
    await audit("Project", project.id, "PROJECT_CREATED", null, data);
    revalidatePath(PROJETOS_PATH);
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
    const canWriteCommercials = hasRole(user, SALE_RATE_WRITE_ROLES);
    const data = projectData(parsed, canWriteCommercials);
    await prisma.project.update({ where: { id: parsed.id }, data });
    await audit("Project", parsed.id, "PROJECT_UPDATED", previous, data);
    revalidatePath(PROJETOS_PATH);
    return { ok: true, data: { id: parsed.id } };
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
    revalidatePath(PROJETOS_PATH);
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
    revalidatePath(PROJETOS_PATH);
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
      revalidatePath(PROJETOS_PATH);
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
    revalidatePath(PROJETOS_PATH);
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
    await requireRole(SALE_RATE_WRITE_ROLES);
    const parsed = parseInput(saleRateInputSchema, input);
    const rate = await prisma.$transaction(async (tx) => {
      const candidate = await ensureSaleRateScope(tx, parsed);
      await ensureNoSaleRateOverlap(tx, candidate);
      return tx.projectSaleRate.create({ data: saleRateData(parsed) });
    });
    await audit("ProjectSaleRate", rate.id, "PROJECT_SALE_RATE_CREATED", null, parsed);
    revalidatePath(PROJETOS_PATH);
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
    await requireRole(SALE_RATE_WRITE_ROLES);
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
    revalidatePath(PROJETOS_PATH);
    return { ok: true, data: { id: parsed.id } };
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
    revalidatePath(PROJETOS_PATH);
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
    revalidatePath(PROJETOS_PATH);
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
    revalidatePath(PROJETOS_PATH);
    return { ok: true, data: { id: parsed.id } };
  } catch (error) {
    return toFailure(error);
  }
}
