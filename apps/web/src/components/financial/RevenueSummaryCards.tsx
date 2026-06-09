"use client";

import { CheckCircle2, Clock, FileText, Wallet } from "lucide-react";
import { MetricCard } from "@/components/ui/MetricCard";
import { formatCurrency, formatHours } from "@/lib/format";

export interface RevenueSummaryCardsProps {
  approvedHours: number;
  estimatedRevenue: number;
  readyToClose: number;
  closed: number;
  monthLabel: string;
}

/**
 * Financial KPI tiles for the monthly closing. Rendered only inside the
 * role-protected Financeiro page, so the figures are already authorized.
 */
export function RevenueSummaryCards({
  approvedHours,
  estimatedRevenue,
  readyToClose,
  closed,
  monthLabel,
}: RevenueSummaryCardsProps) {
  return (
    <section
      aria-label="Resumo financeiro"
      className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4"
    >
      <MetricCard
        label="Horas aprovadas"
        value={formatHours(approvedHours)}
        hint={monthLabel}
        icon={Clock}
        index={0}
      />
      <MetricCard
        label="Receita estimada"
        value={formatCurrency(estimatedRevenue)}
        hint="Horas aprovadas × valor hora"
        icon={Wallet}
        index={1}
      />
      <MetricCard
        label="Prontos para fechar"
        value={String(readyToClose)}
        hint="Projetos revisados"
        icon={FileText}
        index={2}
      />
      <MetricCard
        label="Fechados"
        value={String(closed)}
        hint={monthLabel}
        icon={CheckCircle2}
        index={3}
      />
    </section>
  );
}
