"use client";

import { useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { ChevronRight, Lock, RotateCcw, Users } from "lucide-react";
import { ActionButton } from "@/components/ui/ActionButton";
import { ExportExcelButton } from "@/components/ui/ExportExcelButton";
import { DataTable, type DataTableColumn } from "@/components/ui/DataTable";
import { FeedbackBanner, useFeedback } from "@/components/ui/Feedback";
import { Modal } from "@/components/ui/Modal";
import { SectionPanel } from "@/components/ui/SectionPanel";
import { StatusBadge, type StatusTone } from "@/components/ui/StatusBadge";
import { formatHours } from "@/lib/format";
import { cn } from "@/lib/utils";
import { focusRingInput } from "@/lib/styles";
import {
  consultantReadinessLabels,
  pendingAlert,
  type ConsultantReadiness,
  type ConsultantReadinessState,
  type OperationClosingOverview,
  type OperationClosingRow,
} from "@/lib/operations/closing";
import {
  closeOperation,
  reopenOperation,
} from "@/app/app/operacao/fechamento/actions";

const readinessTone: Record<ConsultantReadinessState, StatusTone> = {
  APPROVED: "success",
  PENDING_REVIEW: "warning",
  DRAFT: "neutral",
  REJECTED: "danger",
  NO_ENTRIES: "warning",
};

type Filter = "PENDING" | "CLOSED" | "ALL";

export interface OperationClosingTableProps {
  overview: OperationClosingOverview;
  canManage: boolean;
  monthLabel: string;
  /** `.xlsx` export href for the month (Onda 6). Absent in demo/no-database. */
  exportHref?: string;
}

function formatDate(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("pt-BR");
}

/**
 * Deep-link from a PENDING_REVIEW consultant to the approvals queue, pre-filtered
 * on that consultant + project + client and status=PENDING. `kind=HOURS` opens
 * the queue focused on hours (the operational closing is about hours, not
 * expenses). The names must match the queue values exactly (it filters by
 * clientName/projectName/consultantName) and are percent-encoded by
 * URLSearchParams. No date window is sent on purpose: the queue's date filter
 * compares the SUBMITTED date, which may fall outside the work month and could
 * hide the very item we want to surface — consultant + project + PENDING already
 * pinpoints it.
 */
function approvalDeepLink(
  row: OperationClosingRow,
  consultant: ConsultantReadiness,
): string {
  const params = new URLSearchParams({
    kind: "HOURS",
    status: "PENDING",
    client: row.clientName,
    project: row.projectName,
    consultant: consultant.consultantName,
  });
  return `/app/aprovacoes?${params.toString()}`;
}

/**
 * Monthly operational closing for the DP. Lists every relevant project with its
 * readiness; closing is blocked until all allocated consultants are approved.
 * The default "Pendentes" filter is the follow-up list for Operação + DP.
 */
export function OperationClosingTable({
  overview,
  canManage,
  monthLabel,
  exportHref,
}: OperationClosingTableProps) {
  const [isPending, startTransition] = useTransition();
  const { feedback, notify } = useFeedback();
  const [filter, setFilter] = useState<Filter>("PENDING");
  const [detail, setDetail] = useState<OperationClosingRow | null>(null);
  // P16: reabrir um fechamento operacional é mudança sensível — exige
  // justificativa capturada num diálogo (nunca window.confirm).
  const [reopenDialog, setReopenDialog] = useState<OperationClosingRow | null>(
    null,
  );
  const [reopenReason, setReopenReason] = useState("");
  const [reopenError, setReopenError] = useState<string | null>(null);

  const rows = useMemo(() => {
    if (filter === "PENDING") {
      return overview.rows.filter((r) => r.status !== "CLOSED");
    }
    if (filter === "CLOSED") {
      return overview.rows.filter((r) => r.status === "CLOSED");
    }
    return overview.rows;
  }, [overview.rows, filter]);

  function handleClose(row: OperationClosingRow) {
    startTransition(async () => {
      const result = await closeOperation({
        projectId: row.projectId,
        month: overview.month,
        year: overview.year,
      });
      if (result.ok) notify("success", "Operação fechada. DP notificado.");
      else notify("warning", result.message);
    });
  }

  function openReopenDialog(row: OperationClosingRow) {
    setReopenReason("");
    setReopenError(null);
    setReopenDialog(row);
  }

  function dismissReopenDialog() {
    setReopenDialog(null);
    setReopenReason("");
    setReopenError(null);
  }

  function handleConfirmReopen() {
    if (!reopenDialog) return;
    const text = reopenReason.trim();
    if (!text) {
      setReopenError(
        "Informe uma justificativa para reabrir o fechamento operacional.",
      );
      return;
    }
    const row = reopenDialog;
    startTransition(async () => {
      const result = await reopenOperation({
        projectId: row.projectId,
        month: overview.month,
        year: overview.year,
        justification: text,
      });
      if (result.ok) {
        notify("success", "Fechamento reaberto.");
        dismissReopenDialog();
      } else {
        setReopenError(result.message);
      }
    });
  }

  const columns: DataTableColumn<OperationClosingRow>[] = [
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
      key: "team",
      header: "Equipe",
      cell: (r) => (
        <button
          type="button"
          onClick={() => setDetail(r)}
          className="inline-flex items-center gap-1.5 text-sm text-medium underline-offset-2 hover:underline"
        >
          <Users aria-hidden="true" className="size-4 text-soft" />
          {r.readiness.readyConsultants}/{r.readiness.totalConsultants}
        </button>
      ),
    },
    {
      key: "hours",
      header: "Horas",
      align: "right",
      cell: (r) => (
        <span className="text-sm tabular-nums">
          {formatHours(r.readiness.totalHours)}
        </span>
      ),
      className: "hidden sm:table-cell",
    },
    {
      key: "readiness",
      header: "Prontidão",
      cell: (r) =>
        r.status === "CLOSED" ? (
          <span className="text-xs text-soft">—</span>
        ) : r.readiness.canClose ? (
          <StatusBadge tone="success">Pronto para fechar</StatusBadge>
        ) : (
          <StatusBadge tone="warning">{pendingAlert(r.readiness)}</StatusBadge>
        ),
    },
    {
      key: "status",
      header: "Fechamento",
      cell: (r) =>
        r.status === "CLOSED" ? (
          <div className="space-y-0.5">
            <StatusBadge tone="success">Fechado</StatusBadge>
            <p className="text-xs text-soft">
              {formatDate(r.closedAt)}
              {r.closedByName ? ` · ${r.closedByName}` : ""}
            </p>
          </div>
        ) : (
          <StatusBadge tone="neutral">Pendente</StatusBadge>
        ),
    },
    {
      key: "actions",
      header: "Ações",
      cell: (r) => {
        if (!canManage) return <span className="text-xs text-soft">—</span>;
        if (r.status === "CLOSED") {
          return (
            <ActionButton
              size="sm"
              variant="secondary"
              icon={RotateCcw}
              disabled={isPending}
              onClick={() => openReopenDialog(r)}
            >
              Reabrir
            </ActionButton>
          );
        }
        const blocked = !r.readiness.canClose;
        return (
          <ActionButton
            size="sm"
            variant="primary"
            icon={Lock}
            disabled={isPending || blocked}
            title={blocked ? `Bloqueado: ${pendingAlert(r.readiness)}` : undefined}
            onClick={() => handleClose(r)}
          >
            Fechar (DP)
          </ActionButton>
        );
      },
    },
  ];

  const filters: Array<{ key: Filter; label: string; count: number }> = [
    { key: "PENDING", label: "Pendentes", count: overview.pendingCount },
    { key: "CLOSED", label: "Fechados", count: overview.closedCount },
    { key: "ALL", label: "Todos", count: overview.rows.length },
  ];

  return (
    <div className="space-y-3">
      <FeedbackBanner message={feedback} />

      <div className="grid gap-3 sm:grid-cols-3">
        <SummaryCard
          label="Pendentes de fechamento"
          value={overview.pendingCount}
          tone="warning"
        />
        <SummaryCard
          label="Prontos para fechar"
          value={overview.readyToCloseCount}
          tone="info"
        />
        <SummaryCard
          label="Fechados"
          value={overview.closedCount}
          tone="success"
        />
      </div>

      <SectionPanel
        title="Fechamento operacional"
        description={`Horas do mês por projeto para o DP — ${monthLabel}`}
        action={
          <div className="flex flex-wrap items-center gap-1.5">
            {filters.map((f) => (
              <button
                key={f.key}
                type="button"
                onClick={() => setFilter(f.key)}
                className={
                  filter === f.key
                    ? "rounded-md border-2 border-ink bg-brand px-2.5 py-1 text-xs font-semibold text-white"
                    : "rounded-md border border-border bg-surface px-2.5 py-1 text-xs font-semibold text-medium hover:bg-surface-muted/60"
                }
              >
                {f.label} ({f.count})
              </button>
            ))}
            {exportHref ? <ExportExcelButton href={exportHref} /> : null}
          </div>
        }
      >
        <DataTable
          columns={columns}
          rows={rows}
          rowKey={(r) => r.projectId}
          caption="Fechamento operacional por projeto"
          empty={
            <p className="text-center text-sm text-soft">
              {filter === "PENDING"
                ? "Nenhum projeto pendente de fechamento neste mês."
                : filter === "CLOSED"
                  ? "Nenhum projeto fechado neste mês."
                  : "Nenhum projeto para exibir neste mês."}
            </p>
          }
        />
      </SectionPanel>

      <Modal
        open={detail != null}
        onClose={() => setDetail(null)}
        title={detail ? `Equipe — ${detail.projectName}` : "Equipe"}
        description="Estado das horas de cada consultor alocado no mês."
        className="max-w-lg"
      >
        {detail ? (
          detail.readiness.consultants.length === 0 ? (
            <p className="text-sm text-soft">
              Nenhum consultor alocado ou com lançamento neste mês.
            </p>
          ) : (
            <ul className="divide-y divide-border">
              {detail.readiness.consultants.map((c) => {
                const meta = (
                  <>
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium text-strong">
                        {c.consultantName}
                      </p>
                      <p className="text-xs text-soft">{formatHours(c.hours)}</p>
                    </div>
                    <StatusBadge tone={readinessTone[c.state]}>
                      {consultantReadinessLabels[c.state]}
                    </StatusBadge>
                  </>
                );

                // Only "Aguardando aprovação" is actionable: it links straight
                // to the approvals queue pre-filtered on this consultant +
                // project, ready to Approve/Reject the month's hours.
                if (c.state === "PENDING_REVIEW") {
                  return (
                    <li key={c.consultantId}>
                      <Link
                        href={approvalDeepLink(detail, c)}
                        onClick={() => setDetail(null)}
                        className="group flex items-center justify-between gap-3 rounded-md py-2 transition-colors hover:bg-surface-muted/60"
                        title="Abrir nas Aprovações para aprovar ou reprovar as horas"
                      >
                        {meta}
                        <ChevronRight
                          aria-hidden="true"
                          className="size-4 shrink-0 text-soft transition-transform group-hover:translate-x-0.5"
                        />
                      </Link>
                    </li>
                  );
                }

                return (
                  <li
                    key={c.consultantId}
                    className="flex items-center justify-between gap-3 py-2"
                  >
                    {meta}
                  </li>
                );
              })}
            </ul>
          )
        ) : null}
      </Modal>

      <Modal
        open={reopenDialog != null}
        onClose={dismissReopenDialog}
        title="Reabrir fechamento operacional"
        description="Reabre um mês já fechado para o DP (ex.: correção tardia). A justificativa fica registrada na trilha de auditoria."
        footer={
          <>
            <ActionButton
              size="sm"
              variant="secondary"
              disabled={isPending}
              onClick={dismissReopenDialog}
            >
              Cancelar
            </ActionButton>
            <ActionButton
              size="sm"
              variant="primary"
              icon={RotateCcw}
              disabled={isPending}
              onClick={handleConfirmReopen}
            >
              Reabrir
            </ActionButton>
          </>
        }
      >
        <label
          htmlFor="reopen-justification"
          className="mb-1 block text-xs font-semibold text-medium"
        >
          Justificativa <span className="font-normal text-soft">(obrigatoria)</span>
        </label>
        <textarea
          id="reopen-justification"
          value={reopenReason}
          onChange={(e) => {
            setReopenReason(e.target.value);
            if (reopenError && e.target.value.trim().length > 0) {
              setReopenError(null);
            }
          }}
          rows={4}
          aria-invalid={reopenError != null}
          placeholder="Ex.: Consultor lançou horas fora do prazo; reabrindo para revalidar."
          className={cn(
            "w-full resize-y rounded-md border border-border bg-surface px-3 py-2 text-sm text-strong placeholder:text-soft",
            focusRingInput,
            reopenError && "border-danger",
          )}
        />
        {reopenError ? (
          <p className="mt-1 text-xs font-medium text-danger">{reopenError}</p>
        ) : null}
      </Modal>
    </div>
  );
}

function SummaryCard({
  label,
  value,
  tone,
}: {
  label: string;
  value: number;
  tone: StatusTone;
}) {
  const accent: Record<StatusTone, string> = {
    neutral: "text-strong",
    info: "text-brand-dark",
    success: "text-success",
    warning: "text-warning",
    danger: "text-danger",
  };
  return (
    <div className="rounded-lg border border-border bg-surface px-4 py-3">
      <p className="text-xs font-medium uppercase tracking-wide text-soft">
        {label}
      </p>
      <p className={`mt-1 text-2xl font-semibold tabular-nums ${accent[tone]}`}>
        {value}
      </p>
    </div>
  );
}
