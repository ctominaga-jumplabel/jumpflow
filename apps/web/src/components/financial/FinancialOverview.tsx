import {
  currentClosing,
  summarizeClosing,
  type MonthlyClosing,
} from "@/lib/mock-data/financial";
import type { Expense } from "@/lib/expenses/types";
import { formatMonth } from "@/lib/format";
import { RevenueSummaryCards } from "./RevenueSummaryCards";
import { MonthlyClosingTable } from "./MonthlyClosingTable";
import { ExpensesFinancePanel } from "./ExpensesFinancePanel";

export interface FinancialOverviewProps {
  closing?: MonthlyClosing;
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
  expensesMode = "demo",
  financeExpenses,
}: FinancialOverviewProps) {
  const totals = summarizeClosing(closing);
  const monthLabel = formatMonth(closing.month, closing.year);

  return (
    <div className="space-y-6">
      <RevenueSummaryCards
        approvedHours={totals.approvedHours}
        estimatedRevenue={totals.estimatedRevenue}
        readyToClose={totals.readyToClose}
        closed={totals.closed}
        monthLabel={monthLabel}
      />
      <MonthlyClosingTable rows={closing.rows} monthLabel={monthLabel} />
      <ExpensesFinancePanel mode={expensesMode} expenses={financeExpenses} />
    </div>
  );
}
