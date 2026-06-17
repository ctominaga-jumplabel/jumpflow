"use client";

import { ChevronDown } from "lucide-react";
import { SectionPanel } from "@/components/ui/SectionPanel";
import { ActionButton } from "@/components/ui/ActionButton";
import { focusRing } from "@/lib/styles";
import { cn } from "@/lib/utils";
import {
  ACTIVITY_TYPES,
  activityLabels,
  timeEntryStatusLabels,
} from "@/lib/timesheet/types";
import {
  hasActiveTimesheetFilter,
  TIMESHEET_SORT_FIELDS,
  type TimesheetFilter,
  type TimesheetSortField,
} from "@/lib/timesheet/filters";
import type { TimeEntryFormProject } from "./TimeEntryForm";

const projectStatusLabels: Record<string, string> = {
  PROPOSAL: "Proposta",
  ACTIVE: "Ativo",
  PAUSED: "Pausado",
  CLOSED: "Encerrado",
};

const statusOrder = [
  "DRAFT",
  "SUBMITTED",
  "APPROVED",
  "REJECTED",
  "CLOSED",
] as const;

const sortLabels: Record<TimesheetSortField, string> = {
  project: "Projeto",
  activity: "Atividade",
  status: "Status",
  date: "Data",
};

const fieldClass = cn(
  "h-9 w-full rounded-md border border-border bg-surface px-3 text-sm text-strong",
  focusRing,
);

const labelClass = "mb-1 block text-xs font-semibold text-medium";

export interface TimesheetFiltersProps {
  /**
   * "db": a plain GET form to `/app/horas` — the server reads `searchParams`
   * and the filtered `week` comes back already reduced (query string is the
   * source of truth). "demo": controlled inputs that call `onChange`/`onClear`
   * so the local state applies the SAME filters client-side.
   */
  mode: "demo" | "db";
  /** Current week start (ISO), kept as a hidden field so filters preserve it. */
  weekStart: string;
  /** Current filter values reflected in the fields. */
  filter: TimesheetFilter;
  /** Projects offered in the project dropdown (consultant scope for the week). */
  projects: TimeEntryFormProject[];
  /** demo mode: called when a control changes (controlled inputs). */
  onChange?: (next: TimesheetFilter) => void;
  /** demo mode: clear all filters (keeping the week). */
  onClear?: () => void;
}

/**
 * Operational filters above the weekly grid (Rodada 4.2,
 * docs/horas-operacional-filtros.md sections 3-4). Status/Projeto/Atividade
 * stay visible; Cobrança/Ordenar/Direção are secondary but still present.
 * Filters only reduce what is shown — the week stays the primary unit.
 */
