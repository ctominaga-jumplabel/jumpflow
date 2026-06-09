import type { Metadata } from "next";
import { PageHeader } from "@/components/ui/PageHeader";
import { FinancialOverview } from "@/components/financial/FinancialOverview";
import { requireRole } from "@/lib/auth/guards";
import { FINANCIAL_ROLES } from "@/lib/auth/route-permissions";

export const metadata: Metadata = { title: "Financeiro" };

export default async function FinanceiroPage() {
  // Financial data is role-protected; non-authorized users go to /access-denied.
  await requireRole(FINANCIAL_ROLES);

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Gestão"
        title="Financeiro"
        description="Fechamento mensal de horas aprovadas, valor hora, receita estimada e status de fechamento."
      />
      <FinancialOverview />
    </div>
  );
}
