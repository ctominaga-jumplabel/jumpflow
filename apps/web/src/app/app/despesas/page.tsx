import type { Metadata } from "next";
import { PageHeader } from "@/components/ui/PageHeader";
import { ExpensesView } from "@/components/expenses/ExpensesView";
import { getCurrentUser } from "@/lib/auth/current-user";
import { hasRole } from "@/lib/auth/route-permissions";
import { FINANCIAL_ROLES } from "@/lib/auth/route-permissions";

export const metadata: Metadata = { title: "Despesas" };

export default async function DespesasPage() {
  // Despesas are visible to any authenticated user (consultants log their own).
  // Only financial roles may change the PAYMENT status — decided on the server
  // and passed down; the client never grants this capability by itself.
  const user = await getCurrentUser();
  const canManagePayments = hasRole(user, FINANCIAL_ROLES);
  const consultantName = user?.name ?? "Consultor";
  const today = new Date().toISOString().slice(0, 10);

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Operação"
        title="Despesas"
        description="Lançamento de despesas por projeto, com comprovante, aprovação e acompanhamento de pagamento."
      />
      <ExpensesView
        consultantName={consultantName}
        canManagePayments={canManagePayments}
        today={today}
      />
    </div>
  );
}
