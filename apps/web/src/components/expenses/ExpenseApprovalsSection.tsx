"use client";

import { useMemo, useState, useTransition } from "react";
import { Check, ClipboardCheck, Paperclip, X } from "lucide-react";
import { ActionButton } from "@/components/ui/ActionButton";
import { SectionPanel } from "@/components/ui/SectionPanel";
import { EmptyState } from "@/components/ui/EmptyState";
import { Modal } from "@/components/ui/Modal";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { FeedbackBanner, useFeedback } from "@/components/ui/Feedback";
import { cn } from "@/lib/utils";
import { focusRingInput } from "@/lib/styles";
import { formatCurrency } from "@/lib/format";
import {
  decideAsFinance,
  decideAsManager,
  getReceiptUrl,
} from "@/app/app/despesas/actions";
import { approvalStageLabels, type ApprovalItem } from "@/lib/mock-data/approvals";

export interface ExpenseApprovalsSectionProps {
  /** Pending EXPENSE approval items (both stages), server-scoped by role. */
  items: ApprovalItem[];
}

/**
 * P14 (Onda 3): aprovacao operacional e financeira das despesas DENTRO da tela
 * Despesas, reusando as mesmas server actions (decideAsManager/decideAsFinance)
 * da fila /app/aprovacoes. A segregacao de funcoes (assertNotSelf) e o RBAC sao
 * reforcados no servidor a cada chamada. Uma visao por etapa: "a aprovar como
 * gestor" (MANAGER) e "a aprovar como financeiro" (FINANCE).
 */
export function ExpenseApprovalsSection({
  items,
}: ExpenseApprovalsSectionProps) {
  const { feedback, notify } = useFeedback();
  const [isPending, startTransition] = useTransition();
  const [rejectTarget, setRejectTarget] = useState<ApprovalItem | null>(null);
  const [rejectComment, setRejectComment] = useState("");

  const managerItems = useMemo(
    () => items.filter((i) => i.stage === "MANAGER"),
    [items],
  );
  const financeItems = useMemo(
    () => items.filter((i) => i.stage === "FINANCE"),
    [items],
  );

  function decideFor(item: ApprovalItem) {
    return item.stage === "FINANCE" ? decideAsFinance : decideAsManager;
  }

  function approve(item: ApprovalItem) {
    if (!item.expenseId) return;
    const expenseId = item.expenseId;
    const stageLabel = approvalStageLabels[item.stage ?? "MANAGER"];
    startTransition(async () => {
      const result = await decideFor(item)({
        expenseId,
        decision: "APPROVED",
        comment: "",
      });
      if (result.ok) notify("success", `Despesa aprovada na etapa ${stageLabel}.`);
      else notify("warning", result.message);
    });
  }

  function confirmReject() {
    const item = rejectTarget;
    const comment = rejectComment.trim();
    if (!item?.expenseId || comment.length === 0) return;
    const expenseId = item.expenseId;
    const stageLabel = approvalStageLabels[item.stage ?? "MANAGER"];
    startTransition(async () => {
      const result = await decideFor(item)({
        expenseId,
        decision: "REJECTED",
        comment,
      });
      if (result.ok) {
        notify("info", `Despesa reprovada na etapa ${stageLabel} com justificativa.`);
      } else {
        notify("warning", result.message);
      }
      setRejectTarget(null);
      setRejectComment("");
    });
  }

  function viewReceipt(item: ApprovalItem) {
    if (!item.expenseId) return;
    const expenseId = item.expenseId;
    startTransition(async () => {
      const result = await getReceiptUrl({ expenseId });
      if (result.ok) window.open(result.data.url, "_blank", "noopener");
      else notify("warning", result.message);
    });
  }

  function renderGroup(title: string, list: ApprovalItem[], stage: string) {
    return (
      <SectionPanel
        title={title}
        description={
          stage === "MANAGER"
            ? "Despesas enviadas aguardando aprovação do gestor."
            : "Despesas aprovadas pelo gestor aguardando aprovação do financeiro."
        }
        action={<StatusBadge tone="warning">{list.length} pendente(s)</StatusBadge>}
      >
        {list.length === 0 ? (
          <div className="px-5 py-8">
            <EmptyState
              icon={ClipboardCheck}
              title="Nenhuma pendência"
              description="Não há despesas aguardando decisão nesta etapa."
            />
          </div>
        ) : (
          <ul className="divide-y divide-border">
            {list.map((item) => (
              <li
                key={item.id}
                className="flex flex-wrap items-center justify-between gap-3 px-5 py-4"
              >
                <div className="min-w-0">
                  <p className="text-sm font-medium text-strong">
                    {item.consultantName} · {formatCurrency(item.amount ?? 0)}
                  </p>
                  <p className="truncate text-xs text-soft">
                    {item.projectName} · {item.clientName} · {item.period}
                  </p>
                  <p className="truncate text-xs text-medium">
                    {item.activitySummary}
                  </p>
                </div>
                <div className="flex shrink-0 flex-wrap gap-1.5">
                  <ActionButton
                    variant="secondary"
                    size="sm"
                    icon={Paperclip}
                    disabled={isPending}
                    onClick={() => viewReceipt(item)}
                  >
                    Comprovante
                  </ActionButton>
                  <ActionButton
                    variant="success"
                    size="sm"
                    icon={Check}
                    disabled={isPending}
                    onClick={() => approve(item)}
                  >
                    Aprovar
                  </ActionButton>
                  <ActionButton
                    variant="danger"
                    size="sm"
                    icon={X}
                    disabled={isPending}
                    onClick={() => {
                      setRejectComment("");
                      setRejectTarget(item);
                    }}
                  >
                    Reprovar
                  </ActionButton>
                </div>
              </li>
            ))}
          </ul>
        )}
      </SectionPanel>
    );
  }

  return (
    <div className="space-y-4">
      <FeedbackBanner message={feedback} />
      {renderGroup("A aprovar como gestor", managerItems, "MANAGER")}
      {renderGroup("A aprovar como financeiro", financeItems, "FINANCE")}

      <Modal
        open={rejectTarget !== null}
        onClose={() => setRejectTarget(null)}
        title="Reprovar despesa"
        description="A justificativa é obrigatória e fica registrada na auditoria."
        footer={
          <>
            <ActionButton
              variant="secondary"
              size="sm"
              onClick={() => setRejectTarget(null)}
            >
              Voltar
            </ActionButton>
            <ActionButton
              variant="danger"
              size="sm"
              disabled={rejectComment.trim().length === 0 || isPending}
              onClick={confirmReject}
            >
              Reprovar
            </ActionButton>
          </>
        }
      >
        <div className="space-y-3">
          {rejectTarget ? (
            <p className="text-sm text-medium">
              {rejectTarget.consultantName} ·{" "}
              {formatCurrency(rejectTarget.amount ?? 0)} · {rejectTarget.period}
            </p>
          ) : null}
          <div>
            <label
              htmlFor="expense-reject-comment"
              className="mb-1 block text-xs font-semibold text-medium"
            >
              Justificativa <span className="font-normal text-soft">(obrigatória)</span>
            </label>
            <textarea
              id="expense-reject-comment"
              value={rejectComment}
              onChange={(e) => setRejectComment(e.target.value)}
              rows={3}
              placeholder="Descreva o motivo da reprovação."
              className={cn(
                "w-full resize-y rounded-md border border-border bg-surface px-3 py-2 text-sm text-strong placeholder:text-soft",
                focusRingInput,
              )}
            />
          </div>
        </div>
      </Modal>
    </div>
  );
}