export function TimesheetFilters({
  mode,
  weekStart,
  filter,
  projects,
  onChange,
  onClear,
}: TimesheetFiltersProps) {
  const isDemo = mode === "demo";

  function set<K extends keyof TimesheetFilter>(
    key: K,
    value: string,
  ): void {
    if (!onChange) return;
    const next: TimesheetFilter = { ...filter };
    if (value === "") {
      delete next[key];
    } else if (key === "billable") {
      next.billable = value === "true";
    } else {
      // The select values are constrained to the enum options below, so the
      // cast is safe; the schema is still the authority on parse.
      next[key] = value as TimesheetFilter[K];
    }
    onChange(next);
  }

  // In demo mode the inputs are controlled (value); in db mode they are
  // uncontrolled defaults submitted via GET.
  const bind = (key: keyof TimesheetFilter, raw: string | undefined) =>
    isDemo
      ? { value: raw ?? "", onChange: (e: { target: { value: string } }) => set(key, e.target.value) }
      : { defaultValue: raw ?? "" };

  const billableRaw =
    filter.billable === undefined ? "" : String(filter.billable);

  // Secondary controls (Cobrança/Ordenar/Direção) sit behind a disclosure, as
  // in ReportFilters. Start it open when any of them is applied so an active
  // filter is never hidden from view.
  const advancedActive =
    filter.billable !== undefined ||
    Boolean(filter.sort) ||
    Boolean(filter.direction);
  const anyActive = hasActiveTimesheetFilter(filter);

  const content = (
    <>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <div>
          <label className={labelClass} htmlFor="hf-status">
            Status
          </label>
          <select
            id="hf-status"
            name="status"
            className={fieldClass}
            {...bind("status", filter.status)}
          >
            <option value="">Todos</option>
            {statusOrder.map((s) => (
              <option key={s} value={s}>
                {timeEntryStatusLabels[s]}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label className={labelClass} htmlFor="hf-project">
            Projeto
          </label>
          <select
            id="hf-project"
            name="projectId"
            className={fieldClass}
            {...bind("projectId", filter.projectId)}
          >
            <option value="">Todos</option>
            {projects.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name} · {p.clientName}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label className={labelClass} htmlFor="hf-project-status">
            Status do projeto
          </label>
          <select
            id="hf-project-status"
            name="projectStatus"
            className={fieldClass}
            {...bind("projectStatus", filter.projectStatus)}
          >
            <option value="">Todos</option>
            {Object.entries(projectStatusLabels).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label className={labelClass} htmlFor="hf-activity">
            Atividade
          </label>
          <select
            id="hf-activity"
            name="activity"
            className={fieldClass}
            {...bind("activity", filter.activity)}
          >
            <option value="">Todas</option>
            {ACTIVITY_TYPES.map((a) => (
              <option key={a} value={a}>
                {activityLabels[a]}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label className={labelClass} htmlFor="hf-start">
            Início do período
          </label>
          <input
            id="hf-start"
            type="date"
            name="inicio"
            required
            className={fieldClass}
            {...bind("startDate", filter.startDate)}
          />
        </div>

        <div>
          <label className={labelClass} htmlFor="hf-end">
            Fim do período
          </label>
          <input
            id="hf-end"
            type="date"
            name="fim"
            required
            className={fieldClass}
            {...bind("endDate", filter.endDate)}
          />
        </div>
      </div>

      <details
        open={advancedActive}
        className="group mt-4 rounded-md border border-border bg-surface-muted/40"
      >
        <summary
          className={cn(
            "flex cursor-pointer select-none items-center gap-2 rounded-md px-4 py-2.5 text-xs font-semibold text-medium",
            focusRing,
          )}
        >
          <ChevronDown
            aria-hidden="true"
            className="size-4 shrink-0 text-soft transition-transform duration-150 group-open:rotate-180"
          />
          Cobrança e ordenação
          {advancedActive ? (
            <span
              className="ml-1 inline-flex h-1.5 w-1.5 rounded-full bg-brand"
              aria-hidden="true"
            />
          ) : null}
        </summary>
        <div className="grid grid-cols-1 gap-4 px-4 pb-4 pt-2 sm:grid-cols-2 lg:grid-cols-4">
          <div>
            <label className={labelClass} htmlFor="hf-billable">
              Cobrança
            </label>
            <select
              id="hf-billable"
              name="billable"
              className={fieldClass}
              {...(isDemo
                ? {
                    value: billableRaw,
                    onChange: (e: { target: { value: string } }) =>
                      set("billable", e.target.value),
                  }
                : { defaultValue: billableRaw })}
            >
              <option value="">Todas</option>
              <option value="true">Faturável</option>
              <option value="false">Não faturável</option>
            </select>
          </div>

          <div>
            <label className={labelClass} htmlFor="hf-sort">
              Ordenar por
            </label>
            <select
              id="hf-sort"
              name="sort"
              className={fieldClass}
              {...bind("sort", filter.sort)}
            >
              {TIMESHEET_SORT_FIELDS.map((s) => (
                <option key={s} value={s}>
                  {sortLabels[s]}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className={labelClass} htmlFor="hf-direction">
              Direção
            </label>
            <select
              id="hf-direction"
              name="direction"
              className={fieldClass}
              {...bind("direction", filter.direction)}
            >
              <option value="asc">Crescente</option>
              <option value="desc">Decrescente</option>
            </select>
          </div>
        </div>
      </details>

      <div className="mt-4 flex flex-wrap items-center gap-2">
        {isDemo ? (
          <ActionButton
            type="button"
            variant="secondary"
            size="sm"
            onClick={onClear}
          >
            Limpar
          </ActionButton>
        ) : (
          <>
            <ActionButton type="submit" variant="primary" size="sm">
              Aplicar filtros
            </ActionButton>
            <a
              href={`/app/horas?semana=${weekStart}`}
              className={cn(
                "inline-flex h-8 items-center rounded-md border border-border bg-surface px-3 text-xs font-semibold text-medium hover:bg-surface-muted",
                focusRing,
              )}
            >
              Limpar
            </a>
          </>
        )}
        {anyActive ? (
          <span className="inline-flex items-center gap-1.5 text-xs font-medium text-medium">
            <span
              className="inline-flex h-1.5 w-1.5 rounded-full bg-brand"
              aria-hidden="true"
            />
            Filtros aplicados · Limpar mantém só a semana.
          </span>
        ) : null}
      </div>
    </>
  );

  return (
    <SectionPanel
      title="Filtros"
      description="Reduza a semana por status, projeto, atividade e cobrança."
    >
      {isDemo ? (
        <div className="px-5 py-4">{content}</div>
      ) : (
        <form method="get" action="/app/horas" className="px-5 py-4">
          {/* The week stays the primary unit: preserve it on every apply. */}
          <input type="hidden" name="semana" value={weekStart} />
          {content}
        </form>
      )}
    </SectionPanel>
  );
}
