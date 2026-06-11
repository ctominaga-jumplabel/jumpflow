import { DataTable, type DataTableColumn } from "@/components/ui/DataTable";
import { SectionPanel } from "@/components/ui/SectionPanel";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { StatTile } from "@/components/reports/StatTile";
import { formatCurrencyPrecise, formatDate } from "@/lib/format";
import {
  expenseStatusLabels,
  expenseStatusTones,
} from "@/lib/expenses/types";
import type { ExpensesReport, ExpensesReportRow } from "@/lib/reports/types";

const stageTones: Record<string, "neutral" | "info" | "success" | "warning" | "danger"> =
  {
    Gestor: "info",
    Financeiro: "info",
    Pagamento: "warning",
    Finalizada: "success",
    Reprovada: "danger",
    Rascunho: "neutral",
  };

export interface ExpensesReportTableProps {
  report: ExpensesReport;
}

/** Expenses report table + totals (docs section 5.2). */
export function ExpensesReportTable({ report }: ExpensesReportTableProps) {
  const { rows, totals } = report;

  const columns: DataTableColumn<ExpensesReportRow>[] = [
    {
      key: "date",
      header: "Data",
      cell: (r) => (
        <span className="tabular-nums text-strong">{formatDate(r.date)}</span>
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
      key: "description",
      header: "Descrição",
      cell: (r) => (
        <div className="max-w-xs">
          <p className="truncate text-medium">{r.description}</p>
          {r.invoiceNumber ? (
            <p className="text-xs text-soft">NF {r.invoiceNumber}</p>
          ) : null}
        </div>
      ),
    },
    {
      key: "amount",
      header: "Valor",
      align: "right",
      cell: (r) => (
        <span className="tabular-nums font-semibold text-strong">
          {formatCurrencyPrecise(r.amount)}
        </span>
      ),
    },
    {
      key: "status",
      header: "Status",
      cell: (r) => (
        <StatusBadge tone={expenseStatusTones[r.status]}>
          {expenseStatusLabels[r.status]}
        </StatusBadge>
      ),
    },
    {
      key: "stage",
      header: "Etapa",
      cell: (r) => (
        <StatusBadge tone={stageTones[r.stage] ?? "neutral"}>{r.stage}</StatusBadge>
      ),
      className: "hidden md:table-cell",
    },
    {
      key: "receipt",
      header: "Comprovante",
      cell: (r) => (
        <span className="text-xs text-medium">{r.hasReceipt ? "Sim" : "Não"}</span>
      ),
      className: "hidden lg:table-cell",
    },
  ];

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatTile
          label="Total geral"
          value={formatCurrencyPrecise(totals.totalAmount)}
        />
        <StatTile
          label="Aprovado (financeiro)"
          value={formatCurrencyPrecise(totals.toPayAmount)}
        />
        <StatTile
          label="Agendado"
          value={formatCurrencyPrecise(totals.scheduledAmount)}
        />
        <StatTile label="Pago" value={formatCurrencyPrecise(totals.paidAmount)} />
      </div>

      <SectionPanel
        title="Despesas"
        description="Despesas no escopo e período selecionados."
      >
        <DataTable
          columns={columns}
          rows={rows}
          rowKey={(r) => r.id}
          caption="Relatório de despesas"
          empty={
            <p className="text-center text-sm text-soft">
              Nenhuma despesa para os filtros aplicados.
            </p>
          }
        />
      </SectionPanel>
    </div>
  );
}
