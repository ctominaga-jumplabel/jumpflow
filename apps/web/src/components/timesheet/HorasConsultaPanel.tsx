import { Download } from "lucide-react";
import { SectionPanel } from "@/components/ui/SectionPanel";
import { ActionButton } from "@/components/ui/ActionButton";
import { ExportExcelButton } from "@/components/ui/ExportExcelButton";
import { HoursReportTable } from "@/components/reports/HoursReportTable";
import { focusRing } from "@/lib/styles";
import { cn } from "@/lib/utils";
import { timeEntryStatusLabels } from "@/lib/timesheet/types";
import { pageSizeOptionsWith } from "@/lib/reports/schemas";
import type { ReportFilterOptions } from "@/lib/db/reports";
import type { HoursReport } from "@/lib/reports/types";

const fieldClass = cn(
  "h-9 w-full rounded-md border border-border bg-surface px-3 text-sm text-strong",
  focusRing,
);
const labelClass = "mb-1 block text-xs font-semibold text-medium";

/**
 * Filter params shared with the Relatorios hours read/export. `semana` is
 * preserved as a passthrough so a manager who is ALSO a consultant does not
 * lose the weekly editor's selected week when applying a consultation filter.
 */
const FILTER_KEYS = [
  "from",
  "to",
  "clientId",
  "projectId",
  "consultantId",
  "status",
] as const;

const STATUS_ORDER = [
  "DRAFT",
  "SUBMITTED",
  "APPROVED",
  "REJECTED",
  "CLOSED",
] as const;

export interface HorasConsultaPanelProps {
  /** RBAC-scoped hours report (current page). */
  report: HoursReport;
  /** Scoped dropdown options (clients/projects/consultants). */
  options: ReportFilterOptions;
  /** Current raw query params (reflected in the form fields and links). */
  values: Record<string, string>;
}

/**
 * Read-only multi-consultant hours consultation for managers on the Horas
 * screen. Reuses the Relatorios pipeline end-to-end: the rows come from
 * `getHoursReport` (RBAC + financial masking on the server) and the table is
 * the same `HoursReportTable`. The "Exportar CSV" link points at the shared
 * `/api/relatorios/horas` endpoint with the same filters (whole filtered set —
 * no pagination params). Query string is the source of truth; no client state.
 */
export function HorasConsultaPanel({
  report,
  options,
  values,
}: HorasConsultaPanelProps) {
  const v = (key: string) => values[key] ?? "";

  /** Build a `/app/horas` href for a page, preserving filters + pageSize. */
  function pageHref(page: number): string {
    const search = new URLSearchParams();
    if (values.semana) search.set("semana", values.semana);
    for (const key of FILTER_KEYS) {
      const value = values[key];
      if (value && value !== "ALL") search.set(key, value);
    }
    if (values.pageSize) search.set("pageSize", values.pageSize);
    search.set("page", String(page));
    return `/app/horas?${search.toString()}`;
  }

  /** Filter params for the whole filtered set (no page/pageSize). */
  function exportSearch(): string {
    const search = new URLSearchParams();
    for (const key of FILTER_KEYS) {
      const value = values[key];
      if (value && value !== "ALL") search.set(key, value);
    }
    return search.toString();
  }

  /** CSV of the whole filtered set. */
  function csvHref(): string {
    const qs = exportSearch();
    return `/api/relatorios/horas${qs ? `?${qs}` : ""}`;
  }

  /** Same filter as the CSV, but the `.xlsx` route (Onda 6). */
  function xlsxHref(): string {
    const qs = exportSearch();
    return `/api/relatorios/horas/xlsx${qs ? `?${qs}` : ""}`;
  }

  return (
    <SectionPanel
      title="Consultar lançamentos"
      description="Visualização somente leitura de horas por cliente e consultor, no escopo do seu acesso."
    >
      <div className="px-5 py-4">
        <form method="get" action="/app/horas">
          {/* Preserve the weekly editor's selected week for dual-role users. */}
          {values.semana ? (
            <input type="hidden" name="semana" value={values.semana} />
          ) : null}
          {/* A new filter submission always returns to the first page. */}
          <input type="hidden" name="page" value="1" />

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <div>
              <label className={labelClass} htmlFor="hc-from">
                De
              </label>
              <input
                id="hc-from"
                name="from"
                type="date"
                defaultValue={v("from")}
                className={fieldClass}
              />
            </div>
            <div>
              <label className={labelClass} htmlFor="hc-to">
                Até
              </label>
              <input
                id="hc-to"
                name="to"
                type="date"
                defaultValue={v("to")}
                className={fieldClass}
              />
            </div>

            <div>
              <label className={labelClass} htmlFor="hc-client">
                Cliente
              </label>
              <select
                id="hc-client"
                name="clientId"
                defaultValue={v("clientId")}
                className={fieldClass}
              >
                <option value="">Todos</option>
                {options.clients.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className={labelClass} htmlFor="hc-consultant">
                Consultor
              </label>
              <select
                id="hc-consultant"
                name="consultantId"
                defaultValue={v("consultantId")}
                className={fieldClass}
              >
                <option value="">Todos</option>
                {options.consultants.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className={labelClass} htmlFor="hc-project">
                Projeto
              </label>
              <select
                id="hc-project"
                name="projectId"
                defaultValue={v("projectId")}
                className={fieldClass}
              >
                <option value="">Todos</option>
                {options.projects.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className={labelClass} htmlFor="hc-status">
                Status
              </label>
              <select
                id="hc-status"
                name="status"
                defaultValue={v("status")}
                className={fieldClass}
              >
                <option value="">Todos</option>
                {STATUS_ORDER.map((s) => (
                  <option key={s} value={s}>
                    {timeEntryStatusLabels[s]}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className={labelClass} htmlFor="hc-page-size">
                Itens por página
              </label>
              <select
                id="hc-page-size"
                name="pageSize"
                defaultValue={v("pageSize")}
                className={fieldClass}
              >
                {pageSizeOptionsWith(v("pageSize")).map((n) => (
                  <option key={n} value={n}>
                    {n}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="mt-4 flex flex-wrap items-center gap-2">
            <ActionButton type="submit" variant="primary" size="sm">
              Aplicar filtros
            </ActionButton>
            <a
              href="/app/horas"
              className={cn(
                "inline-flex h-8 items-center rounded-md border border-border bg-surface px-3 text-xs font-semibold text-medium hover:bg-surface-muted",
                focusRing,
              )}
            >
              Limpar
            </a>
            <a
              href={csvHref()}
              className={cn(
                "inline-flex h-8 items-center gap-1.5 rounded-md border border-border bg-surface px-3 text-xs font-semibold text-medium hover:bg-surface-muted",
                focusRing,
              )}
            >
              <Download aria-hidden="true" className="size-3.5" />
              Exportar CSV
            </a>
            <ExportExcelButton href={xlsxHref()} />
          </div>
        </form>
      </div>

      <div className="border-t border-border px-5 py-4">
        <HoursReportTable
          report={report}
          prevHref={pageHref(Math.max(1, report.pagination.page - 1))}
          nextHref={pageHref(report.pagination.page + 1)}
        />
      </div>
    </SectionPanel>
  );
}
