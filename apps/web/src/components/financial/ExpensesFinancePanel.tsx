"use client";

import { useState, useTransition } from "react";
import {
  AlertTriangle,
  CalendarClock,
  CheckCircle2,
  Download,
  Paperclip,
  Receipt,
  Undo2,
} from "lucide-react";
import { SectionPanel } from "@/components/ui/SectionPanel";
import { EmptyState } from "@/components/ui/EmptyState";
import { Modal } from "@/components/ui/Modal";
import { ActionButton } from "@/components/ui/ActionButton";
import { ExportExcelButton } from "@/components/ui/ExportExcelButton";
import { FeedbackBanner, useFeedback } from "@/components/ui/Feedback";
import { cn } from "@/lib/utils";
import { focusRingInput } from "@/lib/styles";
import { formatCurrency, formatDate } from "@/lib/format";
import { getReceiptUrl, setPayment } from "@/app/app/despesas/actions";
import { expenses as mockExpenses } from "@/lib/mock-data/expenses";
import { summarizeExpenses, type Expense } from "@/lib/expenses/types";
import { ExpenseStatusBadge } from "@/components/expenses/ExpenseStatusBadge";

const thClass =
  "px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-soft";

const FINANCE_STATUSES = ["FINANCE_APPROVED", "PAYMENT_SCHEDULED", "PAID"];

export interface ExpensesFinancePanelProps {
  /**
   * "demo": no database — payment changes stay in local state.
   * "db": rows come from listFinanceExpenses and changes go through setPayment.
   */
  mode: "demo" | "db";
  /** db mode: expenses that reached finance (server-resolved). */
  expenses?: Expense[];
  /** db mode: whether the receipt storage is configured (P17 bulk download). */
  storageAvailable?: boolean;
  /** `.xlsx` export href (Onda 6) for the finance queue. db mode only. */
  exportHref?: string;
}

/**
 * Finance-approved expenses with their payment lifecycle. Rendered only inside
 * the role-protected Financeiro page (requireRole FINANCIAL_ROLES), so the
 * actions are already authorized at the route level; the server actions
 * re-check the role and the segregation of duties on every call.
 */
