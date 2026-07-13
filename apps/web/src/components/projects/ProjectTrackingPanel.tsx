"use client";

import { TrendingUp } from "lucide-react";
import { DataTable, type DataTableColumn } from "@/components/ui/DataTable";
import {
  formatCurrency,
  formatHours,
  formatPercent,
} from "@/lib/format";
import type {
  ProjectTracking,
  TrackingAllocationRow,
} from "@/lib/projects/tracking";
import { cn } from "@/lib/utils";

/** Cor da margem por faixa — mesma semântica do MarginPanel. */
function marginColor(pct: number | null): string {
  if (pct == null) return "text-soft";
  if (pct < 0) return "text-[#b91c1c]";
  if (pct < 20) return "text-[#92400e]";
  return "text-[#166534]";
}

function money(value: number | null): string {
  return value == null ? "—" : formatCurrency(value);
}

function marginText(margin: number | null, pct: number | null): string {
  if (margin == null) return "—";
  return `${formatCurrency(margin)}${pct != null ? ` (${pct}%)` : ""}`;
}

function KpiCard({
  label,
  planned,
  realized,
  plannedClass,
  realizedClass,
}: {
  label: string;
  planned: string;
  realized: string;
  plannedClass?: string;
  realizedClass?: string;
}) {
  return (
    <div className="rounded-lg border border-border bg-surface p-3">
      <p className="text-xs font-semibold uppercase tracking-wide text-soft">
        {label}
      </p>
      <dl className="mt-2 space-y-1">
        <div className="flex items-baseline justify-between gap-2">
          <dt className="text-xs text-soft">Previsto</dt>
          <dd className={cn("text-sm font-medium tabular-nums text-strong", plannedClass)}>
            {planned}
          </dd>
        </div>
        <div className="flex items-baseline justify-between gap-2">
          <dt className="text-xs text-soft">Realizado</dt>
          <dd className={cn("text-sm font-semibold tabular-nums text-strong", realizedClass)}>
            {realized}
          </dd>
        </div>
      </dl>
    </div>
  );
}

