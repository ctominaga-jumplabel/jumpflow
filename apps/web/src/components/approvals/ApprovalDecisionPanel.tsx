"use client";

import { useRef, useState } from "react";
import { Check, FileText, Paperclip, X } from "lucide-react";
import { ActionButton } from "@/components/ui/ActionButton";
import { Modal } from "@/components/ui/Modal";
import { SectionPanel } from "@/components/ui/SectionPanel";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { focusRing, focusRingInput } from "@/lib/styles";
import { cn } from "@/lib/utils";
import { formatCurrency, formatHours } from "@/lib/format";
import {
  approvalKindLabels,
  approvalStageLabels,
  type ApprovalHoursEntry,
  type ApprovalItem,
} from "@/lib/mock-data/approvals";
import { ApprovalStatusBadge } from "./ApprovalStatusBadge";

/**
 * Pré-checagem client-side do anexo de justificativa (o SERVIDOR é a autoridade):
 * mesma whitelist e teto de 10 MB de Despesas/Horas.
 */
const ATTACH_ACCEPT = ".pdf,.jpg,.jpeg,.png,.webp";
const ATTACH_ACCEPTED_TYPES = [
  "application/pdf",
  "image/jpeg",
  "image/png",
  "image/webp",
];
const ATTACH_ACCEPTED_EXTENSIONS = [".pdf", ".jpg", ".jpeg", ".png", ".webp"];
const ATTACH_MAX_SIZE_BYTES = 10 * 1024 * 1024; // 10 MB

function isAcceptedAttachment(file: File): boolean {
  if (file.type) return ATTACH_ACCEPTED_TYPES.includes(file.type);
  const dot = file.name.lastIndexOf(".");
  const ext = dot >= 0 ? file.name.slice(dot).toLowerCase() : "";
  return ATTACH_ACCEPTED_EXTENSIONS.includes(ext);
}

/** Rótulo curto de data (dd/mm) a partir de um ISO yyyy-mm-dd. */
function shortDate(iso: string): string {
  return `${iso.slice(8, 10)}/${iso.slice(5, 7)}`;
}

export interface ApprovalDecisionPanelProps {
  item: ApprovalItem | null;
  /** Approve the selected item (optional comment). */
  onApprove: (id: string, comment: string) => void;
  /** Reject the selected item — comment is required (enforced here too). */
  onReject: (id: string, comment: string) => void;
  /** Disable actions while a server decision is in flight. */
  busy?: boolean;
  /**
   * Whether the current user (gestão) may flag "Faturável" per day. Server is
   * the authority (setEntryBillable); this only shows/hides the control.
   */
  canEditBillable?: boolean;
  /** Object storage está configurado, então o anexo opcional pode ser oferecido. */
  attachmentsAvailable?: boolean;
  /**
   * Define o `billable` de UM lançamento (por dia). `reason` é obrigatório ao
   * marcar NÃO faturável (o modal reforça, e o servidor também). `file` é o anexo
   * opcional da justificativa (quando storage disponível).
   */
  onSetBillable?: (
    entryId: string,
    billable: boolean,
    reason: string,
    file?: File,
  ) => void;
}

/**
 * Decision panel for a selected approval. Enforces the business rule that a
 * rejection requires a justification: the "Reprovar" button stays clickable,
 * but clicking it without a comment shows an inline validation message instead
 * of deciding (the server enforces the same rule for db-backed items).
 *
 * The handlers live in ApprovalQueue: db-backed items go through the
 * decideHours server action (Approval + AuditEvent in one transaction); mock
 * items mutate local state with honest "(local)" feedback.
 */
