import { Download } from "lucide-react";
import { cn } from "@/lib/utils";
import { focusRing } from "@/lib/styles";
import { ReportFilters } from "@/components/reports/ReportFilters";
import { HoursReportTable } from "@/components/reports/HoursReportTable";
import { ExpensesReportTable } from "@/components/reports/ExpensesReportTable";
import { ConsolidatedReport } from "@/components/reports/ConsolidatedReport";
import type { ReportFilterOptions } from "@/lib/db/reports";
import type {
  ConsolidatedReport as ConsolidatedReportData,
  ExpensesReport,
  HoursReport,
} from "@/lib/reports/types";

type Tab = "horas" | "despesas" | "consolidado";

const TABS: { key: Tab; label: string }[] = [
  { key: "horas", label: "Horas" },
  { key: "despesas", label: "Despesas" },
  { key: "consolidado", label: "Consolidado" },
];

/** CSV endpoint per tab. */
const CSV_ENDPOINT: Record<Tab, string> = {
  horas: "/api/relatorios/horas",
  despesas: "/api/relatorios/despesas",
  consolidado: "/api/relatorios/consolidado",
};

/** Filter param keys relevant to each tab (kept out of the export link otherwise). */
const TAB_PARAMS: Record<Tab, string[]> = {
  horas: ["from", "to", "clientId", "projectId", "consultantId", "status", "activityType"],
  despesas: ["from", "to", "clientId", "projectId", "consultantId", "status", "stage"],
  consolidado: ["month", "from", "to", "clientId", "projectId", "consultantId"],
};

export interface ReportsViewProps {
  mode: "db" | "demo";
  tab: Tab;
  includeFinancials: boolean;
  filterOptions: ReportFilterOptions;
  rawParams: Record<string, string>;
  hoursReport?: HoursReport;
  expensesReport?: ExpensesReport;
  consolidatedReport?: ConsolidatedReportData;
}

function buildQuery(tab: Tab, params: Record<string, string>): string {
  const search = new URLSearchParams();
  for (const key of TAB_PARAMS[tab]) {
    const value = params[key];
    if (value && value !== "ALL") search.set(key, value);
  }
  const qs = search.toString();
  return qs ? `?${qs}` : "";
}

/**
 * Reports shell: segment tabs, the shared filter form (query-string driven),
 * the active report table and an "Exportar CSV" link to the route handler with
 * the SAME params. Server component — no client state; the tab and filters live
 * in the URL.
 */
export function ReportsView({
  mode,
  tab,
  includeFinancials,
  filterOptions,
  rawParams,
  hoursReport,
  expensesReport,
  consolidatedReport,
}: ReportsViewProps) {
  const exportHref = `${CSV_ENDPOINT[tab]}${buildQuery(tab, rawParams)}`;

  return (
    <div className="space-y-6">
      {mode === "demo" ? (
        <div className="rounded-md border border-warning/30 bg-warning-soft px-4 py-3 text-sm font-medium text-warning">
          Modo demonstração: banco não configurado.
        </div>
      ) : null}

      <div className="flex flex-wrap items-center justify-between gap-3">
        <nav
          aria-label="Segmentos de relatório"
          className="inline-flex items-center gap-1 rounded-md border border-border bg-surface p-1"
        >
          {TABS.map((t) => {
            const active = t.key === tab;
            return (
              <a
                key={t.key}
                href={`/app/relatorios?tab=${t.key}`}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "rounded px-3 py-1.5 text-sm font-semibold transition-colors",
                  focusRing,
                  active
                    ? "bg-brand text-white"
                    : "text-medium hover:bg-surface-muted",
                )}
              >
                {t.label}
              </a>
            );
          })}
        </nav>

        <a
          href={exportHref}
          className={cn(
            "inline-flex h-9 items-center gap-2 rounded-md border-2 border-ink bg-surface px-3 text-sm font-semibold text-strong shadow-[2px_2px_0_0_var(--color-ink)] hover:bg-surface-muted",
            focusRing,
            mode === "demo" && "pointer-events-none opacity-50",
          )}
          aria-disabled={mode === "demo"}
        >
          <Download aria-hidden="true" className="size-4" />
          Exportar CSV
        </a>
      </div>

      <ReportFilters tab={tab} options={filterOptions} values={rawParams} />

      {tab === "horas" && hoursReport ? (
        <HoursReportTable report={hoursReport} />
      ) : null}
      {tab === "despesas" && expensesReport ? (
        <ExpensesReportTable report={expensesReport} />
      ) : null}
      {tab === "consolidado" && consolidatedReport ? (
        <ConsolidatedReport report={consolidatedReport} />
      ) : null}

      {mode === "demo" ? (
        <p className="text-sm text-soft">
          Conecte um banco de dados para visualizar e exportar relatórios reais.
        </p>
      ) : null}

      {/* includeFinancials is decided on the server; surfaced here only to keep
          the prop meaningful for tests/future client toggles. */}
      <span className="sr-only">
        {includeFinancials ? "Com valores financeiros" : "Sem valores financeiros"}
      </span>
    </div>
  );
}
