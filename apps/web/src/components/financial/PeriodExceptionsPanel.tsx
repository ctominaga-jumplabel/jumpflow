"use client";

import { useTransition } from "react";
import { AlertTriangle } from "lucide-react";
import { DataTable, type DataTableColumn } from "@/components/ui/DataTable";
import { FeedbackBanner, useFeedback } from "@/components/ui/Feedback";
import { SectionPanel } from "@/components/ui/SectionPanel";
import { StatusBadge, type StatusTone } from "@/components/ui/StatusBadge";
import { formatHours } from "@/lib/format";
import { getOnCallApprovalUrl } from "@/app/app/sobreaviso/actions";
import type {
  PeriodExceptions,
  PeriodOnCallException,
  PeriodOvertimeException,
} from "@/lib/db/period-exceptions";

const onCallTone: Record<PeriodOnCallException["status"], StatusTone> = {
  PENDING: "warning",
  APPROVED: "success",
  REJECTED: "danger",
};
const onCallLabel: Record<PeriodOnCallException["status"], string> = {
  PENDING: "Pendente",
  APPROVED: "Aprovado",
  REJECTED: "Rejeitado",
};
const contractLabel: Record<string, string> = {
  CLT: "CLT",
  CLT_FLEX: "CLT FLEX",
  PJ: "PJ",
};

export function PeriodExceptionsPanel({
  exceptions,
  monthLabel,
}: {
  exceptions: PeriodExceptions;
  monthLabel: string;
}) {
  const { feedback, notify } = useFeedback();
  const [isPending, startTransition] = useTransition();

  const total = exceptions.onCall.length + exceptions.overtime.length;

  function viewAttachment(id: string) {
    startTransition(async () => {
      const r = await getOnCallApprovalUrl({ id });
      if (r.ok) window.open(r.data.url, "_blank", "noopener");
      else notify("warning", r.message);
    });
  }

  const onCallColumns: DataTableColumn<PeriodOnCallException>[] = [
    { key: "date", header: "Data", cell: (r) => <span className="text-sm tabular-nums">{r.date}</span> },
    {
      key: "consultant",
      header: "Consultor / Projeto",
      cell: (r) => (
        <div>
          <p className="font-medium text-strong">{r.consultantName}</p>
          <p className="text-xs text-soft">{r.projectName ?? "—"}</p>
        </div>
      ),
    },
    { key: "hours", header: "Horas", align: "right", cell: (r) => <span className="text-sm tabular-nums">{formatHours(r.hours)}</span> },
    {
      key: "eff",
      header: "Equivalente",
      align: "right",
      cell: (r) => <span className="text-sm font-semibold tabular-nums">{formatHours(r.effectiveHours)}</span>,
      className: "hidden sm:table-cell",
    },
    { key: "status", header: "Status", cell: (r) => <StatusBadge tone={onCallTone[r.status]}>{onCallLabel[r.status]}</StatusBadge> },
    {
      key: "ok",
      header: "Ok responsável",
      cell: (r) =>
        r.hasAttachment ? (
          <button className="text-sm text-accent underline" disabled={isPending} onClick={() => viewAttachment(r.id)}>
            Ver anexo
          </button>
        ) : (
          <span className="text-xs text-soft">Sem anexo</span>
        ),
    },
  ];

  const overtimeColumns: DataTableColumn<PeriodOvertimeException>[] = [
    { key: "date", header: "Data", cell: (r) => <span className="text-sm tabular-nums">{r.date}</span> },
    { key: "consultant", header: "Consultor", cell: (r) => <span className="font-medium text-strong">{r.consultantName}</span> },
    {
      key: "contract",
      header: "Vínculo",
      cell: (r) => <span className="text-sm text-medium">{r.contractType ? contractLabel[r.contractType] : "—"}</span>,
    },
    { key: "hours", header: "Horas extras", align: "right", cell: (r) => <span className="text-sm font-semibold tabular-nums">{formatHours(r.hours)}</span> },
    {
      key: "note",
      header: "Observação",
      cell: (r) => <span className="text-sm text-soft">{r.note ?? "—"}</span>,
      className: "hidden md:table-cell",
    },
  ];

  return (
    <SectionPanel
      title="Exceções do período"
      description={`Sobreaviso e hora extra — ${monthLabel}. Confira antes da liberação.`}
      action={
        total > 0 ? (
          <span className="inline-flex items-center gap-1.5 rounded-md bg-warning-soft px-2.5 py-1 text-xs font-semibold text-warning">
            <AlertTriangle size={14} /> {total} exceção(ões)
          </span>
        ) : undefined
      }
    >
      <FeedbackBanner message={feedback} />
      {total === 0 ? (
        <p className="text-sm text-soft">Nenhuma exceção (sobreaviso ou hora extra) no período.</p>
      ) : (
        <div className="space-y-5">
          {exceptions.onCall.length > 0 ? (
            <div className="space-y-2">
              <h3 className="text-sm font-semibold text-strong">Sobreaviso</h3>
              <DataTable columns={onCallColumns} rows={exceptions.onCall} rowKey={(r) => r.id} caption="Sobreaviso do período" />
            </div>
          ) : null}
          {exceptions.overtime.length > 0 ? (
            <div className="space-y-2">
              <h3 className="text-sm font-semibold text-strong">Hora extra</h3>
              <DataTable columns={overtimeColumns} rows={exceptions.overtime} rowKey={(r) => r.id} caption="Hora extra do período" />
            </div>
          ) : null}
        </div>
      )}
    </SectionPanel>
  );
}
