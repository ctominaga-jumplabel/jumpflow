import { DataTable, type DataTableColumn } from "@/components/ui/DataTable";
import { SectionPanel } from "@/components/ui/SectionPanel";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { StatTile } from "@/components/reports/StatTile";
import { formatCurrencyPrecise, formatDate, formatHours } from "@/lib/format";
import {
  timeEntryStatusLabels,
  type TimeEntryStatus,
} from "@/lib/timesheet/types";
import type { HoursReport, HoursReportRow } from "@/lib/reports/types";

const statusTones: Record<
  TimeEntryStatus,
  "neutral" | "info" | "success" | "warning" | "danger"
> = {
  DRAFT: "neutral",
  SUBMITTED: "info",
  APPROVED: "success",
  REJECTED: "danger",
  CLOSED: "neutral",
};

function fmtDateTime(iso?: string): string {
  if (!iso) return "—";
  const date = new Date(iso);
  return date.toLocaleString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export interface HoursReportTableProps {
  report: HoursReport;
}

/** Hours report table + totals (docs section 5.1). */
export function HoursReportTable({ report }: HoursReportTableProps) {
  const { rows, totals, includeFinancials } = report;

  const columns: DataTableColumn<HoursReportRow>[] = [
    {
      key: "date",
      header: "Data",
      cell: (r) => (
        <div>
          <p className="tabular-nums text-strong">{formatDate(r.date)}</p>
          <p className="text-xs text-soft">{r.weekLabel}</p>
        </div>
      ),
    },
    {
      key: "consultant",
      header: "Consultor",
      cell: (r) => <span className="text-medium">{r.consultantName}</span>,
    },
    {
      key: "project",
      header: "Cliente / Projeto",
      cell: (r) => (
        <div>
          <p className="font-medium text-strong">{r.projectName}</p>
          <p className="text-xs text-soft">{r.clientName}</p>
        </div>
      ),
    },
    {
      key: "activity",
      header: "Atividade",
      cell: (r) => <span className="text-medium">{r.activity}</span>,
    },
    {
      key: "hours",
      header: "Horas",
      align: "right",
      cell: (r) => (
        <span className="tabular-nums text-strong">{formatHours(r.hours)}</span>
      ),
    },
    {
      key: "billable",
      header: "Faturável",
      cell: (r) => (
        <span className="text-xs text-medium">{r.billable ? "Sim" : "Não"}</span>
      ),
      className: "hidden md:table-cell",
    },
    {
      key: "status",
      header: "Status",
      cell: (r) => (
        <StatusBadge tone={statusTones[r.status]}>
          {timeEntryStatusLabels[r.status]}
        </StatusBadge>
      ),
    },
    {
      key: "decidedAt",
      header: "Decidido em",
      cell: (r) => (
        <span className="text-xs text-soft">{fmtDateTime(r.decidedAt)}</span>
      ),
      className: "hidden lg:table-cell",
    },
  ];

  if (includeFinancials) {
    columns.push(
      {
        key: "rate",
        header: "Valor hora",
        align: "right",
        cell: (r) => (
          <span className="tabular-nums text-medium">
            {r.billingRate != null
              ? formatCurrencyPrecise(r.billingRate)
              : "—"}
          </span>
        ),
        className: "hidden lg:table-cell",
      },
      {
        key: "billed",
        header: "Faturado",
        align: "right",
        cell: (r) => (
          <span className="tabular-nums font-semibold text-strong">
            {r.billedAmount != null
              ? formatCurrencyPrecise(r.billedAmount)
              : "—"}
          </span>
        ),
      },
    );
  }

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatTile label="Total de horas" value={formatHours(totals.totalHours)} />
        <StatTile label="Lançamentos" value={String(totals.count)} />
        {includeFinancials ? (
          <StatTile
            label="Faturado (aprovadas)"
            value={formatCurrencyPrecise(totals.totalBilled ?? 0)}
          />
        ) : null}
      </div>

      <SectionPanel
        title="Horas"
        description="Lançamentos no escopo e período selecionados."
      >
        <DataTable
          columns={columns}
          rows={rows}
          rowKey={(r) => r.id}
          caption="Relatório de horas"
          empty={
            <p className="text-center text-sm text-soft">
              Nenhum lançamento de horas para os filtros aplicados.
            </p>
          }
        />
      </SectionPanel>
    </div>
  );
}
