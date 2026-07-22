import { currentClosing, type MonthlyClosing } from "@/lib/mock-data/financial";
import type { Expense } from "@/lib/expenses/types";
import { formatMonth } from "@/lib/format";
import {
  summarizeRevenueClosing,
  type RevenueClosingOverview,
} from "@/lib/financial/types";
import type {
  PeriodExceptions,
  RevenueExceptionsByProject,
} from "@/lib/db/period-exceptions";
import { RevenueSummaryCards } from "./RevenueSummaryCards";
import { MonthlyClosingTable } from "./MonthlyClosingTable";
import { ExpensesFinancePanel } from "./ExpensesFinancePanel";
import { PeriodExceptionsPanel } from "./PeriodExceptionsPanel";
import { FinanceTabs } from "./FinanceTabs";

export interface FinancialOverviewProps {
  closing?: MonthlyClosing;
  revenueClosing?: RevenueClosingOverview;
  revenueMode?: "demo" | "db";
  /** "db": expense rows come from listFinanceExpenses; "demo": local mock. */
  expensesMode?: "demo" | "db";
  /** db mode: expenses that reached finance. */
  financeExpenses?: Expense[];
  /** db mode: whether receipt storage is configured (P17 bulk download). */
  expensesStorageAvailable?: boolean;
  /** Sobreaviso/hora extra do período (Contas a Receber). db mode. */
  exceptions?: PeriodExceptions;
  /** Time-entry exceptions per project (P5), for the closing table. db mode. */
  exceptionsByProject?: RevenueExceptionsByProject;
  /** Tab pré-selecionada (?tab=), preservada no client. */
  defaultTab?: string;
  /** `.xlsx` export href da aba Contas a Receber (Onda 6). db mode. */
  receberExportHref?: string;
  /** `.xlsx` export href da aba Contas a Pagar (Onda 6). db mode. */
  pagarExportHref?: string;
}

/**
 * Monthly financial overview split into two tabs (P1): "Contas a Receber"
 * (revenue KPIs + closing table + period exceptions, the client/revenue side)
 * and "Contas a Pagar" (finance-approved expenses to pay). Composed by the
 * role-protected Financeiro page (requireRole), so all figures are authorized.
 */
export function FinancialOverview({
  closing = currentClosing,
  revenueClosing,
  revenueMode = "demo",
  expensesMode = "demo",
  financeExpenses,
  expensesStorageAvailable = false,
  exceptions,
  exceptionsByProject,
  defaultTab,
  receberExportHref,
  pagarExportHref,
}: FinancialOverviewProps) {
  const overview =
    revenueClosing ??
    ({
      month: closing.month,
      year: closing.year,
      rows: closing.rows.map((row) => ({
        id: row.id,
        projectId: null,
        clientName: row.clientName,
        projectName: row.projectName,
        opportunityType: null,
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

  const receber = (
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
        exceptionsByProject={exceptionsByProject}
        exportHref={receberExportHref}
      />
      {exceptions ? (
        <PeriodExceptionsPanel exceptions={exceptions} monthLabel={monthLabel} />
      ) : null}
    </div>
  );

  const pagar = (
    <ExpensesFinancePanel
      mode={expensesMode}
      expenses={financeExpenses}
      storageAvailable={expensesStorageAvailable}
      exportHref={pagarExportHref}
    />
  );

  return (
    <FinanceTabs
      defaultTabId={defaultTab}
      tabs={[
        { id: "receber", label: "Contas a Receber", content: receber },
        { id: "pagar", label: "Contas a Pagar", content: pagar },
      ]}
    />
  );
}
