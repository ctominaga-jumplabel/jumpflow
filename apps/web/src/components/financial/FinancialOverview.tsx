"use client";

import {
  Calculator,
  Clock,
  Database,
  DollarSign,
  TriangleAlert,
  Users,
} from "lucide-react";
import type { Expense } from "@/lib/expenses/types";
import { formatCurrencyPrecise, formatHours } from "@/lib/format";
import { cn } from "@/lib/utils";
import { focusRing } from "@/lib/styles";
import { MetricCard } from "@/components/ui/MetricCard";
import { EmptyState } from "@/components/ui/EmptyState";
import { ExportExcelButton } from "@/components/ui/ExportExcelButton";
import type {
  PendingClosingRow,
  ReceivablesOverview,
} from "@/lib/financial/receivables-journey-core";
import {
  ReceivablesFilterBar,
  type ReceivablesFilterOption,
  type ReceivablesProjectOption,
} from "./receivables/ReceivablesFilterBar";
import { ReceivablesDayGroups } from "./receivables/ReceivablesDayGroups";
import { BillingSignals } from "./receivables/BillingSignals";
import { PendingClosingsView } from "./receivables/PendingClosingsView";
import { ExpensesFinancePanel } from "./ExpensesFinancePanel";
import { FinanceTabs } from "./FinanceTabs";

export interface FinancialOverviewProps {
  /** "db": jornada real de Contas a Receber; "demo": banco não configurado. */
  receivablesMode?: "demo" | "db";
  /** Lançamentos por dia + cards-resumo do recorte (db mode). */
  receivables?: ReceivablesOverview;
  /** Opções dos filtros (cliente/projeto/colaborador), escopadas ao usuário (db mode). */
  receivablesFilterOptions?: {
    clients: ReceivablesFilterOption[];
    projects: ReceivablesProjectOption[];
    consultants: ReceivablesFilterOption[];
  };
  /** Valores correntes dos filtros, refletidos na barra e nas hrefs (db mode). */
  receivablesValues?: {
    from?: string;
    to?: string;
    clientId?: string;
    projectIds: string[];
    consultantId?: string;
    billable?: string;
  };
  /** Se o usuário pode alternar a coluna Faturar? (gate real é server-side). */
  canEditBillable?: boolean;
  /** `.xlsx` de Relatórios (Timesheet) com os filtros da tela (db mode). */
  timesheetExportHref?: string;
  /** Navegação para a tela de Apuração (Wave C) com os filtros na query. */
  apuracaoHref?: string;
  /** "db": expense rows come from listFinanceExpenses; "demo": local mock. */
  expensesMode?: "demo" | "db";
  /** db mode: expenses that reached finance. */
  financeExpenses?: Expense[];
  /** db mode: whether receipt storage is configured (P17 bulk download). */
  expensesStorageAvailable?: boolean;
  /** Tab pré-selecionada (?tab=), preservada no client. */
  defaultTab?: string;
  /** `.xlsx` export href da aba Contas a Pagar (Onda 6). db mode. */
  pagarExportHref?: string;
  /**
   * Fila da aba "Pendentes de Fechamento" (competência corrente), quando há
   * banco. Reaproveita o `PendingClosingsView` da rota standalone. Ausente em
   * modo demo → a aba degrada com um EmptyState honesto.
   */
  pendingClosings?: {
    rows: PendingClosingRow[];
    month: number;
    year: number;
    pendingCount: number;
  };
  /** ADMIN/AREA_MANAGER pode LIBERAR (na aba, na prática só ADMIN chega aqui). */
  canClosePending?: boolean;
  /** ADMIN/FINANCE pode RETORNAR faturamento (Faturado → Liberado). */
  canRevertPending?: boolean;
}

/**
 * Visão do Financeiro em duas abas (P1): "Contas a Receber" — a nova jornada
 * (filtrar → lançamentos por dia → apurar), consumindo `getReceivablesOverview`
 * — e "Contas a Pagar" (despesas aprovadas pelo financeiro). Composta pela
 * página Financeiro protegida por `requireRole(FINANCIAL_ROLES)`, então todos os
 * números já estão autorizados. NFS-e/status/exceções ficam fora do escopo desta
 * iteração (ver docs/proposta-contas-a-receber/README.md §0/§7).
 */
