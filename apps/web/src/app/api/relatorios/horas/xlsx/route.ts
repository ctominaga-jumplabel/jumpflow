import { requireUser } from "@/lib/auth/guards";
import { isDatabaseConfigured } from "@/lib/db/config";
import {
  hoursReportFilterSchema,
  resolveDetailRange,
} from "@/lib/reports/schemas";
import { buildWorkbook, defineSheet, xlsxResponse } from "@/lib/export/xlsx";
import { hoursXlsxColumns } from "@/lib/reports/xlsx-columns";
import { timeEntryStatusLabels } from "@/lib/timesheet/types";
import {
  noDatabaseResponse,
  invalidInputResponse,
  rangeSlug,
} from "../../shared";

export const dynamic = "force-dynamic";

/**
 * `.xlsx` export of the Hours report (Onda 6). Same Zod filter and same read
 * function (`getHoursReport`) as the screen and the CSV route, so RBAC scope and
 * `includeFinancials` masking are recomputed from the REAL user — a client hint
 * can never widen the export. Audits `HOURS_EXPORTED` with the filter used.
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

  const columns = hoursXlsxColumns({
    includeFinancials: report.includeFinancials,
    statusLabel: (status) =>
      timeEntryStatusLabels[status as keyof typeof timeEntryStatusLabels] ??
      status,
  });

  const range = resolveDetailRange(parsed.data, new Date());
  const slug = rangeSlug(range.from, range.to);
  const buffer = await buildWorkbook([
    defineSheet({ name: `Horas ${slug}`, columns, rows: report.rows }),
  ]);

  const { resolveDbUser } = await import("@/lib/db/users");
  const { recordAuditEvent } = await import("@/lib/db/audit");
  const dbUser = await resolveDbUser(user);
  await recordAuditEvent({
    actorUserId: dbUser?.id ?? null,
    entityType: "TimeEntry",
    entityId: slug,
    action: "HOURS_EXPORTED",
    after: {
      filter: exportFilter,
      includeFinancials: report.includeFinancials,
      rowCount: report.rows.length,
    },
  });

  return xlsxResponse(buffer, `relatorio-horas_${slug}.xlsx`);
}
