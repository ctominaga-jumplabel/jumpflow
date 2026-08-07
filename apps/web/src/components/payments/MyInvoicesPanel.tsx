"use client";

import { useState } from "react";
import { Download, FileText, TriangleAlert, X } from "lucide-react";
import { ActionButton } from "@/components/ui/ActionButton";
import { DataTable, type DataTableColumn } from "@/components/ui/DataTable";
import { FeedbackBanner, useFeedback } from "@/components/ui/Feedback";
import { SectionPanel } from "@/components/ui/SectionPanel";
import { StatusBadge, type StatusTone } from "@/components/ui/StatusBadge";
import { focusRing } from "@/lib/styles";
import { cn } from "@/lib/utils";
import {
  formatCurrency,
  formatCurrencyPrecise,
  formatMonth,
  formatPercent,
} from "@/lib/format";
import {
  consultantPaymentStatusLabels,
  type ConsultantPaymentView,
} from "@/lib/payments/types";
import { InvoiceUploadForm } from "./InvoiceUploadForm";

const contractTypeLabels: Record<
  ConsultantPaymentView["contractType"],
  string
> = {
  CLT: "CLT",
  PJ: "PJ",
  CLT_FLEX: "CLT Flex",
};

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

/** Statuses where the consultant can still send/replace the NF. */
const UPLOADABLE_STATUSES: ConsultantPaymentView["status"][] = [
  "OPEN",
  "WAITING_FOR_INVOICE",
];

export interface MyInvoicesPanelProps {
  payments: ConsultantPaymentView[];
}

/**
 * Consultant self-service NF screen (melhoria #3). Lists ONLY the logged-in
 * consultant's own payments (scoped in the server read) and lets them attach
 * the NF for payments still waiting for it. A value divergence only warns — it
 * never blocks the flow.
 */
export function MyInvoicesPanel({ payments }: MyInvoicesPanelProps) {
  const { feedback, notify } = useFeedback();
  const [uploadTarget, setUploadTarget] =
    useState<ConsultantPaymentView | null>(null);

  const columns: DataTableColumn<ConsultantPaymentView>[] = [
    {
      key: "competencia",
      header: "Competência",
      cell: (payment) => (
        <div>
          <p className="font-medium text-strong">
            {formatMonth(payment.month, payment.year)}
          </p>
          <p className="text-xs text-soft">
            {contractTypeLabels[payment.contractType]}
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
      key: "expected",
      header: "Valor previsto",
      align: "right",
      cell: (payment) => (
        <span className="font-semibold tabular-nums text-strong">
          {formatCurrency(payment.totalAmount)}
        </span>
      ),
    },
    {
      key: "nf",
      header: "Nota fiscal",
      cell: (payment) => (
        <div className="space-y-1.5">
          {payment.invoiceAmount != null ? (
            <p className="text-xs tabular-nums text-medium">
              Informado: {formatCurrencyPrecise(payment.invoiceAmount)}
            </p>
          ) : (
            <p className="text-xs text-soft">Nenhuma NF informada</p>
          )}
          {payment.invoiceAttachments.length > 0 ? (
            <ul className="space-y-1">
              {payment.invoiceAttachments.map((attachment) => (
                <li key={attachment.id}>
                  <a
                    href={`/api/pagamentos/nf?id=${encodeURIComponent(attachment.id)}`}
                    className={cn(
                      "inline-flex items-center gap-1.5 text-xs font-medium text-brand-dark hover:underline",
                      focusRing,
                    )}
                  >
                    <Download aria-hidden="true" className="size-3.5" />
                    <span className="max-w-[14rem] truncate">
                      {attachment.fileName}
                    </span>
                  </a>
                </li>
              ))}
            </ul>
          ) : null}
          {payment.invoiceDivergence?.isDivergent ? (
            <p className="flex items-start gap-1.5 text-xs font-medium text-warning">
              <TriangleAlert
                aria-hidden="true"
                className="mt-0.5 size-3.5 shrink-0"
              />
              <span>
                Valor informado difere do previsto (
                {formatCurrencyPrecise(payment.invoiceDivergence.declared)} vs{" "}
                {formatCurrencyPrecise(payment.invoiceDivergence.expected)},{" "}
                {formatPercent(payment.invoiceDivergence.diffPct * 100)}). É só um
                aviso.
              </span>
            </p>
          ) : null}
        </div>
      ),
    },
    {
      key: "actions",
      header: "Ações",
      cell: (payment) =>
        UPLOADABLE_STATUSES.includes(payment.status) ? (
          <ActionButton
            size="sm"
            variant={payment.id === uploadTarget?.id ? "secondary" : "primary"}
            icon={FileText}
            onClick={() =>
              setUploadTarget((current) =>
                current?.id === payment.id ? null : payment,
              )
            }
          >
            {payment.invoiceAttachmentCount > 0 ? "Reenviar NF" : "Anexar NF"}
          </ActionButton>
        ) : (
          <span className="text-xs text-soft">—</span>
        ),
    },
  ];

  return (
    <div className="space-y-3">
      <FeedbackBanner message={feedback} />
      <SectionPanel
        title="Minhas notas fiscais"
        description="Pagamentos vinculados ao seu cadastro. Anexe a NF dos meses em aberto."
      >
        <DataTable
          columns={columns}
          rows={payments}
          rowKey={(payment) => payment.id}
          caption="Meus pagamentos e notas fiscais"
          empty={
            <p className="text-center text-sm text-soft">
              Você ainda não tem pagamentos registrados. Assim que houver um
              pagamento em aberto, poderá anexar a NF por aqui.
            </p>
          }
        />
      </SectionPanel>

      {uploadTarget ? (
        <SectionPanel
          title="Anexar nota fiscal"
          description={`${formatMonth(uploadTarget.month, uploadTarget.year)} — previsto ${formatCurrency(uploadTarget.totalAmount)}`}
          action={
            <button
              type="button"
              onClick={() => setUploadTarget(null)}
              aria-label="Fechar"
              className={cn(
                "inline-flex size-8 items-center justify-center rounded-md text-soft hover:bg-surface-muted hover:text-strong",
                focusRing,
              )}
            >
              <X aria-hidden="true" className="size-4" />
            </button>
          }
        >
          <div className="p-5">
            <InvoiceUploadForm
              key={uploadTarget.id}
              paymentId={uploadTarget.id}
              defaultAmount={uploadTarget.invoiceAmount}
              onResult={(ok, message) => {
                notify(ok ? "success" : "warning", message);
                if (ok) setUploadTarget(null);
              }}
            />
          </div>
        </SectionPanel>
      ) : null}
    </div>
  );
}
