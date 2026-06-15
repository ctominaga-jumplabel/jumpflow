import { prisma } from "@jumpflow/database";
import type { Prisma } from "@jumpflow/database";
import type { BillingTypeItem, ClientItem } from "@/lib/clients/types";
import { isDatabaseConfigured } from "./config";

function decimalToNumber(value: Prisma.Decimal | null): number | undefined {
  return value === null ? undefined : Number(value);
}

export async function listBillingTypes(): Promise<BillingTypeItem[]> {
  if (!isDatabaseConfigured()) return [];
  const rows = await prisma.billingType.findMany({
    orderBy: [{ active: "desc" }, { name: "asc" }],
  });
  return rows.map((row) => ({
    id: row.id,
    name: row.name,
    chargeType: row.chargeType,
    roundingRule: row.roundingRule,
    description: row.description ?? undefined,
    active: row.active,
  }));
}

export async function listClients(options?: {
  includeFinancials?: boolean;
}): Promise<ClientItem[]> {
  if (!isDatabaseConfigured()) return [];
  const includeFinancials = Boolean(options?.includeFinancials);
  const rows = await prisma.client.findMany({
    include: {
      billingType: { select: { name: true } },
      _count: { select: { projects: true } },
    },
    orderBy: [{ status: "asc" }, { name: "asc" }],
  });
  return rows.map((row) => ({
    id: row.id,
    name: row.name,
    document: row.document ?? undefined,
    logoUrl: row.logoUrl ?? undefined,
    billingTypeId: includeFinancials ? (row.billingTypeId ?? undefined) : undefined,
    billingTypeName: includeFinancials ? (row.billingType?.name ?? undefined) : undefined,
    defaultHourlyRate: includeFinancials
      ? decimalToNumber(row.defaultHourlyRate)
      : undefined,
    monthlyFee: includeFinancials ? decimalToNumber(row.monthlyFee) : undefined,
    hourLimit: includeFinancials ? decimalToNumber(row.hourLimit) : undefined,
    roundingRule: includeFinancials ? row.roundingRule : "NONE",
    billingDay: includeFinancials ? (row.billingDay ?? undefined) : undefined,
    dueDay: includeFinancials ? (row.dueDay ?? undefined) : undefined,
    invoiceKind: includeFinancials ? row.invoiceKind : "SERVICE",
    municipality: includeFinancials ? (row.municipality ?? undefined) : undefined,
    issRate: includeFinancials ? decimalToNumber(row.issRate) : undefined,
    taxRules:
      includeFinancials && row.taxRules
        ? JSON.stringify(row.taxRules)
        : undefined,
    status: row.status,
    projectCount: row._count.projects,
  }));
}
