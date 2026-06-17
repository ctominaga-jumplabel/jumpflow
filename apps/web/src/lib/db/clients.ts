import { prisma } from "@jumpflow/database";
import type { Prisma } from "@jumpflow/database";
import type { BillingTypeItem, ClientItem } from "@/lib/clients/types";
import {
  CLIENT_LOGOS_BUCKET,
  getStorageProvider,
  isStorageConfigured,
} from "@/lib/storage/provider";
import { isDatabaseConfigured } from "./config";

const LOGO_SIGNED_URL_TTL_SECONDS = 3600; // 1h — brand asset, low sensitivity.

/** A `logoUrl` is a storage key (not a plain URL) when it lives in our bucket. */
export function isLogoStorageKey(value: string): boolean {
  return value.startsWith(`${CLIENT_LOGOS_BUCKET}/`);
}

/**
 * Resolve a `logoUrl` field for display. Plain URLs (legacy text input) pass
 * through untouched; storage keys are turned into a short-lived signed URL.
 * When storage is unavailable the key cannot be displayed, so it degrades to
 * undefined (the UI falls back to the building icon) instead of a broken image.
 */
async function resolveLogoUrl(
  value: string | null,
): Promise<string | undefined> {
  if (!value) return undefined;
  if (!isLogoStorageKey(value)) return value;
  if (!isStorageConfigured()) return undefined;
  const provider = getStorageProvider(CLIENT_LOGOS_BUCKET);
  if (!provider) return undefined;
  try {
    return await provider.getSignedUrl(value, LOGO_SIGNED_URL_TTL_SECONDS);
  } catch (error) {
    console.error("[clients] failed to sign logo url", error);
    return undefined;
  }
}

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
    howItWorks: row.howItWorks ?? undefined,
    example: row.example ?? undefined,
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
  const logoUrls = await Promise.all(
    rows.map((row) => resolveLogoUrl(row.logoUrl)),
  );
  return rows.map((row, index) => ({
    id: row.id,
    name: row.name,
    document: row.document ?? undefined,
    contactEmail: row.contactEmail ?? undefined,
    logoUrl: logoUrls[index],
    logoRef: row.logoUrl ?? undefined,
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
