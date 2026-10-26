import Link from "next/link";
import { ArrowUpRight, Banknote } from "lucide-react";
import { SectionPanel } from "@/components/ui/SectionPanel";
import { EmptyState } from "@/components/ui/EmptyState";
import { ActionButton } from "@/components/ui/ActionButton";
import { StatusBadge, type StatusTone } from "@/components/ui/StatusBadge";
import { SearchableSelect } from "@/components/ui/SearchableSelect";
import { formatCurrency, formatDate, formatMonth } from "@/lib/format";
import { focusRing } from "@/lib/styles";
import { cn } from "@/lib/utils";
import {
  consultantPaymentStatusLabels,
  type ConsultantPaymentView,
} from "@/lib/payments/types";

const thClass =
  "px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-soft";

const toneByStatus: Record<ConsultantPaymentView["status"], StatusTone> = {
  OPEN: "neutral",
  WAITING_FOR_INVOICE: "warning",
  INVOICE_RECEIVED: "info",
  INVOICE_VALIDATED: "info",
  APPROVED_FOR_PAYMENT: "success",
  SENT_TO_BANK: "info",
  PROCESSED: "success",
  PAID: "success",
  CANCELLED: "danger",
};

const CONTRACT_LABELS: Record<ConsultantPaymentView["contractType"], string> = {
  CLT: "CLT",
  PJ: "PJ",
  CLT_FLEX: "CLT Flex",
};

const MONTH_NAMES = [
  "Janeiro",
  "Fevereiro",
  "Março",
  "Abril",
  "Maio",
  "Junho",
  "Julho",
  "Agosto",
  "Setembro",
  "Outubro",
  "Novembro",
  "Dezembro",
];

export interface ConsultantPayablesPanelProps {
  payments: ConsultantPaymentView[];
  /** Competência filtrada; ausente = todos os pagamentos em aberto. */
  month?: number;
  year?: number;
}

/** Projetos distintos das linhas do pagamento (linhas de benefício não têm projeto). */
function projectsOf(payment: ConsultantPaymentView): string {
  const names = new Set(
    payment.lines
      .filter((line) => !line.description.startsWith("Beneficio"))
      .map((line) => line.projectName),
  );
  return names.size > 0 ? [...names].join(", ") : "—";
}

/**
 * Pagamentos de consultores dentro de Contas a Pagar. Gerados pelo "Liberar DP"
 * (Fechamento Operacional) e operados na tela de Pagamentos (NF, banco,
 * confirmação) — aqui é a visão consolidada do que o Financeiro tem a pagar,
 * ao lado das despesas. Sem competência, lista tudo o que está em aberto.
 */
