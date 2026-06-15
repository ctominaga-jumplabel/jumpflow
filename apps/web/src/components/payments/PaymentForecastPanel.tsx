"use client";

import { useState, useTransition } from "react";
import { CalendarPlus } from "lucide-react";
import { ActionButton } from "@/components/ui/ActionButton";
import { DataTable, type DataTableColumn } from "@/components/ui/DataTable";
import { FeedbackBanner, useFeedback } from "@/components/ui/Feedback";
import { SectionPanel } from "@/components/ui/SectionPanel";
import { formatDate, formatMonth } from "@/lib/format";
import type { PaymentForecastView } from "@/lib/payments/types";
import { createMonthlyPaymentForecast } from "@/app/app/pagamentos/actions";

export interface PaymentForecastPanelProps {
  mode: "demo" | "db";
  month: number;
  year: number;
  forecasts: PaymentForecastView[];
}

function toDateInput(value: string): string {
  return value.slice(0, 10);
}

function toDateTimeInput(value: string): string {
  return value.slice(0, 16);
}

export function PaymentForecastPanel({
  mode,
  month,
  year,
  forecasts,
}: PaymentForecastPanelProps) {
  const isDemo = mode === "demo";
  const [isPending, startTransition] = useTransition();
  const { feedback, notify } = useFeedback();
  const [responseDeadlineAt, setResponseDeadlineAt] = useState("");
  const [expectedPaymentAt, setExpectedPaymentAt] = useState("");

  function createForecast() {
    if (!responseDeadlineAt || !expectedPaymentAt) return;
    if (isDemo) {
      notify("info", "Previsao local simulada.");
      return;
    }
    startTransition(async () => {
      const result = await createMonthlyPaymentForecast({
        month,
        year,
        responseDeadlineAt,
        expectedPaymentAt,
      });
      if (result.ok) {
        notify(
          "success",
          `Previsao criada e vinculada a ${result.data.linkedPayments} pagamento(s).`,
        );
        setResponseDeadlineAt("");
        setExpectedPaymentAt("");
      } else {
        notify("warning", result.message);
      }
    });
  }

  const columns: DataTableColumn<PaymentForecastView>[] = [
    {
      key: "scope",
      header: "Escopo",
      cell: (forecast) => (
        <div>
          <p className="font-medium text-strong">{forecast.consultantName}</p>
          <p className="text-xs text-soft">
            {formatMonth(forecast.closingMonth, forecast.closingYear)}
          </p>
        </div>
      ),
    },
    {
      key: "deadline",
      header: "Prazo retorno",
      cell: (forecast) => (
        <span className="text-sm text-medium">
          {formatDate(toDateInput(forecast.responseDeadlineAt))}
        </span>
      ),
    },
    {
      key: "expected",
      header: "Pagamento previsto",
      cell: (forecast) => (
        <span className="text-sm font-semibold text-strong">
          {formatDate(toDateInput(forecast.expectedPaymentAt))}
        </span>
      ),
    },
    {
      key: "linked",
      header: "Vinculos",
      align: "right",
      cell: (forecast) => (
        <span className="tabular-nums">{forecast.linkedPayments}</span>
      ),
    },
  ];

  return (
    <div className="space-y-3">
      <FeedbackBanner message={feedback} />
      <SectionPanel
        title="Previsoes de pagamento"
        description={`Competencia ${formatMonth(month, year)}`}
        action={
          <ActionButton
            size="sm"
            variant="primary"
            icon={CalendarPlus}
            disabled={!responseDeadlineAt || !expectedPaymentAt || isPending}
            onClick={createForecast}
          >
            Adicionar
          </ActionButton>
        }
      >
        <div className="grid gap-3 border-b border-border p-5 sm:grid-cols-2">
          <label className="text-sm font-medium text-medium">
            Data/hora limite de retorno
            <input
              type="datetime-local"
              value={responseDeadlineAt}
              onChange={(event) => setResponseDeadlineAt(event.target.value)}
              className="mt-1 h-10 w-full rounded-md border border-border bg-surface px-3 text-sm text-strong"
            />
          </label>
          <label className="text-sm font-medium text-medium">
            Data/hora prevista de pagamento
            <input
              type="datetime-local"
              value={expectedPaymentAt}
              onChange={(event) => setExpectedPaymentAt(event.target.value)}
              className="mt-1 h-10 w-full rounded-md border border-border bg-surface px-3 text-sm text-strong"
            />
          </label>
        </div>
        <DataTable
          columns={columns}
          rows={forecasts.map((forecast) => ({
            ...forecast,
            responseDeadlineAt: toDateTimeInput(forecast.responseDeadlineAt),
            expectedPaymentAt: toDateTimeInput(forecast.expectedPaymentAt),
          }))}
          rowKey={(forecast) => forecast.id}
          caption="Previsoes de pagamento"
        />
      </SectionPanel>
    </div>
  );
}
