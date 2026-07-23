import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { PageHeader } from "@/components/ui/PageHeader";
import { EmptyState } from "@/components/ui/EmptyState";
import { ReimbursementPolicyView } from "@/components/expenses/ReimbursementPolicyView";
import { requireRole } from "@/lib/auth/guards";
import { REIMBURSEMENT_POLICY_ROLES } from "@/lib/auth/route-permissions";
import { isDatabaseConfigured } from "@/lib/db/config";

export const metadata: Metadata = { title: "Política de Reembolso" };

/**
 * Política de Reembolso (Onda 3, P12): cadastro dos limites (prazo/valor) por
 * categoria de despesa + a regra Geral. Restrita a REIMBURSEMENT_POLICY_ROLES
 * (governança financeira/People); o gate de rota (route-permissions) e este
 * requireRole são a mesma fonte de verdade.
 */
export default async function PoliticaReembolsoPage() {
  await requireRole(REIMBURSEMENT_POLICY_ROLES);

  const header = (
    <div className="space-y-3">
      <Link
        href="/app/despesas"
        className="inline-flex items-center gap-1 text-sm font-medium text-medium hover:text-strong"
      >
        <ArrowLeft aria-hidden="true" className="size-4" />
        Voltar para Despesas
      </Link>
      <PageHeader
        eyebrow="Despesas"
        title="Política de Reembolso"
        description="Defina prazo e teto por categoria de despesa (e uma regra geral). Lançamentos que violarem a política são bloqueados."
      />
    </div>
  );

  if (!isDatabaseConfigured()) {
    return (
      <div className="space-y-6">
        {header}
        <EmptyState
          icon={ArrowLeft}
          title="Banco não configurado"
          description="A política de reembolso exige banco de dados. Configure a conexão para cadastrar regras."
        />
      </div>
    );
  }

  const { listReimbursementPolicyRules } = await import(
    "@/lib/db/reimbursement-policy"
  );
  const { listExpenseTypes } = await import("@/lib/db/expense-types");
  const [rules, expenseTypes] = await Promise.all([
    listReimbursementPolicyRules(),
    listExpenseTypes(),
  ]);

  return (
    <div className="space-y-6">
      {header}
      <ReimbursementPolicyView rules={rules} expenseTypes={expenseTypes} />
    </div>
  );
}
