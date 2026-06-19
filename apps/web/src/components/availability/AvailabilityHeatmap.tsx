"use client";

import { useMemo, useState } from "react";
import { CalendarRange } from "lucide-react";
import { DataToolbar } from "@/components/ui/DataToolbar";
import { EmptyState } from "@/components/ui/EmptyState";
import { FilterChip } from "@/components/ui/FilterChip";
import { SectionPanel } from "@/components/ui/SectionPanel";
import { cn } from "@/lib/utils";
import {
  availabilityStateLabels,
  availabilityStateOrder,
  type AvailabilityCell,
  type AvailabilityMap,
  type AvailabilityState,
} from "@/lib/availability/types";

/** Tom de cor por estado (alinhado ao design system; sem libs externas). */
const stateTone: Record<AvailabilityState, string> = {
  FREE: "bg-success-soft text-success ring-success/30",
  BENCH: "bg-warning-soft text-warning ring-warning/40",
  PARTIAL: "bg-brand-soft text-brand-dark ring-brand/30",
  FULL: "bg-danger-soft text-danger ring-danger/30",
  VACATION: "bg-info-soft text-info ring-info/30",
  ON_LEAVE: "bg-surface-muted text-medium ring-ink/20",
  INACTIVE: "bg-surface-muted text-soft ring-ink/10",
};

function cellText(cell: AvailabilityCell): string {
  switch (cell.state) {
    case "FULL":
    case "PARTIAL":
      return `${cell.allocationPercent}%`;
    case "FREE":
      return "Livre";
    case "BENCH":
      return "Bench";
    case "VACATION":
      return "Férias";
    case "ON_LEAVE":
      return "Afast.";
    case "INACTIVE":
      return "Inativo";
  }
}

function cellTitle(
  consultantName: string,
  periodLabel: string,
  cell: AvailabilityCell,
): string {
  const state = availabilityStateLabels[cell.state];
  const pct =
    cell.state === "FULL" || cell.state === "PARTIAL"
      ? ` (${cell.allocationPercent}%)`
      : "";
  return `${consultantName} — ${periodLabel}: ${state}${pct}`;
}

type StatusFilter = "ALL" | "ACTIVE";

export interface AvailabilityHeatmapProps {
  map: AvailabilityMap;
  /** Aviso de degradação graciosa (dados de demonstração). */
  isMock?: boolean;
}

/**
 * Heatmap read-only de disponibilidade (EP11 US11.01/02). Grid consultor ×
 * semana com células coloridas por estado + legenda. Filtros locais por área,
 * senioridade e status sobre o read-model já escopado por RBAC no servidor — a
 * filtragem aqui é cosmética e nunca amplia visibilidade. Sem libs de chart.
 */