export function FinancialOverview({
  receivablesMode = "demo",
  receivables,
  receivablesFilterOptions,
  receivablesValues,
  canEditBillable = false,
  timesheetExportHref,
  apuracaoHref,
  expensesMode = "demo",
  financeExpenses,
  expensesStorageAvailable = false,
  defaultTab,
  pagarExportHref,
  pendingClosings,
  canClosePending = false,
  canRevertPending = false,
}: FinancialOverviewProps) {
  const overview: ReceivablesOverview = receivables ?? {
    days: [],
    summary: {
      totalHours: 0,
      totalToInvoice: null,
      allocatedCount: 0,
      unratedBillableHours: 0,
      hasNonHourlyBilling: false,
    },
    includeFinancials: false,
  };
  const values = receivablesValues ?? { projectIds: [] };
  const options = receivablesFilterOptions ?? {
    clients: [],
    projects: [],
    consultants: [],
  };
  const { summary } = overview;

  const receber = (
    <div className="space-y-6">
      {receivablesMode === "demo" ? (
        <div className="flex items-center gap-2 rounded-md border border-warning/30 bg-warning-soft px-3 py-2 text-sm font-medium text-warning">
          <TriangleAlert aria-hidden="true" className="size-4 shrink-0" />
          <span>
            Modo demonstração: banco não configurado. Nenhum lançamento real é
            exibido.
          </span>
        </div>
      ) : (
        <ReceivablesFilterBar
          clients={options.clients}
          projects={options.projects}
          consultants={options.consultants}
          values={values}
        />
      )}

      <section
        aria-label="Resumo do recorte"
        className="grid gap-4 sm:grid-cols-3"
      >
        <MetricCard
          label="Horas no período"
          value={formatHours(summary.totalHours)}
          icon={Clock}
          index={0}
        />
        <MetricCard
          label="Valor a faturar"
          value={
            summary.totalToInvoice != null
              ? formatCurrencyPrecise(summary.totalToInvoice)
              : "—"
          }
          icon={DollarSign}
          index={1}
        />
        <MetricCard
          label="Alocados"
          value={String(summary.allocatedCount)}
          icon={Users}
          index={2}
        />
      </section>

      {receivablesMode === "db" ? (
        <BillingSignals
          unratedBillableHours={summary.unratedBillableHours}
          hasNonHourlyBilling={summary.hasNonHourlyBilling}
        />
      ) : null}

      {receivablesMode === "db" ? (
        <div className="flex flex-wrap items-center justify-end gap-2">
          {timesheetExportHref ? (
            <ExportExcelButton
              href={timesheetExportHref}
              label="Exportar Timesheet"
              className="h-10 px-4 text-sm"
            />
          ) : null}
          {apuracaoHref ? (
            <a
              href={apuracaoHref}
              className={cn(
                "inline-flex h-10 items-center justify-center gap-2 rounded-md border-2 border-ink bg-brand px-5 text-sm font-semibold text-white shadow-[3px_3px_0_0_var(--color-ink)] transition-[transform,box-shadow] duration-150 hover:-translate-x-px hover:-translate-y-px hover:shadow-[4px_4px_0_0_var(--color-ink)] active:translate-x-[2px] active:translate-y-[2px] active:shadow-[1px_1px_0_0_var(--color-ink)]",
                focusRing,
              )}
            >
              <Calculator aria-hidden="true" className="size-4" />
              Ver Apuração
            </a>
          ) : null}
        </div>
      ) : null}

      <ReceivablesDayGroups
        days={overview.days}
        canEditBillable={canEditBillable}
      />
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

  // Pendentes de Fechamento: mesma fila da rota standalone (`PendingClosingsView`),
  // agora dentro do Financeiro. Params de competência próprios (`pmonth`/`pyear`)
  // e `tab=pendentes` preservada no GET para não colidir com os filtros de
  // Contas a Receber (from/to/clientId/projectIds). Sem banco → EmptyState.
  const pendentes = pendingClosings ? (
    <PendingClosingsView
      rows={pendingClosings.rows}
      month={pendingClosings.month}
      year={pendingClosings.year}
      pendingCount={pendingClosings.pendingCount}
      canClose={canClosePending}
      canRevert={canRevertPending}
      formAction="/app/financeiro"
      monthParam="pmonth"
      yearParam="pyear"
      hiddenFields={{ tab: "pendentes" }}
    />
  ) : (
    <EmptyState
      icon={Database}
      title="Disponível com banco de dados"
      description="A fila de liberação de faturamento por projeto/competência usa dados reais (projetos ativos e fechamentos). Configure o banco para usá-la."
    />
  );

  return (
    <FinanceTabs
      defaultTabId={defaultTab}
      tabs={[
        { id: "receber", label: "Contas a Receber", content: receber },
        { id: "pagar", label: "Contas a Pagar", content: pagar },
        {
          id: "pendentes",
          label: "Status de Faturamento",
          content: pendentes,
        },
      ]}
    />
  );
}
