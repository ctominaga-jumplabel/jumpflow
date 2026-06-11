import { requireUser } from "@/lib/auth/guards";
import { isDatabaseConfigured } from "@/lib/db/config";
import { expensesReportFilterSchema } from "@/lib/reports/schemas";
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
  const report = await getExpensesReport(user, parsed.data);

  const csv = buildExpensesCsv(report.rows, {
    statusLabel: (status) =>
      expenseStatusLabels[status as keyof typeof expenseStatusLabels] ?? status,
  });

  const slug = rangeSlug(parsed.data.from, parsed.data.to);
  return csvResponse(csv, `relatorio-despesas_${slug}.csv`);
}
