"use client";

import { useState } from "react";
import { Check, X } from "lucide-react";
import { ActionButton } from "@/components/ui/ActionButton";
import { SectionPanel } from "@/components/ui/SectionPanel";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { focusRingInput } from "@/lib/styles";
import { cn } from "@/lib/utils";
import { formatCurrency, formatHours } from "@/lib/format";
import {
  approvalKindLabels,
  type ApprovalItem,
} from "@/lib/mock-data/approvals";
import { ApprovalStatusBadge } from "./ApprovalStatusBadge";

export interface ApprovalDecisionPanelProps {
  item: ApprovalItem | null;
  /** Approve the selected item (optional comment). Local/mock in the MVP. */
  onApprove: (id: string, comment: string) => void;
  /** Reject the selected item — comment is required (enforced here too). */
  onReject: (id: string, comment: string) => void;
}

/**
 * Decision panel for a selected approval. Enforces the business rule that a
 * rejection requires a justification (the "Reprovar" button stays disabled
 * until a comment is typed).
 *
 * MVP scope: approve/reject mutate LOCAL state (lifted into ApprovalQueue) and
 * report through feedback — they do not yet call a Server Action. The real flow
 * records an Approval + AuditEvent in a single transaction
 * (docs/aprovacao-automatica.md); the handler contract is ready for that swap.
 */
export function ApprovalDecisionPanel({
  item,
  onApprove,
  onReject,
}: ApprovalDecisionPanelProps) {
  const [comment, setComment] = useState("");

  // Reset the comment whenever the selected item changes (render-time state
  // adjustment — the React-recommended alternative to an effect).
  const [prevId, setPrevId] = useState<string | null>(item?.id ?? null);
  const currentId = item?.id ?? null;
  if (currentId !== prevId) {
    setPrevId(currentId);
    setComment("");
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

  return (
    <SectionPanel
      title="Decisão"
      description={`${item.consultantName} · ${item.period}`}
      action={<ApprovalStatusBadge status={item.status} />}
    >
      <div className="space-y-4 px-5 py-4">
        <div>
          <StatusBadge tone={isExpense ? "warning" : "info"}>
            {approvalKindLabels[item.type]}
          </StatusBadge>
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
          {item.comment ? (
            <div className="col-span-2">
              <dt className="text-xs text-soft">Justificativa anterior</dt>
              <dd className="text-medium">{item.comment}</dd>
            </div>
          ) : null}
        </dl>

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
            onChange={(e) => setComment(e.target.value)}
            rows={3}
            placeholder="Descreva o motivo da reprovação ou uma observação na aprovação."
            className={cn(
              "w-full resize-y rounded-md border border-border bg-surface px-3 py-2 text-sm text-strong placeholder:text-soft",
              focusRingInput,
            )}
          />
        </div>

        <div className="flex flex-wrap gap-2">
          <ActionButton
            variant="success"
            size="sm"
            icon={Check}
            disabled={item.status !== "PENDING"}
            onClick={() => onApprove(item.id, comment.trim())}
          >
            Aprovar
          </ActionButton>
          <ActionButton
            variant="danger"
            size="sm"
            icon={X}
            disabled={item.status !== "PENDING" || !canReject}
            onClick={() => onReject(item.id, comment.trim())}
          >
            Reprovar
          </ActionButton>
        </div>
      </div>
    </SectionPanel>
  );
}
