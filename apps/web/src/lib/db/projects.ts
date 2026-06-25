import { prisma } from "@jumpflow/database";
import type { Prisma } from "@jumpflow/database";
import type {
  ProjectAllocationItem,
  ProjectAllocationSkillItem,
  ProjectBillingConfigItem,
  ProjectClientOption,
  ProjectConsultantOption,
  ProjectItem,
  ProjectManagerOption,
  ProjectSaleRateItem,
  ProjectSkillOption,
  SkillLevel,
} from "@/lib/projects/types";
import { projectHasSaleValue } from "@/lib/projects/pending";
import { isDatabaseConfigured } from "./config";

function decimalToNumber(value: Prisma.Decimal | null): number | undefined {
  return value === null ? undefined : Number(value);
}

function dateToIso(value: Date): string {
  return value.toISOString().slice(0, 10);
}

type ProjectBillingConfigRow = {
  periodicity: string;
  roundingRule: string;
  fixedAmount: Prisma.Decimal | null;
  includedHours: Prisma.Decimal | null;
  overageRate: Prisma.Decimal | null;
  overageTreatment: string;
  perConsultantAmount: Prisma.Decimal | null;
  reimbursableExpenses: boolean;
  reimbursableMarkupPct: Prisma.Decimal | null;
  discountPct: Prisma.Decimal | null;
  penaltyPct: Prisma.Decimal | null;
  adjustmentIndex: string;
  adjustmentPct: Prisma.Decimal | null;
  withholdIss: boolean;
  withholdingPct: Prisma.Decimal | null;
  closingDay: number | null;
  dueDay: number | null;
  requireApproval: boolean;
  overtimeAppliesTo: string;
  overtimeBillingPct: Prisma.Decimal | null;
  overtimeExcessHours: Prisma.Decimal | null;
  overtimeExcessRate: Prisma.Decimal | null;
  billDuringVacation: boolean;
  notes: string | null;
};

function mapBillingConfig(
  row: ProjectBillingConfigRow | null | undefined,
): ProjectBillingConfigItem | undefined {
  if (!row) return undefined;
  return {
    periodicity: row.periodicity as ProjectBillingConfigItem["periodicity"],
    roundingRule: row.roundingRule as ProjectBillingConfigItem["roundingRule"],
    fixedAmount: decimalToNumber(row.fixedAmount),
    includedHours: decimalToNumber(row.includedHours),
    overageRate: decimalToNumber(row.overageRate),
    overageTreatment:
      row.overageTreatment as ProjectBillingConfigItem["overageTreatment"],
    perConsultantAmount: decimalToNumber(row.perConsultantAmount),
    reimbursableExpenses: row.reimbursableExpenses,
    reimbursableMarkupPct: decimalToNumber(row.reimbursableMarkupPct),
    discountPct: decimalToNumber(row.discountPct),
    penaltyPct: decimalToNumber(row.penaltyPct),
    adjustmentIndex:
      row.adjustmentIndex as ProjectBillingConfigItem["adjustmentIndex"],
    adjustmentPct: decimalToNumber(row.adjustmentPct),
    withholdIss: row.withholdIss,
    withholdingPct: decimalToNumber(row.withholdingPct),
    closingDay: row.closingDay ?? undefined,
    dueDay: row.dueDay ?? undefined,
    requireApproval: row.requireApproval,
    overtimeAppliesTo:
      row.overtimeAppliesTo as ProjectBillingConfigItem["overtimeAppliesTo"],
    overtimeBillingPct: decimalToNumber(row.overtimeBillingPct),
    overtimeExcessHours: decimalToNumber(row.overtimeExcessHours),
    overtimeExcessRate: decimalToNumber(row.overtimeExcessRate),
    billDuringVacation: row.billDuringVacation,
    notes: row.notes ?? undefined,
  };
}

type ProjectSaleRateWithNames = {
  id: string;
  projectId: string;
  consultantId: string | null;
  consultant?: { name: string } | null;
  allocationId: string | null;
  allocation?: { role: string; consultant: { name: string } } | null;
  startsAt: Date;
  endsAt: Date | null;
  hourlyRate: Prisma.Decimal;
  currency: string;
  note: string | null;
};

export async function listProjectClients(): Promise<ProjectClientOption[]> {
  if (!isDatabaseConfigured()) return [];
  const rows = await prisma.client.findMany({
    where: { status: "ACTIVE" },
    select: { id: true, name: true },
    orderBy: { name: "asc" },
  });
  return rows;
}

