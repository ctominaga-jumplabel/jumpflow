"use client";

import { CheckCircle2, CircleDollarSign, Clock, Wallet } from "lucide-react";
import { MetricCard } from "@/components/ui/MetricCard";
import { formatCurrency } from "@/lib/format";
import type { ExpenseTotals } from "@/lib/expenses/types";

export interface ExpenseSummaryCardsProps {
  totals: ExpenseTotals;
}

/**
 * KPI tiles summarizing expenses along the single status chain. The paid
 * total is shown to everyone here (it is the consultant's own reimbursement
 * visibility); payment actions live in the role-gated Financeiro module.
 */
export function ExpenseSummaryCards({ totals }: ExpenseSummaryCardsProps) {
  return (
    <section
      aria-label="Resumo de despesas"
      className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4"
    >
      <MetricCard
        label="Aguardando aprovação"
        value={String(totals.awaiting)}
        hint="Na fila do gestor ou do financeiro"
        icon={Clock}
        index={0}
      />
      <MetricCard
        label="A pagar"
        value={formatCurrency(totals.toPayAmount + totals.scheduledAmount)}
        hint={`${totals.toPay + totals.scheduled} aprovada(s) pelo financeiro`}
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
