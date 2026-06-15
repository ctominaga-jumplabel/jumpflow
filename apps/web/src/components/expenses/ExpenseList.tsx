"use client";

import { Paperclip, Pencil, Receipt, Send, Trash2 } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { SectionPanel } from "@/components/ui/SectionPanel";
import { EmptyState } from "@/components/ui/EmptyState";
import { cn } from "@/lib/utils";
import { focusRing } from "@/lib/styles";
import { formatCurrency, formatDate } from "@/lib/format";
import { isExpenseEditable, type Expense } from "@/lib/expenses/types";
import { ExpenseStatusBadge } from "./ExpenseStatusBadge";

const thClass =
  "px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-soft";

export interface ExpenseListProps {
  expenses: Expense[];
  onViewAttachment: (expense: Expense) => void;
  /** Edit an editable expense (DRAFT/rejected). Omit to hide the action. */
  onEdit?: (expense: Expense) => void;
  /** Delete an editable expense. Omit to hide the action. */
  onDelete?: (expense: Expense) => void;
  /** Submit a DRAFT for approval. Omit to hide the action. */
  onSubmitExpense?: (expense: Expense) => void;
  /** Disable row actions while a server action is in flight. */
  busy?: boolean;
}

function RowAction({
  icon: Icon,
  label,
  onClick,
  disabled,
}: {
  icon: LucideIcon;
  label: string;
  onClick: () => void;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      title={label}
      className={cn(
        "inline-grid size-8 place-items-center rounded-md border border-border text-medium transition-colors hover:bg-surface-muted hover:text-strong disabled:cursor-not-allowed disabled:opacity-50",
        focusRing,
      )}
    >
      <Icon aria-hidden="true" className="size-4" />
    </button>
  );
}

/**
 * Tabular list of expenses along the single status chain (approval + payment
 * in one badge). Per-row actions (edit/delete/submit) appear only while the
 * status allows rework and only when the caller wires them (db mode).
 */
export function ExpenseList({
  expenses,
  onViewAttachment,
  onEdit,
  onDelete,
  onSubmitExpense,
  busy = false,
}: ExpenseListProps) {
  const hasActions = Boolean(onEdit || onDelete || onSubmitExpense);

  return (
    <SectionPanel
      title="Despesas"
      description="Lançamentos por projeto, da aprovação ao pagamento."
    >
      {expenses.length === 0 ? (
        <div className="px-5 py-10">
          <EmptyState
            icon={Receipt}
            title="Nenhuma despesa encontrada"
            description="Ajuste os filtros ou lance uma nova despesa para começar."
          />
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-sm">
            <caption className="sr-only">Lista de despesas</caption>
            <thead>
              <tr className="border-b border-border">
                <th scope="col" className={thClass}>
                  Data
                </th>
                <th scope="col" className={thClass}>
                  Projeto
                </th>
                <th scope="col" className={thClass}>
                  Consultor
                </th>
                <th scope="col" className={thClass}>
                  Descrição
                </th>
                <th scope="col" className={cn(thClass, "text-right")}>
                  Valor
                </th>
                <th scope="col" className={thClass}>
                  Status
                </th>
                <th scope="col" className={cn(thClass, "text-center")}>
                  Comprovante
                </th>
                {hasActions ? (
                  <th scope="col" className={cn(thClass, "text-center")}>
                    Ações
                  </th>
                ) : null}
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {expenses.map((expense) => {
                const editable = isExpenseEditable(expense.status);
                return (
                  <tr
                    key={expense.id}
                    className="transition-colors hover:bg-surface-muted/60"
                  >
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
                    <td className="max-w-xs px-4 py-3 align-middle">
                      <p className="truncate text-medium" title={expense.description}>
                        {expense.description}
                      </p>
                      {expense.invoiceNumber ? (
                        <p className="text-xs text-soft">
                          {expense.invoiceNumber}
                        </p>
                      ) : null}
                      {expense.rejectionReason ? (
                        <p
                          className="truncate text-xs font-medium text-danger"
                          title={expense.rejectionReason}
                        >
                          {expense.rejectionReason}
                        </p>
                      ) : null}
                    </td>
                    <td className="px-4 py-3 text-right align-middle font-semibold tabular-nums text-strong">
                      {formatCurrency(expense.amount)}
                    </td>
                    <td className="px-4 py-3 align-middle">
                      <ExpenseStatusBadge status={expense.status} />
                    </td>
                    <td className="px-4 py-3 text-center align-middle">
                      {expense.attachment ? (
                        <button
                          type="button"
                          onClick={() => onViewAttachment(expense)}
                          aria-label={`Ver comprovante de ${expense.description}`}
                          className={cn(
                            "inline-grid size-8 place-items-center rounded-md border border-border text-medium transition-colors hover:bg-surface-muted hover:text-strong",
                            focusRing,
                          )}
                        >
                          <Paperclip aria-hidden="true" className="size-4" />
                        </button>
                      ) : (
                        <span className="text-xs text-soft">—</span>
                      )}
                    </td>
                    {hasActions ? (
                      <td className="px-4 py-3 text-center align-middle">
                        {editable ? (
                          <div className="inline-flex items-center gap-1.5">
                            {onSubmitExpense && expense.status === "DRAFT" ? (
                              <RowAction
                                icon={Send}
                                label={`Enviar despesa ${expense.description} para aprovação`}
                                onClick={() => onSubmitExpense(expense)}
                                disabled={busy || !expense.attachment}
                              />
                            ) : null}
                            {onEdit ? (
                              <RowAction
                                icon={Pencil}
                                label={`Editar despesa ${expense.description}`}
                                onClick={() => onEdit(expense)}
                                disabled={busy}
                              />
                            ) : null}
                            {onDelete ? (
                              <RowAction
                                icon={Trash2}
                                label={`Excluir despesa ${expense.description}`}
                                onClick={() => onDelete(expense)}
                                disabled={busy}
                              />
                            ) : null}
                          </div>
                        ) : (
                          <span className="text-xs text-soft">—</span>
                        )}
                      </td>
                    ) : null}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </SectionPanel>
  );
}