export async function listProjectConsultants(): Promise<ProjectConsultantOption[]> {
  if (!isDatabaseConfigured()) return [];
  const rows = await prisma.consultant.findMany({
    where: { status: { in: ["ACTIVE", "ON_LEAVE"] } },
    select: { id: true, name: true },
    orderBy: { name: "asc" },
  });
  return rows;
}

export async function listSkillCatalog(): Promise<ProjectSkillOption[]> {
  if (!isDatabaseConfigured()) return [];
  const rows = await prisma.skill.findMany({
    where: { status: "ACTIVE" },
    select: { id: true, name: true, category: true },
    orderBy: [{ category: "asc" }, { name: "asc" }],
  });
  return rows.map((row) => ({
    id: row.id,
    name: row.name,
    category: row.category ?? undefined,
  }));
}

export async function listProjectManagers(): Promise<ProjectManagerOption[]> {
  if (!isDatabaseConfigured()) return [];
  const rows = await prisma.user.findMany({
    where: {
      roles: {
        some: {
          role: { name: { in: ["PROJECT_MANAGER", "AREA_MANAGER", "ADMIN"] } },
        },
      },
      status: "ACTIVE",
    },
    select: { id: true, name: true },
    orderBy: { name: "asc" },
  });
  return rows;
}

export async function listProjects(options?: {
  includeFinancials?: boolean;
}): Promise<ProjectItem[]> {
  if (!isDatabaseConfigured()) return [];
  const includeFinancials = Boolean(options?.includeFinancials);
  const rows = await prisma.project.findMany({
    include: {
      client: { select: { id: true, name: true } },
      billingType: { select: { name: true, chargeType: true } },
      billingConfig: includeFinancials,
      allocations: {
        include: {
          consultant: { select: { name: true } },
          allocationSkills: {
            include: {
              skill: { select: { name: true, category: true } },
            },
            orderBy: { createdAt: "asc" },
          },
        },
        orderBy: [{ status: "asc" }, { startDate: "desc" }],
      },
      saleRates: includeFinancials
        ? {
            include: {
              consultant: { select: { name: true } },
              allocation: {
                select: {
                  role: true,
                  consultant: { select: { name: true } },
                },
              },
            },
            orderBy: [{ startsAt: "desc" }],
          }
        : false,
      timeEntries: { select: { hours: true, status: true } },
      // Aprovação automática é dado operacional (não financeiro): sempre carregado.
      autoApprovalRule: true,
      autoApprovalConsultantRules: {
        include: { consultant: { select: { name: true } } },
        orderBy: { createdAt: "asc" },
      },
    },
    orderBy: [{ status: "asc" }, { name: "asc" }],
  });
  const managerIds = [
    ...new Set(rows.map((row) => row.managerUserId).filter(Boolean)),
  ] as string[];
  const managers =
    managerIds.length > 0
      ? await prisma.user.findMany({
          where: { id: { in: managerIds } },
          select: { id: true, name: true },
        })
      : [];
  const managerNames = new Map(managers.map((manager) => [manager.id, manager.name]));

  // Presence flags for the per-area pending queues. Derived by query (no
  // materialized state on Project): a sale value (cobertura por consultor OU
  // valor base do projeto) e a existência de uma regra de cobrança. Always-on
  // lookups (independentes de includeFinancials) para a Operação sinalizar
  // pendências mesmo com os valores mascarados por papel.
  const today = new Date();
  const [billingConfigRows, vigentRateRows] = await Promise.all([
    prisma.projectBillingConfig.findMany({ select: { projectId: true } }),
    prisma.projectSaleRate.findMany({
      where: {
        startsAt: { lte: today },
        OR: [{ endsAt: null }, { endsAt: { gte: today } }],
      },
      select: { projectId: true, consultantId: true, allocationId: true },
    }),
  ]);
  const billingConfigProjectIds = new Set(
    billingConfigRows.map((row) => row.projectId),
  );
  // Vigent sale rates grouped by project, used to decide whether every active/
  // planned allocation is priced (or a project-level base rate covers all).
  const vigentRatesByProject = new Map<
    string,
    { consultantId: string | null; allocationId: string | null }[]
  >();
  for (const rate of vigentRateRows) {
    const list = vigentRatesByProject.get(rate.projectId);
    const entry = {
      consultantId: rate.consultantId,
      allocationId: rate.allocationId,
    };
    if (list) list.push(entry);
    else vigentRatesByProject.set(rate.projectId, [entry]);
  }

  return rows.map((row) => {
    const allocations: ProjectAllocationItem[] = row.allocations.map((item) => {
      const skills: ProjectAllocationSkillItem[] = item.allocationSkills.map(
        (link) => ({
          id: link.id,
          allocationId: link.allocationId,
          skillId: link.skillId,
          skillName: link.skill.name,
          skillCategory: link.skill.category ?? undefined,
          level: (link.level as SkillLevel | null) ?? undefined,
          note: link.note ?? undefined,
        }),
      );
      return {
        id: item.id,
        projectId: item.projectId,
        consultantId: item.consultantId,
        consultantName: item.consultant.name,
        role: item.role,
        allocationPercent: item.allocationPercent,
        startDate: dateToIso(item.startDate),
        endDate: item.endDate ? dateToIso(item.endDate) : undefined,
        status: item.status,
        skills,
      };
    });
    const rateRows = includeFinancials
      ? (row.saleRates as ProjectSaleRateWithNames[])
      : [];
    const saleRates: ProjectSaleRateItem[] = rateRows.map((item) => ({
          id: item.id,
          projectId: item.projectId,
          consultantId: item.consultantId ?? undefined,
          consultantName: item.consultant?.name ?? undefined,
          allocationId: item.allocationId ?? undefined,
          allocationLabel: item.allocation
            ? `${item.allocation.consultant.name} - ${item.allocation.role}`
            : undefined,
          startsAt: dateToIso(item.startsAt),
          endsAt: item.endsAt ? dateToIso(item.endsAt) : undefined,
          hourlyRate: decimalToNumber(item.hourlyRate),
          currency: item.currency,
          note: item.note ?? undefined,
        }));
    const consumedHours = row.timeEntries
      .filter((entry) => entry.status !== "REJECTED")
      .reduce((sum, entry) => sum + Number(entry.hours), 0);
    return {
      id: row.id,
      clientId: row.client.id,
      clientName: row.client.name,
      name: row.name,
      description: row.description ?? undefined,
      status: row.status,
      managerUserId: row.managerUserId ?? undefined,
      managerName: row.managerUserId
        ? managerNames.get(row.managerUserId)
        : undefined,
      startDate: dateToIso(row.startDate),
      endDate: row.endDate ? dateToIso(row.endDate) : undefined,
      billingTypeId: includeFinancials ? (row.billingTypeId ?? undefined) : undefined,
      billingTypeName: includeFinancials
        ? (row.billingType?.name ?? undefined)
        : undefined,
      billingChargeType: includeFinancials
        ? (row.billingType?.chargeType ?? undefined)
        : undefined,
      billingConfig: includeFinancials
        ? mapBillingConfig(
            (row as { billingConfig?: ProjectBillingConfigRow | null })
              .billingConfig,
          )
        : undefined,
      billingHourlyRate: includeFinancials
        ? decimalToNumber(row.billingHourlyRate)
        : undefined,
      budgetHours: includeFinancials ? decimalToNumber(row.budgetHours) : undefined,
      // Centro de custo é um dado operacional (não um valor financeiro
      // sensível), então é retornado a qualquer perfil que veja o projeto.
      costCenter: row.costCenter ?? undefined,
      commercialContractRef: row.commercialContractRef ?? undefined,
      consumedHours,
      allocatedConsultants: allocations.filter((item) => item.status === "ACTIVE")
        .length,
      allocations,
      saleRates,
      hasActiveSaleRate: projectHasSaleValue(
        allocations,
        vigentRatesByProject.get(row.id) ?? [],
      ),
      hasBillingConfig: billingConfigProjectIds.has(row.id),
      autoApprovalRule: row.autoApprovalRule
        ? {
            active: row.autoApprovalRule.active,
            weekendEnabled: row.autoApprovalRule.weekendEnabled,
            hoursRangeEnabled: row.autoApprovalRule.hoursRangeEnabled,
            minMinutes: row.autoApprovalRule.minMinutes,
            maxMinutes: row.autoApprovalRule.maxMinutes,
          }
        : undefined,
      autoApprovalConsultantRules: row.autoApprovalConsultantRules.map((r) => ({
        id: r.id,
        consultantId: r.consultantId,
        consultantName: r.consultant.name,
        active: r.active,
        weekendEnabled: r.weekendEnabled,
        hoursRangeEnabled: r.hoursRangeEnabled,
        minMinutes: r.minMinutes,
        maxMinutes: r.maxMinutes,
      })),
    };
  });
}
