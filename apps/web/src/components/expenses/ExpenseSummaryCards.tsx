"use client";

import { CheckCircle2, CircleDollarSign, Clock, Wallet } from "lucide-react";
import { MetricCard } from "@/components/ui/MetricCard";
import { formatCurrency } from "@/lib/format";
import type { ExpenseTotals } from "@/lib/mock-data/expenses";

export interface ExpenseSummaryCardsProps {
  totals: ExpenseTotals;
}

/**
 * KPI tiles summarizing expenses by status and amount. The paid total is shown
 * to everyone here (it is the consultant's own reimbursement visibility); the
 * ability to CHANGE payment status is gated separately by role.
 */
export function ExpenseSummaryCards({ totals }: ExpenseSummaryCardsProps) {
  return (
    <section
      aria-label="Resumo de despesas"
      className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4"
    >
      <MetricCard
        label="Aguardando aprovação"
        value={String(totals.submitted)}
        hint="Despesas enviadas"
        icon={Clock}
        index={0}
      />
      <MetricCard
        label="Aprovadas"
        value={String(totals.approved)}
        hint={formatCurrency(totals.approvedAmount)}
        icon={CheckCircle2}
        index={1}
      />
      <MetricCard
        label="Total lançado"
        value={formatCurrency(totals.totalAmount)}
        hint="Soma das despesas listadas"
        icon={CircleDollarSign}
        index={2}
      />
      <MetricCard
        label="Pago"
        value={formatCurrency(totals.paidAmount)}
        hint="Reembolsos efetivados"
        icon={Wallet}
        index={3}
      />
    </section>
  );
}
