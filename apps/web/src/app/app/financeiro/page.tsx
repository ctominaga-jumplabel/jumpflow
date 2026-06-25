import type { Metadata } from "next";
import { PageHeader } from "@/components/ui/PageHeader";
import { FinancialOverview } from "@/components/financial/FinancialOverview";
import { PeriodExceptionsPanel } from "@/components/financial/PeriodExceptionsPanel";
import { requireRole } from "@/lib/auth/guards";
import { FINANCIAL_ROLES } from "@/lib/auth/route-permissions";
import { isDatabaseConfigured } from "@/lib/db/config";
import { formatMonth } from "@/lib/format";

export const metadata: Metadata = { title: "Financeiro" };

export default async function FinanceiroPage() {
  // Financial data is role-protected; non-authorized users go to /access-denied.
  await requireRole(FINANCIAL_ROLES);

  const databaseConfigured = isDatabaseConfigured();
  const now = new Date();
  const month = now.getMonth() + 1;
  const year = now.getFullYear();
  let financeExpenses;
  let revenueClosing;
  let exceptions;
  if (databaseConfigured) {
    // Lazy import so Prisma is never loaded on code paths without a database.
    const { listFinanceExpenses } = await import("@/lib/db/expenses");
    const { listRevenueClosings } = await import("@/lib/db/revenue");
    const { listPeriodExceptions } = await import("@/lib/db/period-exceptions");
    financeExpenses = (await listFinanceExpenses()).expenses;
    revenueClosing = await listRevenueClosings({ month, year });
    exceptions = await listPeriodExceptions({ month, year });
  }

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Gestão"
        title="Financeiro"
        description="Fechamento mensal de horas aprovadas, valor hora, receita estimada e pagamento de despesas."
      />
      <FinancialOverview
        revenueMode={databaseConfigured ? "db" : "demo"}
        revenueClosing={revenueClosing}
        expensesMode={databaseConfigured ? "db" : "demo"}
        financeExpenses={financeExpenses}
      />
      {exceptions ? (
        <PeriodExceptionsPanel
          exceptions={exceptions}
          monthLabel={formatMonth(month, year)}
        />
      ) : null}
    </div>
  );
}
