import { SectionPanel } from "@/components/ui/SectionPanel";
import { StatTile } from "@/components/reports/StatTile";
import { EmptyState } from "@/components/ui/EmptyState";
import { BarChart3 } from "lucide-react";
import { formatCurrencyPrecise, formatHours } from "@/lib/format";
import type { ConsolidatedReport as ConsolidatedReportData } from "@/lib/reports/types";

export interface ConsolidatedReportProps {
  report: ConsolidatedReportData;
}

/**
 * Consolidated/closing view (docs section 5.3): cliente -> projeto, with the
 * hours/expenses that ENTER the closing separated from pending items. Pending
 * figures are signaled with a warning tone and never summed into "entram".
 */
export function ConsolidatedReport({ report }: ConsolidatedReportProps) {
  const { clients, totals, includeFinancials } = report;

  if (clients.length === 0) {
    return (
      <EmptyState
        icon={BarChart3}
        title="Sem dados para o período"
        description="Nenhuma hora ou despesa no escopo e período selecionados."
      />
    );
  }

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatTile
          label="Horas aprovadas"
          value={formatHours(totals.approvedHours)}
          hint="Entram no fechamento"
        />
        <StatTile
          label="Horas pendentes"
          value={formatHours(totals.pendingHours)}
          tone="warning"
          hint="Não entram"
        />
        {includeFinancials ? (
          <StatTile
            label="Faturado (horas)"
            value={formatCurrencyPrecise(totals.totalBilled ?? 0)}
            hint="Entram no fechamento"
          />
        ) : null}
        <StatTile
          label="Despesas que entram"
          value={formatCurrencyPrecise(totals.expenseEntering)}
          hint="Aprovadas / agendadas / pagas"
        />
        <StatTile
          label="Despesas pendentes"
          value={formatCurrencyPrecise(totals.expensePending)}
          tone="warning"
          hint="Não entram"
        />
      </div>

      {clients.map((client) => (
        <SectionPanel
          key={client.clientName}
          title={client.clientName}
          description="Consolidado por projeto: o que entra no fechamento e o pendente."
        >
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-sm">
              <thead>
                <tr className="border-b border-border">
                  <th className="px-5 py-3 text-left text-xs font-semibold uppercase tracking-wide text-soft">
                    Projeto
                  </th>
                  <th className="px-5 py-3 text-right text-xs font-semibold uppercase tracking-wide text-soft">
                    Horas aprovadas
                  </th>
                  <th className="px-5 py-3 text-right text-xs font-semibold uppercase tracking-wide text-warning">
                    Horas pendentes
                  </th>
                  {includeFinancials ? (
                    <th className="px-5 py-3 text-right text-xs font-semibold uppercase tracking-wide text-soft">
                      Faturado
                    </th>
                  ) : null}
                  <th className="px-5 py-3 text-right text-xs font-semibold uppercase tracking-wide text-soft">
                    Despesas que entram
                  </th>
                  <th className="px-5 py-3 text-right text-xs font-semibold uppercase tracking-wide text-warning">
                    Despesas pendentes
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {client.projects.map((p) => (
                  <tr
                    key={p.projectId}
                    className="transition-colors hover:bg-surface-muted/60"
                  >
                    <td className="px-5 py-3 font-medium text-strong">
                      <span
                        className="block max-w-[16rem] truncate"
                        title={p.projectName}
                      >
                        {p.projectName}
                      </span>
                    </td>
                    <td className="whitespace-nowrap px-5 py-3 text-right tabular-nums text-strong">
                      {formatHours(p.approvedHours)}
                    </td>
                    <td className="whitespace-nowrap px-5 py-3 text-right tabular-nums text-warning">
                      {p.pendingHours > 0 ? formatHours(p.pendingHours) : "—"}
                    </td>
                    {includeFinancials ? (
                      <td className="whitespace-nowrap px-5 py-3 text-right tabular-nums text-medium">
                        {p.billedAmount != null
                          ? formatCurrencyPrecise(p.billedAmount)
                          : "—"}
                      </td>
                    ) : null}
                    <td className="whitespace-nowrap px-5 py-3 text-right tabular-nums text-strong">
                      {formatCurrencyPrecise(p.expenseEntering)}
                    </td>
                    <td className="whitespace-nowrap px-5 py-3 text-right tabular-nums text-warning">
                      {p.expensePending > 0
                        ? formatCurrencyPrecise(p.expensePending)
                        : "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </SectionPanel>
      ))}
    </div>
  );
}
