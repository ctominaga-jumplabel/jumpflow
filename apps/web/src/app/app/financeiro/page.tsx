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
  if (databaseConfigured) {
    // Lazy import so Prisma is never loaded on code paths without a database.
    const { listFinanceExpenses } = await import("@/lib/db/expenses");
    financeExpenses = (await listFinanceExpenses()).expenses;
  }

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Gestão"
        title="Financeiro"
        description="Fechamento mensal de horas aprovadas, valor hora, receita estimada e pagamento de despesas."
      />
      <FinancialOverview
        expensesMode={databaseConfigured ? "db" : "demo"}
        financeExpenses={financeExpenses}
      />
    </div>
  );
}
