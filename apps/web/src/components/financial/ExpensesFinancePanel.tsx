import { SectionPanel } from "@/components/ui/SectionPanel";
import { EmptyState } from "@/components/ui/EmptyState";
import { Receipt } from "lucide-react";
import { formatCurrency, formatDate } from "@/lib/format";
import {
  expenses as allExpenses,
  summarizeExpenses,
  type Expense,
} from "@/lib/mock-data/expenses";
import { ExpensePaymentBadge } from "@/components/expenses/ExpensePaymentBadge";

const thClass =
  "px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-soft";

/**
 * Approved/closed expenses that reach finance, with payment status. Rendered
 * only inside the role-protected Financeiro page (requireRole), so the figures
 * are already authorized. Mirrors how approved hours feed the monthly closing.
 */
export function ExpensesFinancePanel({
  expenses = allExpenses,
}: {
  expenses?: Expense[];
}) {
  const reimbursable = expenses.filter(
    (e) => e.status === "APPROVED" || e.status === "CLOSED",
  );
  const totals = summarizeExpenses(expenses);

  return (
    <SectionPanel
      title="Despesas aprovadas"
      description="Reembolsos que entram no financeiro e seu status de pagamento."
      action={
        <div className="flex flex-col items-end leading-tight">
          <span className="text-sm font-semibold tabular-nums text-strong">
            {formatCurrency(totals.approvedAmount)}
          </span>
          <span className="text-xs text-soft">
            {formatCurrency(totals.paidAmount)} pago
          </span>
        </div>
      }
    >
      {reimbursable.length === 0 ? (
        <div className="px-5 py-10">
          <EmptyState
            icon={Receipt}
            title="Nenhuma despesa aprovada"
            description="Despesas aprovadas pelos gestores aparecerão aqui para pagamento."
          />
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-sm">
            <caption className="sr-only">Despesas aprovadas</caption>
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
                <th scope="col" className={`${thClass} text-right`}>
                  Valor
                </th>
                <th scope="col" className={thClass}>
                  Pagamento
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {reimbursable.map((expense) => (
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
                  <td className="px-4 py-3 text-right align-middle font-semibold tabular-nums text-strong">
                    {formatCurrency(expense.amount)}
                  </td>
                  <td className="px-4 py-3 align-middle">
                    <ExpensePaymentBadge status={expense.paymentStatus} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </SectionPanel>
  );
}
