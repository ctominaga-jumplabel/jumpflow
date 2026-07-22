import { requireUser } from "@/lib/auth/guards";
import { isDatabaseConfigured } from "@/lib/db/config";
import {
  expensesReportFilterSchema,
  resolveDetailRange,
} from "@/lib/reports/schemas";
import { buildWorkbook, defineSheet, xlsxResponse } from "@/lib/export/xlsx";
import { expensesXlsxColumns } from "@/lib/reports/xlsx-columns";
import { expenseStatusLabels } from "@/lib/expenses/types";
import {
  noDatabaseResponse,
  invalidInputResponse,
  rangeSlug,
} from "../../shared";

export const dynamic = "force-dynamic";

/**
 * `.xlsx` export of the Expenses report (Onda 6). Same Zod filter and same read
 * function (`getExpensesReport`) as the screen and the CSV route; scope is
 * recomputed from the real user (consultant sees own, PM sees managed, broad
 * sees all) and receipt storage fields are never exposed. Audits
 * `EXPENSES_EXPORTED` with the filter used.
 */
export async function GET(request: Request) {
  const user = await requireUser();
  if (!isDatabaseConfigured()) return noDatabaseResponse();

  const params = Object.fromEntries(new URL(request.url).searchParams);
  const parsed = expensesReportFilterSchema.safeParse(params);
  if (!parsed.success) return invalidInputResponse();

  const { getExpensesReport } = await import("@/lib/db/reports");
  const { page: _page, pageSize: _pageSize, ...exportFilter } = parsed.data;
  void _page;
  void _pageSize;
  const report = await getExpensesReport(user, exportFilter);

  const columns = expensesXlsxColumns({
    statusLabel: (status) =>
      expenseStatusLabels[status as keyof typeof expenseStatusLabels] ?? status,
  });

  const range = resolveDetailRange(parsed.data, new Date());
  const slug = rangeSlug(range.from, range.to);
  const buffer = await buildWorkbook([
    defineSheet({ name: `Despesas ${slug}`, columns, rows: report.rows }),
  ]);

  const { resolveDbUser } = await import("@/lib/db/users");
  const { recordAuditEvent } = await import("@/lib/db/audit");
  const dbUser = await resolveDbUser(user);
  await recordAuditEvent({
    actorUserId: dbUser?.id ?? null,
    entityType: "Expense",
    entityId: slug,
    action: "EXPENSES_EXPORTED",
    after: { filter: exportFilter, rowCount: report.rows.length },
  });

  return xlsxResponse(buffer, `relatorio-despesas_${slug}.xlsx`);
}
