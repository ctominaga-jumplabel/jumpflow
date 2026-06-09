import {
  currentClosing,
  summarizeClosing,
  type MonthlyClosing,
} from "@/lib/mock-data/financial";
import { formatMonth } from "@/lib/format";
import { RevenueSummaryCards } from "./RevenueSummaryCards";
import { MonthlyClosingTable } from "./MonthlyClosingTable";

export interface FinancialOverviewProps {
  closing?: MonthlyClosing;
}

/**
 * Monthly closing overview: revenue KPIs + the closing table. Composed by the
 * role-protected Financeiro page (requireRole), so all figures are authorized.
 */
export function FinancialOverview({
  closing = currentClosing,
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
    </div>
  );
}
