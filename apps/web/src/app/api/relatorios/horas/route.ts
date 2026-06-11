import { requireUser } from "@/lib/auth/guards";
import { isDatabaseConfigured } from "@/lib/db/config";
import {
  hoursReportFilterSchema,
  resolveDetailRange,
} from "@/lib/reports/schemas";
import { buildHoursCsv } from "@/lib/reports/csv";
import { timeEntryStatusLabels } from "@/lib/timesheet/types";
import {
  csvResponse,
  noDatabaseResponse,
  invalidInputResponse,
  rangeSlug,
} from "../shared";

export const dynamic = "force-dynamic";

/**
 * CSV export of the Hours report. Same Zod filter and same read function as the
 * screen, so the export can never include more than the screen shows. RBAC and
 * `includeFinancials` are recomputed from the REAL user — any client hint is
 * ignored.
 */
export async function GET(request: Request) {
  const user = await requireUser();
  if (!isDatabaseConfigured()) return noDatabaseResponse();

  const params = Object.fromEntries(new URL(request.url).searchParams);
  const parsed = hoursReportFilterSchema.safeParse(params);
  if (!parsed.success) return invalidInputResponse();

  const { getHoursReport } = await import("@/lib/db/reports");
  // Export the WHOLE filtered set: drop pagination so the read returns every
  // matching row (capped at a safe ceiling). All other filters + sort apply.
  const { page: _page, pageSize: _pageSize, ...exportFilter } = parsed.data;
  void _page;
  void _pageSize;
  const report = await getHoursReport(user, exportFilter);

  const csv = buildHoursCsv(report.rows, {
    includeFinancials: report.includeFinancials,
    statusLabel: (status) =>
      timeEntryStatusLabels[status as keyof typeof timeEntryStatusLabels] ??
      status,
  });

  // Resolve the period preset so the filename reflects the real range
  // exported (e.g. ?period=mes-atual), not a bare "tudo".
  const range = resolveDetailRange(parsed.data, new Date());
  const slug = rangeSlug(range.from, range.to);
  return csvResponse(csv, `relatorio-horas_${slug}.csv`);
}
