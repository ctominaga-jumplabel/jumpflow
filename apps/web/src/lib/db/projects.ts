import { prisma } from "@jumpflow/database";
import type { Prisma } from "@jumpflow/database";
import type {
  ProjectAllocationItem,
  ProjectAllocationSkillItem,
  ProjectClientOption,
  ProjectConsultantOption,
  ProjectItem,
  ProjectManagerOption,
  ProjectSaleRateItem,
  ProjectSkillOption,
  SkillLevel,
} from "@/lib/projects/types";
import { isDatabaseConfigured } from "./config";

function decimalToNumber(value: Prisma.Decimal | null): number | undefined {
  return value === null ? undefined : Number(value);
}

function dateToIso(value: Date): string {
  return value.toISOString().slice(0, 10);
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
      billingHourlyRate: includeFinancials
        ? decimalToNumber(row.billingHourlyRate)
        : undefined,
      budgetHours: includeFinancials ? decimalToNumber(row.budgetHours) : undefined,
      costCenter: includeFinancials ? (row.costCenter ?? undefined) : undefined,
      consumedHours,
      allocatedConsultants: allocations.filter((item) => item.status === "ACTIVE")
        .length,
      allocations,
      saleRates,
    };
  });
}
