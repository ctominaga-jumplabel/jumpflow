import type { Metadata } from "next";
import { PageHeader } from "@/components/ui/PageHeader";
import { FinancialOverview } from "@/components/financial/FinancialOverview";
import { requireRole } from "@/lib/auth/guards";
import { FINANCIAL_ROLES } from "@/lib/auth/route-permissions";
import { isDatabaseConfigured } from "@/lib/db/config";

export const metadata: Metadata = { title: "Financeiro" };

export default async function FinanceiroPage() {
  // Financial data is role-protected; non-authorized users go to /access-denied.
  await requireRole(FINANCIAL_ROLES);

  const databaseConfigured = isDatabaseConfigured();
  let financeExpenses;
  let revenueClosing;
  if (databaseConfigured) {
    // Lazy import so Prisma is never loaded on code paths without a database.
    const { listFinanceExpenses } = await import("@/lib/db/expenses");
    const { listRevenueClosings } = await import("@/lib/db/revenue");
    financeExpenses = (await listFinanceExpenses()).expenses;
    const now = new Date();
    revenueClosing = await listRevenueClosings({
      month: now.getMonth() + 1,
      year: now.getFullYear(),
    });
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
    </div>
  );
}