export function ApprovalDecisionPanel({
  item,
  onApprove,
  onReject,
  busy = false,
  canEditBillable = false,
  attachmentsAvailable = false,
  onSetBillable,
}: ApprovalDecisionPanelProps) {
  const [comment, setComment] = useState("");
  // Inline validation: the "Reprovar" button is always clickable, but a
  // rejection without a justification surfaces this message instead of silently
  // doing nothing (the server enforces the same rule for db-backed items).
  const [rejectError, setRejectError] = useState(false);

  // Modal de justificativa ao marcar um DIA como NÃO faturável (padrão P9:
  // motivo obrigatório + anexo opcional quando há storage). Guarda o dia alvo.
  const [nonBillableEntry, setNonBillableEntry] =
    useState<ApprovalHoursEntry | null>(null);
  const [reason, setReason] = useState("");
  const [reasonError, setReasonError] = useState(false);
  const [justificationFile, setJustificationFile] = useState<File | null>(null);
  const [justificationAttachError, setJustificationAttachError] = useState<
    string | null
  >(null);
  const justificationInputRef = useRef<HTMLInputElement>(null);

  // Reset the comment whenever the selected item changes (render-time state
  // adjustment — the React-recommended alternative to an effect).
  const [prevId, setPrevId] = useState<string | null>(item?.id ?? null);
  const currentId = item?.id ?? null;
  if (currentId !== prevId) {
    setPrevId(currentId);
    setComment("");
    setRejectError(false);
    setNonBillableEntry(null);
    setReason("");
    setReasonError(false);
    setJustificationFile(null);
    setJustificationAttachError(null);
  }

  if (!item) {
    return (
      <SectionPanel title="Decisão" description="Selecione um lançamento na fila.">
        <p className="px-5 py-8 text-sm text-soft">
          Escolha um item pendente para revisar e decidir.
        </p>
      </SectionPanel>
    );
  }

  const canReject = comment.trim().length > 0;
  const isExpense = item.type === "EXPENSE";
  // Marcação de "Faturável" por dia: só para HOURS reais (db), com gestão e o
  // handler disponível. Cada lançamento (dia) tem seu próprio toggle.
  const billableEntries =
    !isExpense &&
    item.source === "db" &&
    canEditBillable &&
    onSetBillable &&
    item.entries &&
    item.entries.length > 0
      ? item.entries
      : null;

  function handleReject() {
    if (!canReject) {
      setRejectError(true);
      return;
    }
    setRejectError(false);
    onReject(item!.id, comment.trim());
  }

  /** Toggle de "Faturável" de um dia. Marcar NÃO faturável abre o modal de motivo. */
  function toggleEntryBillable(entry: ApprovalHoursEntry, nextBillable: boolean) {
    if (!onSetBillable) return;
    if (nextBillable) {
      // Voltar a faturável: sem justificativa (limpa motivo no servidor).
      onSetBillable(entry.id, true, "");
      return;
    }
    // Marcar NÃO faturável: exige justificativa → abre o modal.
    setNonBillableEntry(entry);
    setReason(entry.nonBillableReason ?? "");
    setReasonError(false);
    setJustificationFile(null);
    setJustificationAttachError(null);
  }

  /** Pré-checagem do arquivo de justificativa (mesma whitelist/teto do anexo). */
  function handleJustificationFiles(files: FileList | null) {
    const file = files?.[0];
    if (!file) return;
    if (!isAcceptedAttachment(file)) {
      setJustificationAttachError("Formato não aceito. Use PDF, JPG, PNG ou WEBP.");
      return;
    }
    if (file.size > ATTACH_MAX_SIZE_BYTES) {
      setJustificationAttachError("Arquivo acima de 10 MB.");
      return;
    }
    setJustificationAttachError(null);
    setJustificationFile(file);
  }

  /** Confirma o motivo (obrigatório) e dispara a mudança para NÃO faturável. */
  function confirmNonBillable() {
    if (!nonBillableEntry || !onSetBillable) return;
    if (reason.trim().length === 0) {
      setReasonError(true);
      return;
    }
    onSetBillable(
      nonBillableEntry.id,
      false,
      reason.trim(),
      justificationFile ?? undefined,
    );
    setNonBillableEntry(null);
    setReason("");
    setReasonError(false);
    setJustificationFile(null);
    setJustificationAttachError(null);
  }

  function cancelNonBillable() {
    setNonBillableEntry(null);
    setReason("");
    setReasonError(false);
    setJustificationFile(null);
    setJustificationAttachError(null);
  }

  return (
    <SectionPanel
      id="aprovacoes-acoes"
      title="Decisão"
      description={`${item.consultantName} · ${item.period}`}
      action={<ApprovalStatusBadge status={item.status} />}
    >
      <div className="space-y-4 px-5 py-4">
        <div className="flex flex-wrap items-center gap-2">
          <StatusBadge tone={isExpense ? "warning" : "info"}>
            {approvalKindLabels[item.type]}
          </StatusBadge>
          {isExpense && item.stage ? (
            <StatusBadge tone="neutral">
              Etapa: {approvalStageLabels[item.stage]}
            </StatusBadge>
          ) : null}
        </div>
        <dl className="grid grid-cols-2 gap-3 text-sm">
          <div>
            <dt className="text-xs text-soft">Projeto</dt>
            <dd className="font-medium text-strong">
              {item.projectName} · {item.clientName}
            </dd>
          </div>
          <div>
            <dt className="text-xs text-soft">
              {isExpense ? "Valor" : "Horas"}
            </dt>
            <dd className="font-medium tabular-nums text-strong">
              {isExpense
                ? formatCurrency(item.amount ?? 0)
                : formatHours(item.hours)}
            </dd>
          </div>
          <div className="col-span-2">
            <dt className="text-xs text-soft">
              {isExpense ? "Descrição" : "Atividade"}
            </dt>
            <dd className="text-medium">{item.activitySummary}</dd>
          </div>
          <div>
            <dt className="text-xs text-soft">Enviado em</dt>
            <dd className="font-medium text-strong">
              {new Date(item.submittedAt).toLocaleString("pt-BR", {
                dateStyle: "short",
                timeStyle: "short",
              })}
            </dd>
          </div>
          <div>
            <dt className="text-xs text-soft">Origem</dt>
            <dd className="font-medium text-strong">
              {item.source === "db" ? "Banco" : "Demo"}
            </dd>
          </div>
          {item.entryIds?.length ? (
            <div className="col-span-2">
              <dt className="text-xs text-soft">Lançamentos</dt>
              <dd className="break-all text-medium">
                {item.entryIds.length} item(ns) - {item.entryIds.join(", ")}
              </dd>
            </div>
          ) : null}
          {item.expenseId ? (
            <div className="col-span-2">
              <dt className="text-xs text-soft">Despesa</dt>
              <dd className="break-all text-medium">{item.expenseId}</dd>
            </div>
          ) : null}
          {item.comment ? (
            <div className="col-span-2">
              <dt className="text-xs text-soft">Justificativa anterior</dt>
              <dd className="text-medium">{item.comment}</dd>
            </div>
          ) : null}
        </dl>

        {billableEntries ? (
          <div className="rounded-md border border-border bg-surface-muted/30 p-3">
            <p className="mb-1 text-xs font-semibold text-medium">
              Faturável por dia
            </p>
            <p className="mb-2 text-xs text-soft">
              Definição de gestão: marque ou desmarque cada dia. Ao desmarcar,
              informe o motivo (fica na trilha de auditoria).
            </p>
            <ul className="divide-y divide-border">
              {billableEntries.map((entry) => (
                <li
                  key={entry.id}
                  className="flex items-center justify-between gap-3 py-2"
                >
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-strong">
                      {shortDate(entry.date)} ·{" "}
                      <span className="tabular-nums">
                        {formatHours(entry.hours)}
                      </span>
                    </p>
                    <p className="truncate text-xs text-soft">
                      {entry.activityLabel}
                    </p>
                    {!entry.billable && entry.nonBillableReason ? (
                      <p className="mt-0.5 truncate text-xs text-medium">
                        Motivo: {entry.nonBillableReason}
                      </p>
                    ) : null}
                  </div>
                  <label className="flex shrink-0 cursor-pointer items-center gap-2 text-xs font-medium text-medium">
                    <input
                      type="checkbox"
                      checked={entry.billable}
                      disabled={busy}
                      onChange={(e) =>
                        toggleEntryBillable(entry, e.target.checked)
                      }
                      className="size-4 rounded border-border text-brand focus:ring-brand"
                    />
                    {entry.billable ? "Faturável" : "Não faturável"}
                  </label>
                </li>
              ))}
            </ul>
          </div>
        ) : null}

        <div>
          <label
            htmlFor="approval-comment"
            className="mb-1 block text-xs font-semibold text-medium"
          >
            Comentário{" "}
            <span className="font-normal text-soft">
              (obrigatório para reprovar)
            </span>
          </label>
          <textarea
            id="approval-comment"
            value={comment}
            onChange={(e) => {
              setComment(e.target.value);
              if (rejectError && e.target.value.trim().length > 0) {
                setRejectError(false);
              }
            }}
            rows={3}
            aria-invalid={rejectError}
            placeholder="Descreva o motivo da reprovação ou uma observação na aprovação."
            className={cn(
              "w-full resize-y rounded-md border border-border bg-surface px-3 py-2 text-sm text-strong placeholder:text-soft",
              focusRingInput,
              rejectError && "border-danger",
            )}
          />
          {rejectError ? (
            <p className="mt-1 text-xs font-medium text-danger">
              Informe uma justificativa para reprovar.
            </p>
          ) : null}
        </div>

        <div className="flex flex-wrap gap-2">
          <ActionButton
            variant="success"
            size="sm"
            icon={Check}
            disabled={item.status !== "PENDING" || busy}
            onClick={() => onApprove(item.id, comment.trim())}
          >
            Aprovar
          </ActionButton>
          <ActionButton
            variant="danger"
            size="sm"
            icon={X}
            disabled={item.status !== "PENDING" || busy}
            onClick={handleReject}
          >
            Reprovar
          </ActionButton>
        </div>
      </div>

      {/* Justificativa obrigatória ao marcar um DIA como NÃO faturável (padrão
          P9): motivo obrigatório + anexo opcional quando há storage. */}
      <Modal
        open={Boolean(nonBillableEntry)}
        onClose={cancelNonBillable}
        title="Marcar dia como não faturável"
        description={
          nonBillableEntry
            ? `Informe o motivo pelo qual ${shortDate(nonBillableEntry.date)} não será faturado. O motivo fica registrado na trilha de auditoria.`
            : "Informe o motivo. O motivo fica registrado na trilha de auditoria."
        }
        footer={
          <>
            <ActionButton
              variant="secondary"
              size="sm"
              disabled={busy}
              onClick={cancelNonBillable}
            >
              Cancelar
            </ActionButton>
            <ActionButton
              variant="primary"
              size="sm"
              icon={Check}
              disabled={busy}
              onClick={confirmNonBillable}
            >
              Confirmar não faturável
            </ActionButton>
          </>
        }
      >
        <div className="space-y-3">
          <div>
            <label
              htmlFor="non-billable-reason"
              className="mb-1 block text-xs font-semibold text-medium"
            >
              Motivo <span className="font-normal text-soft">(obrigatório)</span>
            </label>
            <textarea
              id="non-billable-reason"
              value={reason}
              onChange={(e) => {
                setReason(e.target.value);
                if (e.target.value.trim().length > 0) setReasonError(false);
              }}
              rows={3}
              placeholder="Ex.: Retrabalho não cobrável; cortesia acordada com o cliente."
              aria-invalid={reasonError}
              className={cn(
                "w-full resize-y rounded-md border border-border bg-surface px-3 py-2 text-sm text-strong placeholder:text-soft",
                focusRingInput,
                reasonError && "border-danger",
              )}
            />
            {reasonError ? (
              <p className="mt-1 text-xs text-danger">O motivo é obrigatório.</p>
            ) : null}
          </div>

          {attachmentsAvailable ? (
            <div>
              <span className="mb-1 block text-xs font-semibold text-medium">
                Anexo{" "}
                <span className="font-normal text-soft">
                  (opcional · PDF, JPG, PNG ou WEBP, até 10 MB)
                </span>
              </span>
              {justificationFile ? (
                <div className="flex items-center gap-3 rounded-md border border-border bg-surface-muted/50 px-3 py-2">
                  <FileText
                    aria-hidden="true"
                    className="size-4 shrink-0 text-medium"
                  />
                  <p className="min-w-0 flex-1 truncate text-sm font-medium text-strong">
                    {justificationFile.name}
                  </p>
                  <button
                    type="button"
                    onClick={() => {
                      setJustificationFile(null);
                      setJustificationAttachError(null);
                      if (justificationInputRef.current) {
                        justificationInputRef.current.value = "";
                      }
                    }}
                    aria-label="Remover arquivo selecionado"
                    className={cn(
                      "grid size-7 shrink-0 place-items-center rounded-md text-medium transition-colors hover:bg-surface hover:text-strong",
                      focusRing,
                    )}
                  >
                    <X aria-hidden="true" className="size-4" />
                  </button>
                </div>
              ) : (
                <label
                  htmlFor="non-billable-attachment"
                  className={cn(
                    "flex cursor-pointer items-center gap-2 rounded-md border border-dashed border-border bg-surface px-3 py-2.5 text-sm text-medium transition-colors hover:border-brand hover:text-strong",
                    focusRing,
                  )}
                >
                  <Paperclip aria-hidden="true" className="size-4" />
                  Anexar comprovante
                </label>
              )}
              <input
                ref={justificationInputRef}
                id="non-billable-attachment"
                type="file"
                accept={ATTACH_ACCEPT}
                className="sr-only"
                onChange={(e) => handleJustificationFiles(e.target.files)}
              />
              {justificationAttachError ? (
                <p role="alert" className="mt-1 text-xs font-medium text-danger">
                  {justificationAttachError}
                </p>
              ) : null}
            </div>
          ) : (
            <p className="text-xs text-soft">
              Anexo indisponível (armazenamento não configurado): o motivo textual
              é registrado assim mesmo.
            </p>
          )}
        </div>
      </Modal>
    </SectionPanel>
  );
}
