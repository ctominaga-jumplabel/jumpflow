"use client";

import { useState } from "react";
import { Check, X } from "lucide-react";
import { ActionButton } from "@/components/ui/ActionButton";
import { SectionPanel } from "@/components/ui/SectionPanel";
import { focusRingInput } from "@/lib/styles";
import { cn } from "@/lib/utils";
import { formatHours } from "@/lib/format";
import type { ApprovalItem } from "@/lib/mock-data/approvals";
import { ApprovalStatusBadge } from "./ApprovalStatusBadge";

export interface ApprovalDecisionPanelProps {
  item: ApprovalItem | null;
}

/**
 * Decision panel for a selected approval. Enforces the business rule that a
 * rejection requires a justification (the "Reprovar" button stays disabled
 * until a comment is typed).
 *
 * MVP scope: the approve/reject buttons are PREPARED — they do not yet call a
 * server action (the real flow records an Approval + AuditEvent in a single
 * transaction, per docs/aprovacao-automatica.md). This is intentionally not
 * faked in the UI.
 */
export function ApprovalDecisionPanel({ item }: ApprovalDecisionPanelProps) {
  const [comment, setComment] = useState("");

  if (!item) {
    return (
      <SectionPanel title="Decisão" description="Selecione um lançamento na fila.">
        <p className="px-5 py-8 text-sm text-soft">
          Escolha um item pendente para revisar as horas e decidir.
        </p>
      </SectionPanel>
    );
  }

  const canReject = comment.trim().length > 0;

  return (
    <SectionPanel
      title="Decisão"
      description={`${item.consultantName} · ${item.period}`}
      action={<ApprovalStatusBadge status={item.status} />}
    >
      <div className="space-y-4 px-5 py-4">
        <dl className="grid grid-cols-2 gap-3 text-sm">
          <div>
            <dt className="text-xs text-soft">Projeto</dt>
            <dd className="font-medium text-strong">
              {item.projectName} · {item.clientName}
            </dd>
          </div>
          <div>
            <dt className="text-xs text-soft">Horas</dt>
            <dd className="font-medium tabular-nums text-strong">
              {formatHours(item.hours)}
            </dd>
          </div>
          <div className="col-span-2">
            <dt className="text-xs text-soft">Atividade</dt>
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
          >
            Aprovar
          </ActionButton>
          <ActionButton
            variant="danger"
            size="sm"
            icon={X}
            disabled={item.status !== "PENDING" || !canReject}
          >
            Reprovar
          </ActionButton>
        </div>
      </div>
    </SectionPanel>
  );
}