export function ConsultantPayablesPanel({
  payments,
  month,
  year,
}: ConsultantPayablesPanelProps) {
  const filtered = month != null && year != null;
  const open = payments.filter(
    (p) => p.status !== "PAID" && p.status !== "CANCELLED",
  );
  const openAmount = open.reduce((sum, p) => sum + p.totalAmount, 0);
  const paidAmount = payments
    .filter((p) => p.status === "PAID")
    .reduce((sum, p) => sum + p.totalAmount, 0);
  const now = new Date();
  const years = [now.getFullYear() - 1, now.getFullYear(), now.getFullYear() + 1];
  const selectClass = cn(
    "h-9 rounded-md border border-border bg-surface px-3 text-sm text-strong",
    focusRing,
  );

  return (
    <SectionPanel
      title="Pagamentos de consultores"
      description={
        filtered
          ? `Pagamentos da competência ${formatMonth(month, year)}, gerados ao liberar o DP no Fechamento Operacional.`
          : "Pagamentos em aberto (todas as competências), gerados ao liberar o DP no Fechamento Operacional."
      }
      action={
        <div className="flex flex-col items-end leading-tight">
          <span className="text-sm font-semibold tabular-nums text-strong">
            {formatCurrency(openAmount)} a pagar
          </span>
          {filtered ? (
            <span className="text-xs text-soft">
              {formatCurrency(paidAmount)} pago
            </span>
          ) : null}
        </div>
      }
    >
      <form
        method="get"
        action="/app/financeiro"
        className="mb-4 flex flex-wrap items-end gap-3"
      >
        <input type="hidden" name="tab" value="pagar" />
        <label className="text-xs font-semibold text-medium">
          Competência
          <SearchableSelect
            name="pgmonth"
            defaultValue={month ? String(month) : ""}
            className={cn("mt-1 block w-44", selectClass)}
          >
            <option value="">Todas (em aberto)</option>
            {MONTH_NAMES.map((name, index) => (
              <option key={name} value={index + 1}>
                {name}
              </option>
            ))}
          </SearchableSelect>
        </label>
        <label className="text-xs font-semibold text-medium">
          Ano
          <SearchableSelect
            name="pgyear"
            defaultValue={String(year ?? now.getFullYear())}
            className={cn("mt-1 block w-28", selectClass)}
          >
            {years.map((y) => (
              <option key={y} value={y}>
                {y}
              </option>
            ))}
          </SearchableSelect>
        </label>
        <ActionButton type="submit" variant="primary" size="sm">
          Aplicar
        </ActionButton>
      </form>

      {payments.length === 0 ? (
        <EmptyState
          icon={Banknote}
          title={
            filtered
              ? "Nenhum pagamento nesta competência"
              : "Nenhum pagamento em aberto"
          }
          description="Os pagamentos de consultores PJ e CLT Flex são gerados quando o DP é liberado no Fechamento Operacional (Cockpit do Gestor). Consultores sem remuneração cadastrada no mês ou CLT (folha) não geram pagamento."
        />
      ) : (
        <div className="overflow-x-auto rounded-md border border-border">
          <table className="w-full min-w-[760px] text-sm">
            <thead className="bg-surface-muted">
              <tr>
                <th className={thClass}>Consultor</th>
                <th className={thClass}>Contratação</th>
                <th className={thClass}>Competência</th>
                <th className={thClass}>Projetos</th>
                <th className={cn(thClass, "text-right")}>Valor</th>
                <th className={thClass}>Previsão</th>
                <th className={thClass}>Status</th>
                <th className={cn(thClass, "text-right")}>Ação</th>
              </tr>
            </thead>
            <tbody>
              {payments.map((payment) => (
                <tr
                  key={payment.id}
                  className="border-t border-border/60 align-top"
                >
                  <td className="px-4 py-3 font-medium text-strong">
                    {payment.consultantName}
                  </td>
                  <td className="px-4 py-3 text-medium">
                    {CONTRACT_LABELS[payment.contractType]}
                  </td>
                  <td className="px-4 py-3 text-medium">
                    {formatMonth(payment.month, payment.year)}
                  </td>
                  <td className="px-4 py-3 text-medium">{projectsOf(payment)}</td>
                  <td className="px-4 py-3 text-right tabular-nums text-strong">
                    {formatCurrency(payment.totalAmount)}
                  </td>
                  <td className="px-4 py-3 text-medium">
                    {payment.expectedPaymentAt
                      ? formatDate(payment.expectedPaymentAt)
                      : "—"}
                  </td>
                  <td className="px-4 py-3">
                    <StatusBadge tone={toneByStatus[payment.status]}>
                      {consultantPaymentStatusLabels[payment.status]}
                    </StatusBadge>
                  </td>
                  <td className="px-4 py-3 text-right">
                    <Link
                      href={`/app/pagamentos?month=${payment.month}&year=${payment.year}`}
                      className={cn(
                        "inline-flex items-center gap-1 text-xs font-semibold text-brand-dark hover:underline",
                        focusRing,
                      )}
                    >
                      Abrir em Pagamentos
                      <ArrowUpRight aria-hidden="true" className="size-3.5" />
                    </Link>
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
