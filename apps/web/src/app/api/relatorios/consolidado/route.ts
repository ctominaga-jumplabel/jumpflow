import { requireUser } from "@/lib/auth/guards";
import { isDatabaseConfigured } from "@/lib/db/config";
import { canEach } from "@/lib/auth/permissions";
import { SUBSCREEN_CODES } from "@/lib/auth/permission-codes";
import { consolidatedReportFilterSchema } from "@/lib/reports/schemas";
import { buildConsolidatedCsv } from "@/lib/reports/csv";
import {
  csvResponse,
  forbiddenResponse,
  noDatabaseResponse,
  invalidInputResponse,
  periodSlug,
} from "../shared";

export const dynamic = "force-dynamic";

/**
 * CSV export of the Consolidated/closing report. Same Zod filter and read
 * function as the screen; monetary hour columns only when the real user holds
 * FINANCIAL_ROLES.
 */
export async function GET(request: Request) {
  const user = await requireUser();
  if (!isDatabaseConfigured()) return noDatabaseResponse();

  // Relatórios "Consolidado" subtela: without matrix `view`, the export refuses.
  const access = await canEach([SUBSCREEN_CODES.reports.consolidated]);
  if (!access[SUBSCREEN_CODES.reports.consolidated]) return forbiddenResponse();

  const params = Object.fromEntries(new URL(request.url).searchParams);
  const parsed = consolidatedReportFilterSchema.safeParse(params);
  if (!parsed.success) return invalidInputResponse();

  const { getConsolidatedReport } = await import("@/lib/db/reports");
  const report = await getConsolidatedReport(user, parsed.data);

  const csv = buildConsolidatedCsv(report.clients, {
    includeFinancials: report.includeFinancials,
  });

  const slug = periodSlug(parsed.data.month, parsed.data.from, parsed.data.to);
  return csvResponse(csv, `consolidado_${slug}.csv`);
}
