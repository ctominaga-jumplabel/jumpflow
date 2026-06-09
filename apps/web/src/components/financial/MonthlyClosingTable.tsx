import { Lock } from "lucide-react";
import { ActionButton } from "@/components/ui/ActionButton";
import { DataTable, type DataTableColumn } from "@/components/ui/DataTable";
import { SectionPanel } from "@/components/ui/SectionPanel";
import { StatusBadge, type StatusTone } from "@/components/ui/StatusBadge";
import { formatCurrency, formatCurrencyPrecise, formatHours } from "@/lib/format";
import {
  closingStatusLabels,
  rowAmount,
  type ClosingRow,
  type ClosingStatus,
} from "@/lib/mock-data/financial";

const toneByStatus: Record<ClosingStatus, StatusTone> = {
  OPEN: "neutral",
  REVIEW: "warning",
  READY: "info",
  CLOSED: "success",
};

export interface MonthlyClosingTableProps {
  rows: ClosingRow[];
  monthLabel: string;
}

/**
 * Monthly closing table: only approved hours feed it; amount = hours × rate.
 * The "Fechar mês" action is prepared (closing locks the linked entries and is
 * audited) and not yet wired to a server action.
 */
export function MonthlyClosingTable({ rows, monthLabel }: MonthlyClosingTableProps) {
  const columns: DataTableColumn<ClosingRow>[] = [
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
      key: "hours",
      header: "Horas aprovadas",
      align: "right",
      cell: (r) => (
        <span className="text-sm tabular-nums">
          {formatHours(r.approvedHours)}
        </span>
      ),
    },
    {
      key: "rate",
      header: "Valor hora",
      align: "right",
      cell: (r) => (
        <span className="text-sm tabular-nums text-medium">
          {formatCurrencyPrecise(r.billingHourlyRate)}
        </span>
      ),
      className: "hidden sm:table-cell",
    },
    {
      key: "amount",
      header: "Total estimado",
      align: "right",
      cell: (r) => (
        <span className="text-sm font-semibold tabular-nums text-strong">
          {formatCurrency(rowAmount(r))}
        </span>
      ),
    },
    {
      key: "status",
      header: "Status",
      cell: (r) => (
        <StatusBadge tone={toneByStatus[r.status]}>
          {closingStatusLabels[r.status]}
        </StatusBadge>
      ),
    },
  ];

  return (
    <SectionPanel
      title="Fechamento mensal"
      description={`Horas aprovadas por cliente e projeto · ${monthLabel}`}
      action={
        <ActionButton variant="primary" size="sm" icon={Lock}>
          Fechar mês
        </ActionButton>
      }
    >
      <DataTable
        columns={columns}
        rows={rows}
        rowKey={(r) => r.id}
        caption="Fechamento mensal por projeto"
      />
    </SectionPanel>
  );
}
