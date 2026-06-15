import { currentClosing, type MonthlyClosing } from "@/lib/mock-data/financial";
import type { Expense } from "@/lib/expenses/types";
import { formatMonth } from "@/lib/format";
import {
  summarizeRevenueClosing,
  type RevenueClosingOverview,
} from "@/lib/financial/types";
import { RevenueSummaryCards } from "./RevenueSummaryCards";
import { MonthlyClosingTable } from "./MonthlyClosingTable";
import { ExpensesFinancePanel } from "./ExpensesFinancePanel";

export interface FinancialOverviewProps {
  closing?: MonthlyClosing;
  revenueClosing?: RevenueClosingOverview;
  revenueMode?: "demo" | "db";
  /** "db": expense rows come from listFinanceExpenses; "demo": local mock. */
  expensesMode?: "demo" | "db";
  /** db mode: expenses that reached finance. */
  financeExpenses?: Expense[];
}

/**
 * Monthly closing overview: revenue KPIs + the closing table. Composed by the
 * role-protected Financeiro page (requireRole), so all figures are authorized.
 */
export function FinancialOverview({
  closing = currentClosing,
  revenueClosing,
  revenueMode = "demo",
  expensesMode = "demo",
  financeExpenses,
}: FinancialOverviewProps) {
  const overview =
    revenueClosing ??
    ({
      month: closing.month,
      year: closing.year,
      rows: closing.rows.map((row) => ({
        id: row.id,
        clientName: row.clientName,
        projectName: row.projectName,
        approvedHours: row.approvedHours,
        billingHourlyRate: row.billingHourlyRate,
        amount: row.approvedHours * row.billingHourlyRate,
        status:
          row.status === "REVIEW"
            ? "IN_REVIEW"
            : row.status === "READY"
              ? "READY_TO_CLOSE"
              : row.status,
        fiscalDocument: null,
      })),
    } satisfies RevenueClosingOverview);
  const totals = summarizeRevenueClosing(overview);
  const monthLabel = formatMonth(overview.month, overview.year);

  return (
    <div className="space-y-6">
      <RevenueSummaryCards
        approvedHours={totals.approvedHours}
        estimatedRevenue={totals.estimatedRevenue}
        readyToClose={totals.readyToClose}
        closed={totals.closed}
        monthLabel={monthLabel}
      />
      <MonthlyClosingTable
        mode={revenueMode}
        rows={overview.rows}
        month={overview.month}
        year={overview.year}
        monthLabel={monthLabel}
      />
      <ExpensesFinancePanel mode={expensesMode} expenses={financeExpenses} />
    </div>
  );
}
