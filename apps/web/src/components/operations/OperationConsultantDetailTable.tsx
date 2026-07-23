"use client";

import { AlertTriangle, Paperclip } from "lucide-react";
import { useTransition } from "react";
import { ExportExcelButton } from "@/components/ui/ExportExcelButton";
import { DataTable, type DataTableColumn } from "@/components/ui/DataTable";
import { FeedbackBanner, useFeedback } from "@/components/ui/Feedback";
import { SectionPanel } from "@/components/ui/SectionPanel";
import { StatusBadge, type StatusTone } from "@/components/ui/StatusBadge";
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
  monthLabel: string;
  /** Currently selected consultant id (from ?consultant=), for the filter. */
  selectedConsultantId?: string;
  /** Month/year query params, preserved when the filter navigates via GET. */
  month: number;
  year: number;
  /** `.xlsx` export href reflecting the current consultant filter. */
  exportHref?: string;
}

/**
 * "Detalhamento por consultor" tab of the Fechamento Operacional: a flat table
 * of every launch in the month across all projects, with the columns the DP
 * asked for (Data, Consultor, Cliente/Projeto, Atividade, Horas, Faturável,
 * Status, Decidido em). The consultant filter drives a GET navigation (server
 * re-reads), preserving the month and the active tab. Exception launches (fora
 * do Dia Útil ou com anexo) are highlighted to match the apuração.
 */
export function OperationConsultantDetailTable({
  detail,
  monthLabel,
  selectedConsultantId,
  month,
  year,
  exportHref,
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
      cell: (r) => (
        <span className="tabular-nums">{formatHours(r.hours)}</span>
      ),
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
        <StatusBadge
          tone={entryStatusTone[r.status as TimeEntryStatus] ?? "neutral"}
        >
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
        description={`Todos os lançamentos do mês, por consultor — ${monthLabel}`}
        action={
          <div className="flex flex-wrap items-center gap-2">
            {/* GET form: server re-reads narrowed to the consultant, keeping the
                month and this tab active on reload. */}
            <form className="flex items-center gap-2">
              <input type="hidden" name="m" value={month} />
              <input type="hidden" name="y" value={year} />
              <input type="hidden" name="tab" value="detalhamento" />
              <label className="sr-only" htmlFor="op-detail-consultant">
                Consultor
              </label>
              <select
                id="op-detail-consultant"
                name="consultant"
                defaultValue={selectedConsultantId ?? ""}
                className="h-9 rounded-md border border-border bg-surface px-2.5 text-xs font-semibold text-medium"
              >
                <option value="">Todos os consultores</option>
                {detail.consultantOptions.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
              <button
                type="submit"
                className="h-9 rounded-md border border-border bg-surface px-3 text-xs font-semibold text-strong shadow-[2px_2px_0_0_var(--color-ink)]"
              >
                Filtrar
              </button>
            </form>
            {exportHref ? <ExportExcelButton href={exportHref} /> : null}
          </div>
        }
      >
        <div className="flex flex-wrap gap-3 px-4 pb-3 text-xs text-soft">
          <span>
            <span className="font-semibold text-strong">
              {detail.rows.length}
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
              {selectedConsultantId
                ? "Nenhum lançamento deste consultor no mês."
                : "Nenhum lançamento neste mês."}
            </p>
          }
        />
      </SectionPanel>
    </div>
  );
}
