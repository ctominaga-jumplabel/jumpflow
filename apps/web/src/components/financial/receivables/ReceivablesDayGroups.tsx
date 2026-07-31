"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Info, Paperclip, TriangleAlert } from "lucide-react";
import { cn } from "@/lib/utils";
import { CollapsibleGroup } from "@/components/ui/CollapsibleGroup";
import { EmptyState } from "@/components/ui/EmptyState";
import { Modal } from "@/components/ui/Modal";
import { ActionButton } from "@/components/ui/ActionButton";
import { FeedbackBanner, useFeedback } from "@/components/ui/Feedback";
import { focusRing, focusRingInput } from "@/lib/styles";
import { formatDate } from "@/lib/format";
import type { ReceivablesDayGroup, ReceivablesEntry } from "@/lib/financial/receivables-journey-core";
import { contractTypeLabels } from "@/lib/consultants/labels";
import {
  getTimeEntryAttachmentUrl,
  setEntryBillable,
} from "@/app/app/horas/actions";

/** Atividades que exigem anexo de aprovação do gestor (regra visual). */
const ATTACHMENT_REQUIRED = new Set(["ON_CALL"]);

/** Horas decimais efetivas → "HH:MM" (ex.: 2.5 → "02:30"). */
function toHHMM(hours: number): string {
  const totalMinutes = Math.max(0, Math.round(hours * 60));
  const h = Math.floor(totalMinutes / 60);
  const m = totalMinutes % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

/** Iniciais para o avatar do alocado (até duas letras). */
function initialsOf(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

/** Tom do chip de tipo de atividade (apenas os tipos existentes). */
function activityChipClass(activityType: string): string {
  switch (activityType) {
    case "ON_CALL":
      return "border-brand/30 bg-brand-soft text-brand-dark";
    case "WORKDAY":
      return "border-border bg-surface-muted text-medium";
    default:
      return "border-border bg-surface-muted text-medium";
  }
}

export interface ReceivablesDayGroupsProps {
  days: ReceivablesDayGroup[];
  /** FINANCIAL_ROLES; controla se a coluna Faturar? é editável (gate real é server). */
  canEditBillable: boolean;
}

/**
 * Lançamentos por dia (mockups 03/04): cada dia é um grupo colapsável com o
 * total de horas do dia e uma tabela de lançamentos. A única coluna editável é
 * "Faturar?", que reaproveita a action `setEntryBillable` (regra de justificativa
 * e auditoria vivem no servidor). Anexos abrem via `getTimeEntryAttachmentUrl`
 * (URL assinada). ON_CALL sem anexo é sinalizado visualmente (não bloqueia).
 */
export function ReceivablesDayGroups({
  days,
  canEditBillable,
}: ReceivablesDayGroupsProps) {
  const router = useRouter();
  const { feedback, notify } = useFeedback();
  const [isPending, startTransition] = useTransition();
  // Estado otimista do toggle por lançamento; limpo quando `days` recarrega.
  const [overrides, setOverrides] = useState<Record<string, boolean>>({});
  const [reasonFor, setReasonFor] = useState<ReceivablesEntry | null>(null);
  const [reason, setReason] = useState("");
  const [reasonError, setReasonError] = useState(false);

  // Ao recarregar os dados do servidor (router.refresh após uma troca), o array
  // `days` muda de identidade — descartamos os estados otimistas para exibir a
  // verdade do servidor.
  useEffect(() => {
    setOverrides({});
  }, [days]);

  function commit(entry: ReceivablesEntry, billable: boolean, motivo: string) {
    setOverrides((prev) => ({ ...prev, [entry.id]: billable }));
    startTransition(async () => {
      const result = await setEntryBillable({
        entryId: entry.id,
        billable,
        nonBillableReason: motivo || undefined,
      });
      if (!result.ok) {
        // Reverte o estado visual para a verdade atual (props).
        setOverrides((prev) => {
          const next = { ...prev };
          delete next[entry.id];
          return next;
        });
        if (result.error === "COMMENT_REQUIRED") {
          setReasonFor(entry);
          setReason("");
          notify("warning", "Informe o motivo para marcar como não faturável.");
          return;
        }
        notify("warning", result.message);
        return;
      }
      notify(
        billable ? "info" : "success",
        billable
          ? "Lançamento marcado como faturável."
          : "Lançamento marcado como não faturável.",
      );
      router.refresh();
    });
  }

  function requestToggle(entry: ReceivablesEntry, desired: boolean) {
    // Desmarcar um lançamento normal exige justificativa (o servidor reforça).
    if (!desired && !ATTACHMENT_REQUIRED.has(entry.activityType)) {
      setReasonFor(entry);
      setReason("");
      setReasonError(false);
      return;
    }
    commit(entry, desired, "");
  }

  function confirmReason() {
    if (!reasonFor) return;
    if (reason.trim().length === 0) {
      setReasonError(true);
      return;
    }
    const entry = reasonFor;
    setReasonFor(null);
    commit(entry, false, reason.trim());
  }

  function openAttachment(entry: ReceivablesEntry) {
    startTransition(async () => {
      const result = await getTimeEntryAttachmentUrl({ id: entry.id });
      if (!result.ok) {
        notify("warning", result.message);
        return;
      }
      window.open(result.data.url, "_blank", "noopener,noreferrer");
    });
  }

  if (days.length === 0) {
    return (
      <EmptyState
        icon={Info}
        title="Nenhum lançamento no recorte"
        description="Ajuste o período, o cliente ou os projetos e clique em Pesquisar."
      />
    );
  }

  return (
    <div className="space-y-4">
      <FeedbackBanner message={feedback} />

      {days.map((day) => (
        <CollapsibleGroup
          key={day.date}
          defaultOpen
          tone="soft"
          title={`Dia ${formatDate(day.date)}`}
          hint={`Total de horas do dia: ${toHHMM(day.totalHours)}`}
        >
          <div className="-mx-4 -my-4 overflow-x-auto">
            <table className="w-full min-w-[760px] text-sm">
              <thead>
                <tr className="border-b border-border text-left text-xs font-semibold text-medium">
                  <th className="px-4 py-2">Contratação</th>
                  <th className="px-4 py-2">Alocado</th>
                  <th className="px-4 py-2">Projeto</th>
                  <th className="px-4 py-2">Tipo de Atividade</th>
                  <th className="px-4 py-2">Horas</th>
                  <th className="px-4 py-2">Anexo</th>
                  <th className="px-4 py-2">Faturar?</th>
                </tr>
              </thead>
              <tbody>
                {day.entries.map((entry) => {
                  const checked = overrides[entry.id] ?? entry.billable;
                  const needsAttachment =
                    ATTACHMENT_REQUIRED.has(entry.activityType) &&
                    !entry.hasAttachment;
                  return (
                    <tr
                      key={entry.id}
                      className="border-b border-border/60 last:border-0"
                    >
                      <td className="px-4 py-2.5">
                        {entry.contractType ? (
                          <span className="inline-flex items-center rounded-full bg-surface-muted px-2.5 py-0.5 text-xs font-medium text-medium">
                            {contractTypeLabels[entry.contractType]}
                          </span>
                        ) : (
                          <span className="text-soft">—</span>
                        )}
                      </td>
                      <td className="px-4 py-2.5">
                        <span className="flex items-center gap-2">
                          <span className="grid size-8 shrink-0 place-items-center rounded-full bg-brand-soft/70 text-xs font-semibold text-brand-dark">
                            {initialsOf(entry.consultantName)}
                          </span>
                          <span className="truncate font-medium text-strong">
                            {entry.consultantName}
                          </span>
                        </span>
                      </td>
                      <td className="px-4 py-2.5 text-medium">
                        {entry.projectName}
                      </td>
                      <td className="px-4 py-2.5">
                        <span
                          className={cn(
                            "inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-medium",
                            activityChipClass(entry.activityType),
                          )}
                        >
                          {entry.activityLabel}
                        </span>
                      </td>
                      <td className="px-4 py-2.5 tabular-nums text-strong">
                        {toHHMM(entry.effectiveHours)}
                      </td>
                      <td className="px-4 py-2.5">
                        {entry.hasAttachment ? (
                          <button
                            type="button"
                            onClick={() => openAttachment(entry)}
                            disabled={isPending}
                            title={entry.attachmentFileName ?? "Abrir anexo"}
                            aria-label={`Abrir anexo de ${entry.consultantName}`}
                            className={cn(
                              "grid size-8 place-items-center rounded-md text-medium transition-colors hover:bg-surface-muted hover:text-strong disabled:opacity-50",
                              focusRing,
                            )}
                          >
                            <Paperclip aria-hidden="true" className="size-4" />
                          </button>
                        ) : needsAttachment ? (
                          <span
                            title="Sobreaviso exige anexo de aprovação do gestor."
                            className="inline-flex items-center gap-1 text-xs font-medium text-warning"
                          >
                            <TriangleAlert
                              aria-hidden="true"
                              className="size-4"
                            />
                            Pendente
                          </span>
                        ) : (
                          <span className="text-soft">—</span>
                        )}
                      </td>
                      <td className="px-4 py-2.5">
                        {canEditBillable ? (
                          <input
                            type="checkbox"
                            checked={checked}
                            disabled={isPending}
                            onChange={(e) =>
                              requestToggle(entry, e.target.checked)
                            }
                            aria-label={`Faturar lançamento de ${entry.consultantName}`}
                            className="size-5 cursor-pointer accent-brand disabled:cursor-not-allowed disabled:opacity-50"
                          />
                        ) : (
                          <span className="text-xs font-medium text-medium">
                            {checked ? "Sim" : "Não"}
                          </span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </CollapsibleGroup>
      ))}

      <p className="flex items-center gap-2 rounded-md border border-brand/30 bg-brand-soft px-3 py-2 text-sm font-medium text-brand-dark">
        <Info aria-hidden="true" className="size-4 shrink-0" />
        Sobreaviso exige anexo de aprovação do gestor.
      </p>

      <Modal
        open={reasonFor != null}
        onClose={() => setReasonFor(null)}
        title="Marcar como não faturável"
        description="Informe o motivo. Ele fica registrado na auditoria do lançamento."
        footer={
          <>
            <ActionButton
              variant="secondary"
              size="sm"
              onClick={() => setReasonFor(null)}
            >
              Cancelar
            </ActionButton>
            <ActionButton variant="primary" size="sm" onClick={confirmReason}>
              Confirmar
            </ActionButton>
          </>
        }
      >
        <label className="block text-sm font-medium text-medium">
          Motivo
          <textarea
            value={reason}
            onChange={(e) => {
              setReason(e.target.value);
              if (reasonError) setReasonError(false);
            }}
            rows={3}
            className={cn(
              "mt-1 w-full rounded-md border border-border bg-surface px-3 py-2 text-sm text-strong",
              focusRingInput,
            )}
            placeholder="Ex.: hora não prevista em contrato"
          />
        </label>
        {reasonError ? (
          <p className="mt-1 text-xs font-medium text-danger">
            O motivo é obrigatório.
          </p>
        ) : null}
      </Modal>
    </div>
  );
}
