import { requireUser } from "@/lib/auth/guards";
import { isDatabaseConfigured } from "@/lib/db/config";
import {
  expensesReportFilterSchema,
  resolveDetailRange,
} from "@/lib/reports/schemas";
import { buildExpensesCsv } from "@/lib/reports/csv";
import { expenseStatusLabels } from "@/lib/expenses/types";
import {
  csvResponse,
  noDatabaseResponse,
  invalidInputResponse,
  rangeSlug,
} from "../shared";

export const dynamic = "force-dynamic";

/**
 * CSV export of the Expenses report. Same Zod filter and same read function as
 * the screen; never includes receipt storage fields. Scope recomputed from the
 * real user.
 */
export async function GET(request: Request) {
  const user = await requireUser();
  if (!isDatabaseConfigured()) return noDatabaseResponse();

  const params = Object.fromEntries(new URL(request.url).searchParams);
  const parsed = expensesReportFilterSchema.safeParse(params);
  if (!parsed.success) return invalidInputResponse();

  const { getExpensesReport } = await import("@/lib/db/reports");
  // Export the WHOLE filtered set: drop pagination so the read returns every
  // matching row (capped at a safe ceiling). All other filters + sort apply.
  const { page: _page, pageSize: _pageSize, ...exportFilter } = parsed.data;
  void _page;
  void _pageSize;
  const report = await getExpensesReport(user, exportFilter);

  const csv = buildExpensesCsv(report.rows, {
    statusLabel: (status) =>
      expenseStatusLabels[status as keyof typeof expenseStatusLabels] ?? status,
  });

  // Resolve the period preset so the filename reflects the real range
  // exported (e.g. ?period=mes-atual), not a bare "tudo".
  const range = resolveDetailRange(parsed.data, new Date());
  const slug = rangeSlug(range.from, range.to);
  return csvResponse(csv, `relatorio-despesas_${slug}.csv`);
}