export function AvailabilityHeatmap({ map, isMock }: AvailabilityHeatmapProps) {
  const [area, setArea] = useState<string>("ALL");
  const [seniority, setSeniority] = useState<string>("ALL");
  const [status, setStatus] = useState<StatusFilter>("ALL");

  const areas = useMemo(() => {
    const set = new Set<string>();
    for (const row of map.rows) if (row.area) set.add(row.area);
    return [...set].sort((a, b) => a.localeCompare(b, "pt-BR"));
  }, [map.rows]);

  const seniorities = useMemo(() => {
    const set = new Set<string>();
    for (const row of map.rows) set.add(row.seniority);
    return [...set].sort((a, b) => a.localeCompare(b, "pt-BR"));
  }, [map.rows]);

  const rows = useMemo(
    () =>
      map.rows.filter((row) => {
        if (area !== "ALL" && row.area !== area) return false;
        if (seniority !== "ALL" && row.seniority !== seniority) return false;
        if (status === "ACTIVE" && row.status !== "ACTIVE") return false;
        return true;
      }),
    [map.rows, area, seniority, status],
  );

  const periodByKey = useMemo(
    () => new Map(map.periods.map((p) => [p.key, p])),
    [map.periods],
  );

  const hasData = rows.length > 0 && map.periods.length > 0;

  return (
    <div className="space-y-4">
      {isMock ? (
        <p className="rounded-md border border-warning/30 bg-warning-soft px-3 py-2 text-xs font-medium text-warning">
          Banco de dados não configurado — exibindo dados de demonstração. Os
          estados abaixo não refletem alocações reais.
        </p>
      ) : null}

      <DataToolbar
        filters={
          <>
            <label className="sr-only" htmlFor="availability-area">
              Filtrar por área
            </label>
            <select
              id="availability-area"
              value={area}
              onChange={(e) => setArea(e.target.value)}
              className="h-8 rounded-md border border-border bg-surface px-2 text-xs font-semibold text-medium"
            >
              <option value="ALL">Todas as áreas</option>
              {areas.map((a) => (
                <option key={a} value={a}>
                  {a}
                </option>
              ))}
            </select>
            <label className="sr-only" htmlFor="availability-seniority">
              Filtrar por senioridade
            </label>
            <select
              id="availability-seniority"
              value={seniority}
              onChange={(e) => setSeniority(e.target.value)}
              className="h-8 rounded-md border border-border bg-surface px-2 text-xs font-semibold text-medium"
            >
              <option value="ALL">Todas as senioridades</option>
              {seniorities.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
            <span className="mx-1 h-5 w-px bg-border" aria-hidden="true" />
            <FilterChip
              label="Todos"
              active={status === "ALL"}
              onClick={() => setStatus("ALL")}
            />
            <FilterChip
              label="Somente ativos"
              active={status === "ACTIVE"}
              onClick={() => setStatus("ACTIVE")}
            />
          </>
        }
      />

      <ul className="flex flex-wrap items-center gap-3 text-xs text-soft">
        {availabilityStateOrder.map((state) => (
          <li key={state} className="flex items-center gap-1.5">
            <span
              className={cn(
                "size-3 rounded-sm ring-1",
                stateTone[state],
              )}
            />
            {availabilityStateLabels[state]}
          </li>
        ))}
      </ul>

      <SectionPanel
        title="Disponibilidade por período"
        description={`${rows.length} consultores · ${map.periods.length} semanas`}
      >
        {!hasData ? (
          <div className="px-5 py-10">
            <EmptyState
              icon={CalendarRange}
              title="Sem dados de disponibilidade"
              description="Não há consultores no seu escopo ou nenhum período selecionado."
            />
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-sm">
              <caption className="sr-only">
                Mapa de disponibilidade por consultor e semana
              </caption>
              <thead>
                <tr className="border-b border-border">
                  <th
                    scope="col"
                    className="sticky left-0 z-10 bg-surface px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-soft"
                  >
                    Consultor
                  </th>
                  {map.periods.map((period) => (
                    <th
                      key={period.key}
                      scope="col"
                      className="px-2 py-3 text-center text-xs font-semibold text-soft"
                      title={period.label}
                    >
                      <span className="block whitespace-nowrap">
                        {period.shortLabel}
                      </span>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {rows.map((row) => (
                  <tr key={row.consultantId}>
                    <th
                      scope="row"
                      className="sticky left-0 z-10 bg-surface px-4 py-2.5 text-left"
                    >
                      <span className="block truncate text-sm font-medium text-strong">
                        {row.consultantName}
                      </span>
                      <span className="block truncate text-xs text-soft">
                        {[row.seniority, row.area].filter(Boolean).join(" · ") ||
                          "—"}
                      </span>
                    </th>
                    {row.cells.map((cell) => {
                      const period = periodByKey.get(cell.periodKey);
                      return (
                        <td key={cell.periodKey} className="px-2 py-2.5 text-center">
                          <span
                            title={cellTitle(
                              row.consultantName,
                              period?.label ?? cell.periodKey,
                              cell,
                            )}
                            className={cn(
                              "inline-flex min-w-[3.25rem] items-center justify-center rounded-md px-2 py-1 text-xs font-semibold tabular-nums ring-1",
                              stateTone[cell.state],
                            )}
                          >
                            {cellText(cell)}
                          </span>
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </SectionPanel>
    </div>
  );
}
