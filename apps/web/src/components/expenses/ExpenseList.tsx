"use client";

import { Paperclip, Receipt } from "lucide-react";
import { SectionPanel } from "@/components/ui/SectionPanel";
import { EmptyState } from "@/components/ui/EmptyState";
import { cn } from "@/lib/utils";
import { focusRing, focusRingInput } from "@/lib/styles";
import { formatCurrency, formatDate } from "@/lib/format";
import {
  expensePaymentStatusLabels,
  type Expense,
  type ExpensePaymentStatus,
} from "@/lib/mock-data/expenses";
import { ExpenseStatusBadge } from "./ExpenseStatusBadge";
import { ExpensePaymentBadge } from "./ExpensePaymentBadge";

const PAYMENT_OPTIONS: ExpensePaymentStatus[] = [
  "NOT_SCHEDULED",
  "SCHEDULED",
  "PAID",
  "CANCELLED",
];

const thClass =
  "px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-soft";

export interface ExpenseListProps {
  expenses: Expense[];
  /** Financial roles may change the payment status of approved expenses. */
  canManagePayments: boolean;
  onViewAttachment: (expense: Expense) => void;
  onChangePayment: (id: string, status: ExpensePaymentStatus) => void;
}

/** Tabular list of expenses with approval + payment status and comprovante access. */
export function ExpenseList({
  expenses,
  canManagePayments,
  onViewAttachment,
  onChangePayment,
}: ExpenseListProps) {
  return (
    <SectionPanel
      title="Despesas"
      description="Lançamentos por projeto, com status de aprovação e pagamento."
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
                <th scope="col" className={thClass}>
                  Pagamento
                </th>
                <th scope="col" className={cn(thClass, "text-center")}>
                  Comprovante
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {expenses.map((expense) => {
                const payable =
                  expense.status === "APPROVED" || expense.status === "CLOSED";
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
                    </td>
                    <td className="px-4 py-3 text-right align-middle font-semibold tabular-nums text-strong">
                      {formatCurrency(expense.amount)}
                    </td>
                    <td className="px-4 py-3 align-middle">
                      <ExpenseStatusBadge status={expense.status} />
                    </td>
                    <td className="px-4 py-3 align-middle">
                      {canManagePayments && payable ? (
                        <label className="sr-only" htmlFor={`pay-${expense.id}`}>
                          Status de pagamento de {expense.description}
                        </label>
                      ) : null}
                      {canManagePayments && payable ? (
                        <select
                          id={`pay-${expense.id}`}
                          value={expense.paymentStatus}
                          onChange={(e) =>
                            onChangePayment(
                              expense.id,
                              e.target.value as ExpensePaymentStatus,
                            )
                          }
                          className={cn(
                            "rounded-md border border-border bg-surface px-2 py-1 text-xs font-semibold text-strong",
                            focusRingInput,
                          )}
                        >
                          {PAYMENT_OPTIONS.map((status) => (
                            <option key={status} value={status}>
                              {expensePaymentStatusLabels[status]}
                            </option>
                          ))}
                        </select>
                      ) : (
                        <ExpensePaymentBadge status={expense.paymentStatus} />
                      )}
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
