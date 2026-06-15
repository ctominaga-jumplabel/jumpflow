"use client";

import { useMemo, useState, useTransition } from "react";
import {
  Banknote,
  CalendarClock,
  CheckCircle2,
  FileCheck2,
  FileText,
  Mail,
  RotateCw,
} from "lucide-react";
import { ActionButton } from "@/components/ui/ActionButton";
import { DataTable, type DataTableColumn } from "@/components/ui/DataTable";
import { FeedbackBanner, useFeedback } from "@/components/ui/Feedback";
import { SectionPanel } from "@/components/ui/SectionPanel";
import { StatusBadge, type StatusTone } from "@/components/ui/StatusBadge";
import { formatCurrency, formatDate, formatHours, formatMonth } from "@/lib/format";
import {
  consultantPaymentStatusLabels,
  type ConsultantPaymentView,
} from "@/lib/payments/types";
import {
  advanceConsultantPayment,
  generateMonthlyConsultantPayments,
  sendPaymentForecast,
} from "@/app/app/pagamentos/actions";

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

export interface ConsultantPaymentsPanelProps {
  mode: "demo" | "db";
  month: number;
  year: number;
  payments: ConsultantPaymentView[];
}

export function ConsultantPaymentsPanel({
  mode,
  month,
  year,
  payments,
}: ConsultantPaymentsPanelProps) {
  const isDemo = mode === "demo";
  const [isPending, startTransition] = useTransition();
  const { feedback, notify } = useFeedback();
  const [forecastTarget, setForecastTarget] =
    useState<ConsultantPaymentView | null>(null);
  const [expectedPaymentAt, setExpectedPaymentAt] = useState("");
  const [responseDeadlineAt, setResponseDeadlineAt] = useState("");
  const total = useMemo(
    () => payments.reduce((sum, payment) => sum + payment.totalAmount, 0),
    [payments],
  );

  function generate() {
    if (isDemo) {
      notify("info", "Geracao local simulada.");
      return;
    }
    startTransition(async () => {
      const result = await generateMonthlyConsultantPayments({ month, year });
      if (result.ok) {
        notify(
          "success",
          `${result.data.generated} pagamento(s) gerado(s). ${result.data.skippedExisting} existente(s) preservado(s).`,
        );
      } else {
        notify("warning", result.message);
      }
    });
  }

  function advance(
    payment: ConsultantPaymentView,
    action: Parameters<typeof advanceConsultantPayment>[0]["action"],
  ) {
    if (isDemo) {
      notify("info", "Transicao local simulada.");
      return;
    }
    startTransition(async () => {
      const result = await advanceConsultantPayment({ id: payment.id, action });
      if (result.ok) notify("success", "Status atualizado.");
      else notify("warning", result.message);
    });
  }

  function submitForecast() {
    const target = forecastTarget;
    if (!target || !expectedPaymentAt || !responseDeadlineAt) return;
    if (isDemo) {
      notify("info", "Email de previsao local simulado.");
      setForecastTarget(null);
      return;
    }
    startTransition(async () => {
      const result = await sendPaymentForecast({
        paymentId: target.id,
        expectedPaymentAt,
        responseDeadlineAt,
      });
      if (result.ok) notify("success", "Previsao enviada ao consultor.");
      else notify("warning", result.message);
      setForecastTarget(null);
    });
  }

  const columns: DataTableColumn<ConsultantPaymentView>[] = [
    {
      key: "consultant",
      header: "Consultor",
      cell: (payment) => (
        <div>
          <p className="font-medium text-strong">{payment.consultantName}</p>
          <p className="text-xs text-soft">{payment.contractType}</p>
        </div>
      ),
    },
    {
      key: "breakdown",
      header: "Abertura",
      cell: (payment) => (
        <div className="space-y-1 text-xs text-medium">
          {payment.lines.slice(0, 3).map((line) => (
            <p key={line.id}>
              {line.projectName}: {formatHours(line.hours)} /{" "}
              {formatCurrency(line.amount)}
            </p>
          ))}
          {payment.lines.length > 3 ? (
            <p className="text-soft">+{payment.lines.length - 3} linha(s)</p>
          ) : null}
        </div>
      ),
    },
    {
      key: "amount",
      header: "Total",
      align: "right",
      cell: (payment) => (
        <div className="text-right">
          <p className="font-semibold tabular-nums text-strong">
            {formatCurrency(payment.totalAmount)}
          </p>
          <p className="text-xs tabular-nums text-soft">
            CLT {formatCurrency(payment.cltNetAmount)} / PJ{" "}
            {formatCurrency(payment.pjAmount)}
          </p>
        </div>
      ),
    },
    {
      key: "status",
      header: "Status",
      cell: (payment) => (
        <StatusBadge tone={toneByStatus[payment.status]}>
          {consultantPaymentStatusLabels[payment.status]}
        </StatusBadge>
      ),
    },
    {
      key: "dates",
      header: "Previsao",
      cell: (payment) => (
        <div className="text-xs text-medium">
          {payment.expectedPaymentAt ? (
            <p>{formatDate(payment.expectedPaymentAt)}</p>
          ) : (
            <p className="text-soft">Sem previsao</p>
          )}
          {payment.confirmedPaidAt ? (
            <p className="text-success">Pago {formatDate(payment.confirmedPaidAt)}</p>
          ) : null}
        </div>
      ),
      className: "hidden lg:table-cell",
    },
    {
      key: "actions",
      header: "Acoes",
      cell: (payment) => (
        <div className="flex flex-wrap gap-1.5">
          {payment.status === "OPEN" ? (
            <>
              {payment.contractType === "CLT" ? (
                <ActionButton
                  size="sm"
                  variant="secondary"
                  icon={CheckCircle2}
                  disabled={isPending}
                  onClick={() => advance(payment, "APPROVE_CLT_PAYMENT")}
                >
                  Aprovar
                </ActionButton>
              ) : (
                <ActionButton
                  size="sm"
                  variant="secondary"
                  icon={FileText}
                  disabled={isPending}
                  onClick={() => advance(payment, "REQUEST_INVOICE")}
                >
                  Pedir NF
                </ActionButton>
              )}
              <ActionButton
                size="sm"
                variant="secondary"
                icon={Mail}
                disabled={isPending}
                onClick={() => {
                  setForecastTarget(payment);
                  setExpectedPaymentAt(payment.expectedPaymentAt ?? "");
                  setResponseDeadlineAt("");
                }}
              >
                Previsao
              </ActionButton>
            </>
          ) : null}
          {payment.status === "WAITING_FOR_INVOICE" ? (
            <ActionButton
              size="sm"
              variant="secondary"
              icon={FileCheck2}
              disabled={isPending}
              onClick={() => advance(payment, "MARK_INVOICE_RECEIVED")}
            >
              NF recebida
            </ActionButton>
          ) : null}
          {payment.status === "INVOICE_RECEIVED" ? (
            <ActionButton
              size="sm"
              variant="secondary"
              icon={FileCheck2}
              disabled={isPending}
              onClick={() => advance(payment, "VALIDATE_INVOICE")}
            >
              Validar NF
            </ActionButton>
          ) : null}
          {payment.status === "INVOICE_VALIDATED" ? (
            <ActionButton
              size="sm"
              variant="success"
              icon={CheckCircle2}
              disabled={isPending}
              onClick={() => advance(payment, "APPROVE_FOR_PAYMENT")}
            >
              Aprovar
            </ActionButton>
          ) : null}
          {payment.status === "APPROVED_FOR_PAYMENT" ? (
            <ActionButton
              size="sm"
              variant="secondary"
              icon={Banknote}
              disabled={isPending}
              onClick={() => advance(payment, "SEND_TO_BANK")}
            >
              Banco
            </ActionButton>
          ) : null}
          {payment.status === "SENT_TO_BANK" ? (
            <ActionButton
              size="sm"
              variant="secondary"
              icon={CalendarClock}
              disabled={isPending}
              onClick={() => advance(payment, "MARK_PROCESSED")}
            >
              Processado
            </ActionButton>
          ) : null}
          {payment.status === "PROCESSED" ? (
            <ActionButton
              size="sm"
              variant="success"
              icon={CheckCircle2}
              disabled={isPending}
              onClick={() => advance(payment, "MARK_PAID")}
            >
              Pago
            </ActionButton>
          ) : null}
        </div>
      ),
    },
  ];

  return (
    <div className="space-y-3">
      <FeedbackBanner message={feedback} />
      <SectionPanel
        title="Pagamentos de consultores"
        description={`Competencia ${formatMonth(month, year)}`}
        action={
          <div className="flex items-center gap-3">
            <span className="text-sm font-semibold tabular-nums text-strong">
              {formatCurrency(total)}
            </span>
            <ActionButton
              size="sm"
              variant="primary"
              icon={RotateCw}
              disabled={isPending}
              onClick={generate}
            >
              Gerar
            </ActionButton>
          </div>
        }
      >
        <DataTable
          columns={columns}
          rows={payments}
          rowKey={(payment) => payment.id}
          caption="Pagamentos de consultores"
        />
      </SectionPanel>
      {forecastTarget ? (
        <SectionPanel
          title="Enviar previsao"
          description={forecastTarget.consultantName}
          action={
            <ActionButton
              size="sm"
              variant="primary"
              icon={Mail}
              disabled={!expectedPaymentAt || !responseDeadlineAt || isPending}
              onClick={submitForecast}
            >
              Enviar
            </ActionButton>
          }
        >
          <div className="grid gap-3 p-5 sm:grid-cols-2">
            <label className="text-sm font-medium text-medium">
              Prazo de retorno
              <input
                type="date"
                value={responseDeadlineAt}
                onChange={(event) => setResponseDeadlineAt(event.target.value)}
                className="mt-1 h-10 w-full rounded-md border border-border bg-surface px-3 text-sm text-strong"
              />
            </label>
            <label className="text-sm font-medium text-medium">
              Previsao de pagamento
              <input
                type="date"
                value={expectedPaymentAt}
                onChange={(event) => setExpectedPaymentAt(event.target.value)}
                className="mt-1 h-10 w-full rounded-md border border-border bg-surface px-3 text-sm text-strong"
              />
            </label>
          </div>
        </SectionPanel>
      ) : null}
    </div>
  );
}