export function ExpensesFinancePanel(props: ExpensesFinancePanelProps) {
  const isDemo = props.mode === "demo";
  const storageAvailable = props.storageAvailable ?? false;
  const [localItems, setLocalItems] = useState<Expense[]>(() =>
    mockExpenses.filter((e) => FINANCE_STATUSES.includes(e.status)),
  );
  const [cancelTarget, setCancelTarget] = useState<Expense | null>(null);
  const [cancelReason, setCancelReason] = useState("");
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const { feedback, notify } = useFeedback();
  const [isPending, startTransition] = useTransition();

  const expenses = isDemo ? localItems : (props.expenses ?? []);
  const totals = summarizeExpenses(expenses);

  // P17: seleção para download em massa dos comprovantes (Financeiro).
  const selectableIds = expenses
    .filter((e) => e.attachment)
    .map((e) => e.id);
  const selectedWithReceipt = selectedIds.filter((id) =>
    selectableIds.includes(id),
  );

  function toggleSelected(id: string) {
    setSelectedIds((current) =>
      current.includes(id)
        ? current.filter((v) => v !== id)
        : [...current, id],
    );
  }

  function toggleAll() {
    setSelectedIds((current) =>
      selectableIds.every((id) => current.includes(id)) ? [] : selectableIds,
    );
  }

  function downloadReceiptsZip() {
    if (isDemo) {
      notify("info", "Download em massa disponível apenas no modo real.");
      return;
    }
    if (!storageAvailable) {
      notify("warning", "Anexos indisponíveis: storage não configurado.");
      return;
    }
    if (selectedWithReceipt.length === 0) {
      notify("info", "Selecione ao menos uma despesa com comprovante.");
      return;
    }
    const href = `/api/despesas/comprovantes?ids=${encodeURIComponent(
      selectedWithReceipt.join(","),
    )}`;
    const anchor = document.createElement("a");
    anchor.href = href;
    anchor.rel = "noopener noreferrer";
    document.body.append(anchor);
    anchor.click();
    anchor.remove();
    notify(
      "info",
      `Gerando ZIP com ${selectedWithReceipt.length} comprovante(s).`,
    );
  }

  function applyLocal(id: string, status: Expense["status"], message: string) {
    setLocalItems((prev) =>
      prev.map((e) => (e.id === id ? { ...e, status } : e)),
    );
    notify("info", `${message} (local).`);
  }

  function viewReceipt(expense: Expense) {
    if (isDemo) {
      notify("info", "Comprovante disponível apenas no modo real.");
      return;
    }
    startTransition(async () => {
      const result = await getReceiptUrl({ expenseId: expense.id });
      if (result.ok) window.open(result.data.url, "_blank", "noopener");
      else notify("warning", result.message);
    });
  }

  function handleSchedule(expense: Expense) {
    if (isDemo) {
      applyLocal(expense.id, "PAYMENT_SCHEDULED", "Pagamento agendado");
      return;
    }
    startTransition(async () => {
      const result = await setPayment({
        expenseId: expense.id,
        action: "SCHEDULE",
      });
      if (result.ok) notify("success", "Pagamento agendado.");
      else notify("warning", result.message);
    });
  }

  function handleMarkPaid(expense: Expense) {
    if (isDemo) {
      applyLocal(expense.id, "PAID", "Despesa marcada como paga");
      return;
    }
    startTransition(async () => {
      const result = await setPayment({
        expenseId: expense.id,
        action: "MARK_PAID",
      });
      if (result.ok) notify("success", "Despesa marcada como paga.");
      else notify("warning", result.message);
    });
  }

  function handleCancelSchedule() {
    const target = cancelTarget;
    const reason = cancelReason.trim();
    if (!target || reason.length === 0) return;
    if (isDemo) {
      applyLocal(target.id, "FINANCE_APPROVED", "Agendamento cancelado");
      setCancelTarget(null);
      setCancelReason("");
      return;
    }
    startTransition(async () => {
      const result = await setPayment({
        expenseId: target.id,
        action: "CANCEL_SCHEDULE",
        reason,
      });
      if (result.ok) notify("info", "Agendamento cancelado com motivo registrado.");
      else notify("warning", result.message);
      setCancelTarget(null);
      setCancelReason("");
    });
  }

  return (
    <div className="space-y-3">
      <FeedbackBanner message={feedback} />
      <SectionPanel
        title="Despesas no financeiro"
        description="Reembolsos aprovados pelo financeiro: agendamento, pagamento e cancelamento com motivo."
        action={
          <div className="flex items-center gap-3">
            {!isDemo && props.exportHref ? (
              <ExportExcelButton href={props.exportHref} />
            ) : null}
            {!isDemo ? (
              <ActionButton
                variant="secondary"
                size="sm"
                icon={Download}
                disabled={isPending || selectedWithReceipt.length === 0}
                onClick={downloadReceiptsZip}
              >
                Baixar comprovantes ({selectedWithReceipt.length})
              </ActionButton>
            ) : null}
            <div className="flex flex-col items-end leading-tight">
              <span className="text-sm font-semibold tabular-nums text-strong">
                {formatCurrency(totals.toPayAmount + totals.scheduledAmount)} a
                pagar
              </span>
              <span className="text-xs text-soft">
                {formatCurrency(totals.paidAmount)} pago
              </span>
            </div>
          </div>
        }
      >
        {expenses.length === 0 ? (
          <div className="px-5 py-10">
            <EmptyState
              icon={Receipt}
              title="Nenhuma despesa no financeiro"
              description="Despesas aprovadas pelo financeiro aparecerão aqui para pagamento."
            />
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-sm">
              <caption className="sr-only">Despesas no financeiro</caption>
              <thead>
                <tr className="border-b border-border">
                  {!isDemo ? (
                    <th scope="col" className={`${thClass} w-10`}>
                      <input
                        type="checkbox"
                        aria-label="Selecionar todas com comprovante"
                        checked={
                          selectableIds.length > 0 &&
                          selectableIds.every((id) => selectedIds.includes(id))
                        }
                        onChange={toggleAll}
                        disabled={selectableIds.length === 0}
                        className="size-4 rounded border-border text-brand focus:ring-brand"
                      />
                    </th>
                  ) : null}
                  <th scope="col" className={thClass}>
                    Data
                  </th>
                  <th scope="col" className={thClass}>
                    Projeto
                  </th>
                  <th scope="col" className={thClass}>
                    Consultor
                  </th>
                  <th scope="col" className={`${thClass} text-right`}>
                    Valor
                  </th>
                  <th scope="col" className={thClass}>
                    Status
                  </th>
                  <th scope="col" className={thClass}>
                    Exceções
                  </th>
                  <th scope="col" className={thClass}>
                    Ações
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {expenses.map((expense) => (
                  <tr
                    key={expense.id}
                    className="transition-colors hover:bg-surface-muted/60"
                  >
                    {!isDemo ? (
                      <td className="px-4 py-3 align-middle">
                        <input
                          type="checkbox"
                          aria-label={`Selecionar comprovante de ${expense.consultantName}`}
                          checked={selectedIds.includes(expense.id)}
                          onChange={() => toggleSelected(expense.id)}
                          disabled={!expense.attachment}
                          className="size-4 rounded border-border text-brand focus:ring-brand disabled:opacity-40"
                        />
                      </td>
                    ) : null}
                    <td className="px-4 py-3 align-middle tabular-nums text-medium">
                      {formatDate(expense.date)}
                    </td>
                    <td className="px-4 py-3 align-middle">
                      <p className="font-medium text-strong">
                        {expense.projectName}
                      </p>
                      <p className="text-xs text-soft">{expense.clientName}</p>
                    </td>
                    <td className="px-4 py-3 align-middle text-medium">
                      {expense.consultantName}
                    </td>
                    <td className="px-4 py-3 text-right align-middle font-semibold tabular-nums text-strong">
                      {formatCurrency(expense.amount)}
                    </td>
                    <td className="px-4 py-3 align-middle">
                      <ExpenseStatusBadge status={expense.status} />
                    </td>
                    <td className="px-4 py-3 align-middle">
                      {expense.attachment ? (
                        <button
                          type="button"
                          className="inline-flex items-center gap-1 text-sm text-accent underline disabled:opacity-60"
                          disabled={isPending}
                          onClick={() => viewReceipt(expense)}
                        >
                          <Paperclip size={13} /> Comprovante
                        </button>
                      ) : (
                        <span className="inline-flex items-center gap-1 rounded-md bg-warning-soft px-2 py-0.5 text-xs font-medium text-warning">
                          <AlertTriangle size={13} /> Sem comprovante
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3 align-middle">
                      <div className="flex flex-wrap items-center gap-1.5">
                        {expense.status === "FINANCE_APPROVED" ? (
                          <ActionButton
                            variant="secondary"
                            size="sm"
                            icon={CalendarClock}
                            disabled={isPending}
                            onClick={() => handleSchedule(expense)}
                          >
                            Agendar
                          </ActionButton>
                        ) : null}
                        {expense.status === "PAYMENT_SCHEDULED" ? (
                          <>
                            <ActionButton
                              variant="success"
                              size="sm"
                              icon={CheckCircle2}
                              disabled={isPending}
                              onClick={() => handleMarkPaid(expense)}
                            >
                              Marcar paga
                            </ActionButton>
                            <ActionButton
                              variant="secondary"
                              size="sm"
                              icon={Undo2}
                              disabled={isPending}
                              onClick={() => {
                                setCancelReason("");
                                setCancelTarget(expense);
                              }}
                            >
                              Cancelar
                            </ActionButton>
                          </>
                        ) : null}
                        {expense.status === "PAID" ? (
                          <span className="text-xs text-soft">—</span>
                        ) : null}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </SectionPanel>

      <Modal
        open={cancelTarget !== null}
        onClose={() => setCancelTarget(null)}
        title="Cancelar agendamento"
        description="Informe o motivo do cancelamento — ele fica registrado na auditoria."
        footer={
          <>
            <ActionButton
              variant="secondary"
              size="sm"
              onClick={() => setCancelTarget(null)}
            >
              Voltar
            </ActionButton>
            <ActionButton
              variant="danger"
              size="sm"
              disabled={cancelReason.trim().length === 0 || isPending}
              onClick={handleCancelSchedule}
            >
              Cancelar agendamento
            </ActionButton>
          </>
        }
      >
        <div className="space-y-3">
          {cancelTarget ? (
            <p className="text-sm text-medium">
              {cancelTarget.consultantName} ·{" "}
              {formatCurrency(cancelTarget.amount)} ·{" "}
              {formatDate(cancelTarget.date)}
            </p>
          ) : null}
          <div>
            <label
              htmlFor="cancel-reason"
              className="mb-1 block text-xs font-semibold text-medium"
            >
              Motivo{" "}
              <span className="font-normal text-soft">(obrigatório)</span>
            </label>
            <textarea
              id="cancel-reason"
              value={cancelReason}
              onChange={(e) => setCancelReason(e.target.value)}
              rows={3}
              placeholder="Descreva por que o agendamento foi cancelado."
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
