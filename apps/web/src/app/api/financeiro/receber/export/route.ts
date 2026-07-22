import { requireRole } from "@/lib/auth/guards";
import { FINANCIAL_ROLES } from "@/lib/auth/route-permissions";
import { isDatabaseConfigured } from "@/lib/db/config";
import { buildWorkbook, defineSheet, xlsxResponse } from "@/lib/export/xlsx";
import {
  filterRevenueRows,
  revenueXlsxColumns,
} from "@/lib/financial/financeiro-export";
import {
  revenueClosingStatusLabels,
  type RevenueClosingStatus,
} from "@/lib/financial/types";
import { noDatabaseResponse } from "../../../relatorios/shared";

export const dynamic = "force-dynamic";

function clampInt(
  raw: string | null,
  min: number,
  max: number,
  fallback: number,
): number {
  const parsed = raw ? Number(raw) : fallback;
  return Number.isInteger(parsed) && parsed >= min && parsed <= max
    ? parsed
    : fallback;
}

/**
 * `.xlsx` export of "Contas a Receber" (Onda 6). Re-checks FINANCIAL_ROLES (the
 * SAME gate as /app/financeiro) and reapplies the exact screen filter: period
 * (mês/ano) drives `listRevenueClosings`, then cliente/projeto/status filter the
 * rows just like the page. Every column is financial and authorized for this
 * role, so there is no per-column masking. Audits `REVENUE_CLOSINGS_EXPORTED`.
 */
export async function GET(request: Request) {
  const user = await requireRole(FINANCIAL_ROLES);
  if (!isDatabaseConfigured()) return noDatabaseResponse();

  const url = new URL(request.url);
  const now = new Date();
  const month = clampInt(url.searchParams.get("month"), 1, 12, now.getMonth() + 1);
  const year = clampInt(
    url.searchParams.get("year"),
    2020,
    2100,
    now.getFullYear(),
  );
  const clientName = url.searchParams.get("client") || undefined;
  const projectName = url.searchParams.get("project") || undefined;
  const statusRaw = url.searchParams.get("status") || undefined;
  const status =
    statusRaw && statusRaw in revenueClosingStatusLabels
      ? (statusRaw as RevenueClosingStatus)
      : undefined;

  const { listRevenueClosings } = await import("@/lib/db/revenue");
  const overview = await listRevenueClosings({ month, year });
  const rows = filterRevenueRows(overview.rows, {
    clientName,
    projectName,
    status,
  });

  const monthSlug = `${year}-${String(month).padStart(2, "0")}`;
  const buffer = await buildWorkbook([
    defineSheet({
      name: `Contas a Receber ${monthSlug}`,
      columns: revenueXlsxColumns(),
      rows,
    }),
  ]);

  const { resolveDbUser } = await import("@/lib/db/users");
  const { recordAuditEvent } = await import("@/lib/db/audit");
  const dbUser = await resolveDbUser(user);
  await recordAuditEvent({
    actorUserId: dbUser?.id ?? null,
    entityType: "RevenueClosing",
    entityId: monthSlug,
    action: "REVENUE_CLOSINGS_EXPORTED",
    after: {
      filter: {
        month,
        year,
        client: clientName ?? null,
        project: projectName ?? null,
        status: status ?? null,
      },
      rowCount: rows.length,
    },
  });

  return xlsxResponse(buffer, `contas-a-receber_${monthSlug}.xlsx`);
}