export function ProjectTrackingPanel({
  tracking,
  loading,
  error,
}: {
  tracking: ProjectTracking | null;
  loading: boolean;
  error: string | null;
}) {
  if (loading) {
    return (
      <p className="rounded-md border border-border bg-surface-muted px-3 py-2 text-sm text-soft">
        Carregando acompanhamento…
      </p>
    );
  }
  if (error) {
    return (
      <p className="rounded-md border border-warning/30 bg-warning-soft px-3 py-2 text-sm font-medium text-warning">
        {error}
      </p>
    );
  }
  if (!tracking) return null;

  const columns: DataTableColumn<TrackingAllocationRow>[] = [
    {
      key: "consultant",
      header: "Consultor",
      cell: (row) => (
        <div>
          <p className="font-medium text-strong">{row.consultantName}</p>
          <p className="text-xs text-soft">
            {row.role} · {row.allocationPercent}%
          </p>
        </div>
      ),
    },
    {
      key: "hours",
      header: "Horas prev./aprov.",
      align: "right",
      cell: (row) => (
        <span className="text-sm tabular-nums text-medium">
          {row.plannedHours != null ? formatHours(row.plannedHours) : "—"}
          {" / "}
          {formatHours(row.approvedTotalHours)}
        </span>
      ),
    },
    {
      key: "revenue",
      header: "Receita prev./real.",
      align: "right",
      cell: (row) => (
        <span className="text-sm tabular-nums text-medium">
          {money(row.plannedRevenue)}
          {" / "}
          {money(row.realizedRevenue)}
        </span>
      ),
      className: "hidden sm:table-cell",
    },
    {
      key: "cost",
      header: "Custo prev./real.",
      align: "right",
      cell: (row) => (
        <span className="text-sm tabular-nums text-medium">
          {money(row.plannedCost)}
          {" / "}
          {row.hasCost ? money(row.realizedCost) : "custo?"}
        </span>
      ),
      className: "hidden md:table-cell",
    },
    {
      key: "margin",
      header: "Margem prev./real.",
      align: "right",
      cell: (row) => (
        <span className="text-sm tabular-nums">
          <span className={marginColor(row.plannedMarginPct)}>
            {marginText(row.plannedMargin, row.plannedMarginPct)}
          </span>
          <span className="text-soft"> / </span>
          <span className={cn("font-semibold", marginColor(row.realizedMarginPct))}>
            {marginText(row.realizedMargin, row.realizedMarginPct)}
          </span>
        </span>
      ),
    },
  ];

  const budgetPct = tracking.budgetConsumptionPct;

  return (
    <div className="space-y-4">
      <p className="text-sm text-soft">
        Previsto × realizado de receita, custo e margem.{" "}
        {tracking.plannedBasis === "BUDGET"
          ? "Previsto pelo budget de horas rateado por alocação."
          : "Sem budget definido: previsto pela capacidade mensal padrão (160h × %)."}{" "}
        Realizado por horas aprovadas × valor vigente.
      </p>

      <div className="grid gap-3 sm:grid-cols-3">
        <KpiCard
          label="Receita"
          planned={money(tracking.planned.revenue)}
          realized={money(tracking.realized.revenue)}
        />
        <KpiCard
          label="Custo"
          planned={money(tracking.planned.cost)}
          realized={money(tracking.realized.cost)}
        />
        <KpiCard
          label="Margem"
          planned={marginText(
            tracking.planned.margin,
            tracking.planned.marginPct,
          )}
          realized={marginText(
            tracking.realized.margin,
            tracking.realized.marginPct,
          )}
          plannedClass={marginColor(tracking.planned.marginPct)}
          realizedClass={marginColor(tracking.realized.marginPct)}
        />
      </div>

      {tracking.planned.hasMissingCost || tracking.realized.hasMissingCost ? (
        <p className="text-xs text-[#92400e]">
          <TrendingUp size={13} className="mr-1 inline" />
          Custo incompleto: há alocações sem custo/h
          {tracking.hasUnallocatedApprovedHours
            ? " ou horas aprovadas sem vínculo de alocação"
            : ""}
          . A margem pode estar superestimada.
        </p>
      ) : null}

      {tracking.budgetHours != null && tracking.budgetHours > 0 ? (
        <div className="rounded-lg border border-border bg-surface p-3">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <p className="text-xs font-semibold uppercase tracking-wide text-soft">
              Consumo de budget
            </p>
            <p className="text-sm tabular-nums text-medium">
              {formatHours(tracking.approvedHoursTotal)} /{" "}
              {formatHours(tracking.budgetHours)}
              {budgetPct != null ? (
                <span
                  className={cn(
                    "ml-2 font-semibold",
                    budgetPct > 100
                      ? "text-[#b91c1c]"
                      : budgetPct >= 80
                        ? "text-[#92400e]"
                        : "text-[#166534]",
                  )}
                >
                  {formatPercent(budgetPct)}
                </span>
              ) : null}
            </p>
          </div>
          <div
            className="mt-2 h-2 w-full overflow-hidden rounded-full bg-surface-muted"
            role="progressbar"
            aria-valuenow={budgetPct ?? 0}
            aria-valuemin={0}
            aria-valuemax={100}
          >
            <div
              className={cn(
                "h-full rounded-full",
                budgetPct != null && budgetPct > 100
                  ? "bg-[#b91c1c]"
                  : budgetPct != null && budgetPct >= 80
                    ? "bg-[#92400e]"
                    : "bg-[#166534]",
              )}
              style={{ width: `${Math.min(budgetPct ?? 0, 100)}%` }}
            />
          </div>
        </div>
      ) : null}

      <div className="grid gap-3 sm:grid-cols-2">
        <div className="rounded-lg border border-border bg-surface p-3">
          <p className="text-xs font-semibold uppercase tracking-wide text-soft">
            Faturamento fechado
          </p>
          <p className="mt-1 text-sm tabular-nums text-strong">
            {tracking.closingsBilled == null
              ? "Sem fechamentos"
              : `${money(tracking.closingsBilled)} · ${formatHours(tracking.closingsHours)} · ${tracking.closingsCount} fechamento(s)`}
          </p>
          <p className="mt-0.5 text-xs text-soft">
            Fonte: RevenueClosing (não cancelados). Visão de faturamento,
            complementar à receita realizada por horas.
          </p>
        </div>
        <div className="rounded-lg border border-border bg-surface p-3">
          <p className="text-xs font-semibold uppercase tracking-wide text-soft">
            Recebíveis previstos
          </p>
          <p className="mt-1 text-sm tabular-nums text-strong">
            Previsto {money(tracking.receivablesForecast)} · Recebido{" "}
            {money(tracking.receivablesReceived)}
          </p>
          <p className="mt-0.5 text-xs text-soft">
            Fonte: ProjectReceivableSchedule. Previsão de entrada de caixa.
          </p>
        </div>
      </div>

      <DataTable
        columns={columns}
        rows={tracking.rows}
        rowKey={(row) => row.allocationId}
        caption={`Acompanhamento por consultor — ${tracking.projectName}`}
        empty={
          <p className="text-center text-sm text-soft">
            Sem alocações neste projeto.
          </p>
        }
      />
    </div>
  );
}
