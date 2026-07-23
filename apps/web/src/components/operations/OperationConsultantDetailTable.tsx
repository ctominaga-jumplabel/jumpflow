"use client";

import { AlertTriangle, Paperclip } from "lucide-react";
import { useTransition } from "react";
import { ExportExcelButton } from "@/components/ui/ExportExcelButton";
import { DataTable, type DataTableColumn } from "@/components/ui/DataTable";
import { FeedbackBanner, useFeedback } from "@/components/ui/Feedback";
import { SectionPanel } from "@/components/ui/SectionPanel";
import { StatusBadge, type StatusTone } from "@/components/ui/StatusBadge";
import { ReportPagination } from "@/components/reports/ReportPagination";
import { formatHours } from "@/lib/format";
import {
  activityLabelOf,
  timeEntryStatusLabels,
  type TimeEntryStatus,
} from "@/lib/timesheet/types";
import type {
  OperationClosingDetailView,
  OperationDetailRow,
} from "@/lib/operations/closing";
import { getTimeEntryAttachmentUrl } from "@/app/app/horas/actions";

const entryStatusTone: Record<TimeEntryStatus, StatusTone> = {
  DRAFT: "neutral",
  SUBMITTED: "warning",
  APPROVED: "success",
  REJECTED: "danger",
  CLOSED: "info",
};

function statusLabel(status: string): string {
  return timeEntryStatusLabels[status as TimeEntryStatus] ?? status;
}

function formatDay(iso: string): string {
  return new Date(iso).toLocaleDateString("pt-BR", { timeZone: "UTC" });
}

function formatDecided(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export interface OperationConsultantDetailTableProps {
  detail: OperationClosingDetailView;
  /** `.xlsx` export href reflecting the current filters. */
  exportHref?: string;
  /** Pagination hrefs (query string preserved) built by the page. */
  prevHref: string;
  nextHref: string;
}

/**
 * "Detalhamento por consultor" tab of the Fechamento Operacional: the current
 * page of launches matching the shared filter panel, with the columns the DP
 * asked for (Data, Consultor, Cliente/Projeto, Atividade, Horas, Faturável,
 * Status, Decidido em). Filters + sorting + pagination all live in the query
 * string (driven by the panel above the tabs). Exception launches (fora do "Dia
 * Útil" ou com anexo) are highlighted to match the apuração.
 */
export function OperationConsultantDetailTable({
  detail,
  exportHref,
  prevHref,
  nextHref,
}: OperationConsultantDetailTableProps) {
  const { feedback, notify } = useFeedback();
  const [isPending, startTransition] = useTransition();

  function viewAttachment(id: string) {
    startTransition(async () => {
      const result = await getTimeEntryAttachmentUrl({ id });
      if (result.ok) window.open(result.data.url, "_blank", "noopener");
      else notify("warning", result.message);
    });
  }

  const columns: DataTableColumn<OperationDetailRow>[] = [
    {
      key: "date",
      header: "Data",
      cell: (r) => (
        <span className="whitespace-nowrap tabular-nums text-strong">
          {formatDay(r.date)}
        </span>
      ),
    },
    {
      key: "consultant",
      header: "Consultor",
      cell: (r) => (
        <span className="font-medium text-strong">{r.consultantName}</span>
      ),
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
      cell: (r) => (
        <span className="inline-flex items-center gap-1.5 text-medium">
          {r.isException ? (
            <AlertTriangle
              size={13}
              className="text-warning"
              aria-label="Exceção (fora do Dia Útil ou com anexo)"
            />
          ) : null}
          {activityLabelOf(r.activityType)}
          {r.hasAttachment ? (
            <button
              type="button"
              className="inline-flex items-center gap-1 text-accent underline disabled:opacity-50"
              disabled={isPending}
              onClick={() => viewAttachment(r.id)}
              title="Ver anexo do lançamento"
            >
              <Paperclip size={12} />
            </button>
          ) : null}
        </span>
      ),
    },
    {
      key: "hours",
      header: "Horas",
      align: "right",
      cell: (r) => <span className="tabular-nums">{formatHours(r.hours)}</span>,
    },
    {
      key: "billable",
      header: "Faturável",
      cell: (r) => (
        <span className="text-xs text-medium">{r.billable ? "Sim" : "Não"}</span>
      ),
      className: "hidden sm:table-cell",
    },
    {
      key: "status",
      header: "Status",
      cell: (r) => (
        <StatusBadge tone={entryStatusTone[r.status as TimeEntryStatus] ?? "neutral"}>
          {statusLabel(r.status)}
        </StatusBadge>
      ),
    },
    {
      key: "decidedAt",
      header: "Decidido em",
      cell: (r) => (
        <span className="whitespace-nowrap text-xs text-soft">
          {formatDecided(r.decidedAt)}
        </span>
      ),
      className: "hidden md:table-cell",
    },
  ];

  return (
    <div className="space-y-3">
      <FeedbackBanner message={feedback} />

      <SectionPanel
        title="Detalhamento por consultor"
        description="Lançamentos do período filtrado, por consultor."
        action={exportHref ? <ExportExcelButton href={exportHref} /> : null}
      >
        <div className="flex flex-wrap gap-3 px-4 pb-3 text-xs text-soft">
          <span>
            <span className="font-semibold text-strong">
              {detail.pagination.total}
            </span>{" "}
            lançamentos
          </span>
          <span>
            <span className="font-semibold text-strong">
              {formatHours(detail.totalHours)}
            </span>{" "}
            horas
          </span>
          {detail.totalExceptions > 0 ? (
            <span className="inline-flex items-center gap-1 text-warning">
              <AlertTriangle size={12} />
              <span className="font-semibold">{detail.totalExceptions}</span>{" "}
              exceções
            </span>
          ) : null}
        </div>
        <DataTable
          columns={columns}
          rows={detail.rows}
          rowKey={(r) => r.id}
          caption="Detalhamento de lançamentos por consultor"
          empty={
            <p className="text-center text-sm text-soft">
              Nenhum lançamento para os filtros aplicados.
            </p>
          }
        />
        <ReportPagination
          pagination={detail.pagination}
          prevHref={prevHref}
          nextHref={nextHref}
        />
      </SectionPanel>
    </div>
  );
}
