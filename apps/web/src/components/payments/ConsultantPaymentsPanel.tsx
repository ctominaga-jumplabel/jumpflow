"use client";

import { useMemo, useState, useTransition } from "react";
import {
  Banknote,
  CalendarClock,
  CheckCircle2,
  Download,
  FileCheck2,
  Mail,
  Send,
  TriangleAlert,
  Undo2,
  Upload,
  UserCheck,
  X,
} from "lucide-react";
import { EntryExceptionCountBadge } from "@/components/ui/EntryExceptionAlert";
import type { EntryExceptionSummary } from "@/lib/timesheet/entry-exceptions";
import { ActionButton } from "@/components/ui/ActionButton";
import { DataTable, type DataTableColumn } from "@/components/ui/DataTable";
import { FeedbackBanner, useFeedback } from "@/components/ui/Feedback";
import { Modal } from "@/components/ui/Modal";
import { SectionPanel } from "@/components/ui/SectionPanel";
import { StatusBadge, type StatusTone } from "@/components/ui/StatusBadge";
import { focusRing, focusRingInput } from "@/lib/styles";
import { cn } from "@/lib/utils";
import {
  formatCurrency,
  formatCurrencyPrecise,
  formatDate,
  formatHours,
  formatMonth,
  formatPercent,
} from "@/lib/format";
import {
  consultantPaymentStatusLabels,
  type ConsultantPaymentView,
} from "@/lib/payments/types";
import {
  canReopenPeopleRelease,
  consultantPaymentFlowSteps,
} from "@/lib/payments/state-machine";
import {
  advanceConsultantPayment,
  releaseConsultantPaymentByPeople,
  reopenPaymentRelease,
  requestConsultantInvoice,
  requestMonthlyInvoices,
  sendPaymentForecast,
} from "@/app/app/pagamentos/actions";
import { InvoiceUploadForm } from "./InvoiceUploadForm";

/** Human labels for the "solicitar NF" outcomes (per-payment). */
const invoiceRequestLabels: Record<string, string> = {
  SENT: "NF solicitada ao consultor.",
  SKIPPED_ALREADY_SENT: "NF já havia sido solicitada.",
  NOT_PJ: "Contrato não é PJ — sem solicitação de NF.",
  NOT_ELIGIBLE: "Pagamento não está elegível para solicitar NF.",
  NOT_RELEASED: "O DP ainda não liberou este pagamento.",
  INVOICE_ALREADY_RECEIVED:
    "A NF já estava anexada: o pagamento foi para NF recebida (sem e-mail).",
  REQUESTED_NO_EMAIL:
    "Solicitação registrada (CLT Flex não recebe o e-mail de NF).",
  SKIPPED_NO_RULE: "Sem regra de notificação configurada para o e-mail.",
};

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
  PEOPLE_RELEASED: "info",
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
  /**
   * Rota do Excel já com o filtro aplicado (mês/ano/contratação). Ausente =
   * sem export (o DP não exporta: o arquivo traz dados bancários).
   */
  exportHref?: string;
  /**
   * Exceções dos lançamentos de cada pagamento (fim de semana, feriado,
   * atividade fora do Dia Útil), por paymentId. Sinal para o DP; não bloqueia.
   */
  exceptionsByPayment?: Record<string, EntryExceptionSummary>;
  /**
   * Flags calculadas no SERVIDOR (Matriz + papéis). Só decidem o que a tela
   * oferece — o gate real é server-side em cada action.
   */
  permissions?: ConsultantPaymentsPermissions;
}

export interface ConsultantPaymentsPermissions {
  /** PAGAMENTOS_LIBERACAO_DP edit (DP/People). */
  canPeopleRelease: boolean;
  /** PAGAMENTOS_ENVIO_NF edit (Financeiro). */
  canRequestInvoice: boolean;
  /** PAGAMENTOS_REABRIR_LIBERACAO edit (só Financeiro). */
  canReopenRelease: boolean;
  /** FINANCIAL_ROLES: NF, aprovação, banco, pago, previsão. */
  canOperateFinance: boolean;
}

const DEFAULT_PERMISSIONS: ConsultantPaymentsPermissions = {
  canPeopleRelease: false,
  canRequestInvoice: false,
  canReopenRelease: false,
  canOperateFinance: true,
};

type StatusFilter = ConsultantPaymentView["status"] | "ALL";

export function ConsultantPaymentsPanel({
  mode,
  month,
  year,
  payments,
  exportHref,
  exceptionsByPayment,
  permissions = DEFAULT_PERMISSIONS,
}: ConsultantPaymentsPanelProps) {
  const isDemo = mode === "demo";
  const {
    canPeopleRelease,
    canRequestInvoice,
    canReopenRelease,
    canOperateFinance,
  } = permissions;
  const canSelect = canPeopleRelease || canRequestInvoice;
  // Filtro rápido pelo stepper (client-side, sobre o mês carregado).
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("ALL");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  // Modal de REABRIR LIBERAÇÃO (só Financeiro): justificativa obrigatória.
  const [reopenTarget, setReopenTarget] =
    useState<ConsultantPaymentView | null>(null);
  const [reopenObs, setReopenObs] = useState("");
  const [reopenError, setReopenError] = useState<string | null>(null);
  // Confirmação da liberação em massa: ids-alvo já resolvidos (seleção, tela
  // filtrada ou mês inteiro) + contagem exibida no diálogo.
  const [releaseConfirm, setReleaseConfirm] = useState<{
    target: { paymentIds: string[] } | "MONTH";
    count: number;
    scope: string;
  } | null>(null);
  const [isPending, startTransition] = useTransition();
  const { feedback, notify } = useFeedback();
  const [forecastTarget, setForecastTarget] =
    useState<ConsultantPaymentView | null>(null);
  const [expectedPaymentAt, setExpectedPaymentAt] = useState("");
  const [responseDeadlineAt, setResponseDeadlineAt] = useState("");
  const [uploadTarget, setUploadTarget] =
    useState<ConsultantPaymentView | null>(null);
  const statusCounts = useMemo(() => {
    const counts = new Map<ConsultantPaymentView["status"], number>();
    for (const payment of payments) {
      counts.set(payment.status, (counts.get(payment.status) ?? 0) + 1);
    }
    return counts;
  }, [payments]);
  const visiblePayments = useMemo(
    () =>
      statusFilter === "ALL"
        ? payments
        : payments.filter((payment) => payment.status === statusFilter),
    [payments, statusFilter],
  );
  const total = useMemo(
    () =>
      visiblePayments.reduce((sum, payment) => sum + payment.totalAmount, 0),
    [visiblePayments],
  );
  // Seleção efetiva = selecionados que ainda estão visíveis.
  const selectedIds = visiblePayments
    .filter((payment) => selected.has(payment.id))
    .map((payment) => payment.id);

  function toggleSelected(id: string) {
    setSelected((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleAllVisible() {
    setSelected((current) => {
      const allSelected =
        visiblePayments.length > 0 &&
        visiblePayments.every((payment) => current.has(payment.id));
      return allSelected
        ? new Set()
        : new Set(visiblePayments.map((payment) => payment.id));
    });
  }

  function releaseByPeople(target: { paymentIds: string[] } | "MONTH") {
    if (isDemo) {
      notify("info", "Liberação do DP local simulada.");
      return;
    }
    startTransition(async () => {
      const result = await releaseConsultantPaymentByPeople(
        target === "MONTH" ? { month, year } : target,
      );
      if (result.ok) {
        const {
          released,
          skipped,
          waitingOperationClosing,
          waitingProjects,
          invoiceAlreadyReceived,
        } = result.data;
        const extras = [
          skipped > 0 ? `${skipped} ignorado(s) (fora de "Aguardando DP")` : null,
          waitingOperationClosing > 0
            ? `${waitingOperationClosing} aguardando fechamento operacional (${waitingProjects.join(", ")})`
            : null,
          invoiceAlreadyReceived > 0
            ? `${invoiceAlreadyReceived} já com NF anexada (foram para NF recebida)`
            : null,
        ].filter(Boolean);
        notify(
          released > 0 ? "success" : "info",
          `Liberação do DP: ${released} liberado(s)${extras.length > 0 ? ` · ${extras.join(" · ")}` : ""}.${released > 0 ? " O Financeiro foi avisado." : ""}`,
        );
        setSelected(new Set());
      } else {
        notify("warning", result.message);
      }
    });
  }

  /**
   * Abre a confirmação da liberação em massa. Com seleção → os selecionados;
   * com a tela filtrada pelo stepper → os ids VISÍVEIS (nunca o mês inteiro);
   * sem filtro → o mês. A contagem mostrada é a de "Aguardando DP" no alvo.
   */
  function openBulkRelease() {
    const openOf = (list: ConsultantPaymentView[]) =>
      list.filter((payment) => payment.status === "OPEN");
    if (selectedIds.length > 0) {
      const ids = new Set(selectedIds);
      const targets = openOf(visiblePayments.filter((p) => ids.has(p.id)));
      setReleaseConfirm({
        target: { paymentIds: targets.map((p) => p.id) },
        count: targets.length,
        scope: "selecionados",
      });
      return;
    }
    if (statusFilter !== "ALL") {
      const targets = openOf(visiblePayments);
      setReleaseConfirm({
        target: { paymentIds: targets.map((p) => p.id) },
        count: targets.length,
        scope: `filtro "${consultantPaymentStatusLabels[statusFilter]}"`,
      });
      return;
    }
    setReleaseConfirm({
      target: "MONTH",
      count: openOf(payments).length,
      scope: `competência ${formatMonth(month, year)}`,
    });
  }

  function confirmBulkRelease() {
    const pending = releaseConfirm;
    setReleaseConfirm(null);
    if (!pending || pending.count === 0) return;
    releaseByPeople(pending.target);
  }

  function openReopen(payment: ConsultantPaymentView) {
    setReopenTarget(payment);
    setReopenObs("");
    setReopenError(null);
  }

  function confirmReopen() {
    const target = reopenTarget;
    if (!target) return;
    const justification = reopenObs.trim();
    if (justification.length < 3) {
      setReopenError("Informe a justificativa da reabertura.");
      return;
    }
    if (isDemo) {
      notify("info", "Reabertura local simulada.");
      setReopenTarget(null);
      return;
    }
    startTransition(async () => {
      const result = await reopenPaymentRelease({
        paymentId: target.id,
        justification,
      });
      if (result.ok) {
        notify("success", "Liberação reaberta: o pagamento voltou para Aguardando DP.");
        setReopenTarget(null);
      } else {
        setReopenError(result.message);
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

  function requestInvoice(payment: ConsultantPaymentView) {
    if (isDemo) {
      notify("info", "Solicitação de NF local simulada.");
      return;
    }
    startTransition(async () => {
      const result = await requestConsultantInvoice({ paymentId: payment.id });
      if (result.ok) {
        const label =
          invoiceRequestLabels[result.data.status] ??
          `Solicitação processada (${result.data.status}).`;
        notify(result.data.status === "SENT" ? "success" : "info", label);
      } else {
        notify("warning", result.message);
      }
    });
  }

  function requestMonthInvoices(paymentIds?: string[]) {
    if (isDemo) {
      notify("info", "Solicitação de NF local simulada.");
      return;
    }
    startTransition(async () => {
      const result = await requestMonthlyInvoices({ month, year, paymentIds });
      if (result.ok) {
        const {
          eligible,
          sent,
          skipped,
          notReleased,
          alreadyRequested,
          invoiceAlreadyReceived,
        } = result.data;
        const extras = [
          skipped > 0 ? `${skipped} sem envio` : null,
          invoiceAlreadyReceived > 0
            ? `${invoiceAlreadyReceived} já com NF anexada`
            : null,
          notReleased > 0 ? `${notReleased} aguardando DP` : null,
          alreadyRequested > 0 ? `${alreadyRequested} já solicitado(s)` : null,
        ].filter(Boolean);
        notify(
          sent > 0 ? "success" : "info",
          `Solicitação de NF: ${sent} enviada(s) de ${eligible} liberado(s) pelo DP${extras.length > 0 ? ` · ${extras.join(" · ")}` : ""}.`,
        );
        setSelected(new Set());
      } else {
        notify("warning", result.message);
      }
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

  const selectColumn: DataTableColumn<ConsultantPaymentView> = {
    key: "select",
    header: (
      <input
        type="checkbox"
        aria-label="Selecionar todos os pagamentos visíveis"
        checked={
          visiblePayments.length > 0 &&
          visiblePayments.every((payment) => selected.has(payment.id))
        }
        onChange={toggleAllVisible}
        className={cn("size-4 accent-[var(--color-ink)]", focusRing)}
      />
    ),
    cell: (payment) => (
      <input
        type="checkbox"
        aria-label={`Selecionar ${payment.consultantName}`}
        checked={selected.has(payment.id)}
        onChange={() => toggleSelected(payment.id)}
        className={cn("size-4 accent-[var(--color-ink)]", focusRing)}
      />
    ),
  };

  const columns: DataTableColumn<ConsultantPaymentView>[] = [
    ...(canSelect ? [selectColumn] : []),
    {
      key: "consultant",
      header: "Consultor",
      cell: (payment) => (
        <div>
          <p className="font-medium text-strong">{payment.consultantName}</p>
          <p className="text-xs text-soft">
            {contractTypeLabels[payment.contractType]}
          </p>
          {exceptionsByPayment?.[payment.id] ? (
            <EntryExceptionCountBadge
              className="mt-1"
              count={exceptionsByPayment[payment.id].count}
              lines={exceptionsByPayment[payment.id].lines}
            />
          ) : null}
        </div>
      ),
    },
    {
      key: "cnpj",
      header: "CNPJ",
      cell: (payment) => (
        <span className="text-xs tabular-nums text-medium">
          {payment.cnpj ?? "—"}
        </span>
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
        <div className="space-y-1">
          <StatusBadge tone={toneByStatus[payment.status]}>
            {consultantPaymentStatusLabels[payment.status]}
          </StatusBadge>
          {payment.peopleReleasedAt ? (
            <p className="text-xs text-soft">
              DP liberou {formatDate(payment.peopleReleasedAt)}
            </p>
          ) : null}
          {payment.invoiceRequestSentAt ? (
            <p className="text-xs text-soft">
              NF solicitada {formatDate(payment.invoiceRequestSentAt)}
            </p>
          ) : null}
        </div>
      ),
    },
    {
      key: "invoice",
      header: "Nota fiscal",
      cell: (payment) => (
        <div className="space-y-1.5">
          {payment.invoiceAmount != null ? (
            <p className="text-xs tabular-nums text-medium">
              {formatCurrencyPrecise(payment.invoiceAmount)}
              {payment.invoiceAttachmentCount > 0
                ? ` · ${payment.invoiceAttachmentCount} anexo(s)`
                : ""}
            </p>
          ) : payment.invoiceAttachmentCount > 0 ? (
            <p className="text-xs text-medium">
              {payment.invoiceAttachmentCount} anexo(s)
            </p>
          ) : (
            <p className="text-xs text-soft">Sem NF</p>
          )}
          {(canOperateFinance ? payment.invoiceAttachments : []).map((attachment) => (
            <a
              key={attachment.id}
              href={`/api/pagamentos/nf?id=${encodeURIComponent(attachment.id)}`}
              className={cn(
                "flex items-center gap-1.5 text-xs font-medium text-brand-dark hover:underline",
                focusRing,
              )}
            >
              <Download aria-hidden="true" className="size-3.5 shrink-0" />
              <span className="max-w-[12rem] truncate">
                {attachment.fileName}
              </span>
            </a>
          ))}
          {payment.invoiceDivergence?.isDivergent ? (
            <StatusBadge tone="warning">
              <TriangleAlert aria-hidden="true" className="size-3.5" />
              NF diverge{" "}
              {formatPercent(payment.invoiceDivergence.diffPct * 100)}
            </StatusBadge>
          ) : null}
        </div>
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
          {/* Etapa DP: liberar (Aguardando DP → Liberado pelo DP). */}
          {canPeopleRelease && payment.status === "OPEN" ? (
            <ActionButton
              size="sm"
              variant="primary"
              icon={UserCheck}
              disabled={isPending}
              onClick={() => releaseByPeople({ paymentIds: [payment.id] })}
            >
              Liberar (DP)
            </ActionButton>
          ) : null}
          {/* Etapa Financeiro: solicitação de NF (só após a liberação). */}
          {canRequestInvoice &&
          payment.contractType !== "CLT" &&
          payment.status === "PEOPLE_RELEASED" ? (
            <ActionButton
              size="sm"
              variant="primary"
              icon={Send}
              disabled={isPending}
              onClick={() => requestInvoice(payment)}
            >
              Enviar solicitação de NF
            </ActionButton>
          ) : null}
          {canRequestInvoice &&
          payment.contractType === "PJ" &&
          payment.status === "WAITING_FOR_INVOICE" ? (
            <ActionButton
              size="sm"
              variant="secondary"
              icon={Send}
              disabled={isPending}
              onClick={() => requestInvoice(payment)}
            >
              Reenviar NF
            </ActionButton>
          ) : null}
          {canReopenRelease && canReopenPeopleRelease(payment) ? (
            <ActionButton
              size="sm"
              variant="danger"
              icon={Undo2}
              disabled={isPending}
              onClick={() => openReopen(payment)}
            >
              Reabrir liberação
            </ActionButton>
          ) : null}
          {canOperateFinance &&
          (payment.status === "OPEN" ||
            payment.status === "PEOPLE_RELEASED" ||
            payment.status === "WAITING_FOR_INVOICE" ||
            payment.status === "INVOICE_RECEIVED") ? (
            <ActionButton
              size="sm"
              variant={payment.id === uploadTarget?.id ? "primary" : "secondary"}
              icon={Upload}
              disabled={isPending}
              onClick={() =>
                setUploadTarget((current) =>
                  current?.id === payment.id ? null : payment,
                )
              }
            >
              Anexar NF
            </ActionButton>
          ) : null}
          {canOperateFinance &&
          (payment.status === "OPEN" || payment.status === "PEOPLE_RELEASED") ? (
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
          ) : null}
          {canOperateFinance &&
          payment.contractType === "CLT" &&
          payment.status === "PEOPLE_RELEASED" ? (
            <ActionButton
              size="sm"
              variant="secondary"
              icon={CheckCircle2}
              disabled={isPending}
              onClick={() => advance(payment, "APPROVE_CLT_PAYMENT")}
            >
              Aprovar
            </ActionButton>
          ) : null}
          {canOperateFinance &&
          payment.contractType !== "CLT" &&
          payment.status === "WAITING_FOR_INVOICE" ? (
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
          {canOperateFinance && payment.status === "INVOICE_RECEIVED" ? (
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
          {canOperateFinance && payment.status === "INVOICE_VALIDATED" ? (
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
          {canOperateFinance && payment.status === "APPROVED_FOR_PAYMENT" ? (
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
          {canOperateFinance && payment.status === "SENT_TO_BANK" ? (
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
          {canOperateFinance && payment.status === "PROCESSED" ? (
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
      <PaymentFlowStepper
        counts={statusCounts}
        total={payments.length}
        active={statusFilter}
        onSelect={(next) => {
          setStatusFilter((current) => (current === next ? "ALL" : next));
        }}
      />
      <SectionPanel
        title="Pagamentos de consultores"
        description={`Competencia ${formatMonth(month, year)}${statusFilter === "ALL" ? "" : ` · ${consultantPaymentStatusLabels[statusFilter]}`}`}
        action={
          <div className="flex flex-wrap items-center gap-3">
            <span className="text-sm font-semibold tabular-nums text-strong">
              {formatCurrency(total)}
            </span>
            {isDemo || !exportHref ? null : (
              <a
                href={exportHref}
                className="inline-flex h-8 items-center justify-center gap-2 rounded-md bg-surface px-3 text-xs font-semibold text-strong shadow-[2px_2px_0_0_var(--color-ink)]"
              >
                <Download aria-hidden="true" className="size-4" />
                Exportar Excel
              </a>
            )}
            {canPeopleRelease ? (
              <ActionButton
                size="sm"
                variant="secondary"
                icon={UserCheck}
                disabled={isPending}
                onClick={openBulkRelease}
              >
                {selectedIds.length > 0
                  ? `Liberar selecionados (${selectedIds.length})`
                  : statusFilter !== "ALL"
                    ? "Liberar filtrados (DP)"
                    : "Liberar mês (DP)"}
              </ActionButton>
            ) : null}
            {canRequestInvoice ? (
              <ActionButton
                size="sm"
                variant="secondary"
                icon={Send}
                disabled={isPending}
                onClick={() =>
                  requestMonthInvoices(
                    selectedIds.length > 0 ? selectedIds : undefined,
                  )
                }
              >
                {selectedIds.length > 0
                  ? `Solicitar NF dos selecionados (${selectedIds.length})`
                  : "Solicitar NF do mês"}
              </ActionButton>
            ) : null}
          </div>
        }
      >
        <DataTable
          columns={columns}
          rows={visiblePayments}
          rowKey={(payment) => payment.id}
          caption="Pagamentos de consultores"
        />
      </SectionPanel>
      <Modal
        open={releaseConfirm != null}
        onClose={() => setReleaseConfirm(null)}
        title="Confirmar liberação do DP"
        description={releaseConfirm ? `Alvo: ${releaseConfirm.scope}` : undefined}
        footer={
          <>
            <ActionButton
              variant="secondary"
              size="sm"
              onClick={() => setReleaseConfirm(null)}
            >
              Voltar
            </ActionButton>
            <ActionButton
              variant="primary"
              size="sm"
              icon={UserCheck}
              disabled={isPending || (releaseConfirm?.count ?? 0) === 0}
              onClick={confirmBulkRelease}
            >
              {`Liberar ${releaseConfirm?.count ?? 0} pagamento(s)`}
            </ActionButton>
          </>
        }
      >
        <p className="text-sm text-medium">
          {releaseConfirm && releaseConfirm.count > 0
            ? `${releaseConfirm.count} pagamento(s) em "Aguardando DP" serão liberados para o Financeiro. Pagamentos de projetos sem fechamento operacional no mês são mantidos e informados no retorno.`
            : 'Nenhum pagamento em "Aguardando DP" no alvo atual.'}
        </p>
      </Modal>
      <Modal
        open={reopenTarget != null}
        onClose={() => setReopenTarget(null)}
        title="Reabrir liberação do DP"
        description={
          reopenTarget
            ? `${reopenTarget.consultantName} — ${formatMonth(reopenTarget.month, reopenTarget.year)}`
            : undefined
        }
        footer={
          <>
            <ActionButton
              variant="secondary"
              size="sm"
              onClick={() => setReopenTarget(null)}
            >
              Voltar
            </ActionButton>
            <ActionButton
              variant="primary"
              size="sm"
              icon={Undo2}
              disabled={isPending}
              onClick={confirmReopen}
            >
              Reabrir liberação
            </ActionButton>
          </>
        }
      >
        <label className="block text-sm font-medium text-medium">
          Justificativa (obrigatório)
          <textarea
            value={reopenObs}
            onChange={(event) => {
              setReopenObs(event.target.value);
              if (reopenError) setReopenError(null);
            }}
            rows={3}
            placeholder="Motivo da devolução ao DP..."
            className={cn(
              "mt-1 w-full rounded-md border border-border bg-surface px-3 py-2 text-sm text-strong",
              focusRingInput,
              reopenError && "border-danger",
            )}
          />
        </label>
        {reopenError ? (
          <p className="mt-1 text-xs font-medium text-danger">{reopenError}</p>
        ) : (
          <p className="mt-1 text-xs text-soft">
            O pagamento volta para &quot;Aguardando DP&quot; (só é possível antes do
            recebimento da NF). A justificativa fica na auditoria e o DP é avisado.
          </p>
        )}
      </Modal>
      {uploadTarget ? (
        <SectionPanel
          title="Anexar nota fiscal"
          description={`${uploadTarget.consultantName} — ${formatMonth(uploadTarget.month, uploadTarget.year)}`}
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
              disabled={isDemo}
              onResult={(ok, message) => {
                notify(ok ? "success" : "warning", message);
                if (ok) setUploadTarget(null);
              }}
            />
          </div>
        </SectionPanel>
      ) : null}
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

/**
 * Stepper/legenda do fluxo (governança Fluxo de Horas): cada etapa mostra a
 * contagem do mês e quem age nela; clicar filtra a tabela pela etapa.
 */
function PaymentFlowStepper({
  counts,
  total,
  active,
  onSelect,
}: {
  counts: Map<ConsultantPaymentView["status"], number>;
  total: number;
  active: StatusFilter;
  onSelect: (status: ConsultantPaymentView["status"]) => void;
}) {
  const cancelled = counts.get("CANCELLED") ?? 0;
  const processed = counts.get("PROCESSED") ?? 0;
  return (
    <nav
      aria-label="Etapas do fluxo de pagamento"
      className="rounded-md border border-border bg-surface p-3"
    >
      <ol className="flex flex-wrap items-stretch gap-2">
        {consultantPaymentFlowSteps.map((step, index) => {
          // Cada etapa conta só o próprio status (Processado/Cancelado na nota).
          const count = counts.get(step.status) ?? 0;
          const isActive = active === step.status;
          return (
            <li key={step.status} className="flex items-center gap-2">
              {index > 0 ? (
                <span aria-hidden="true" className="text-soft">
                  →
                </span>
              ) : null}
              <button
                type="button"
                onClick={() => onSelect(step.status)}
                aria-pressed={isActive}
                className={cn(
                  "flex flex-col items-start rounded-md border px-3 py-1.5 text-left transition-colors",
                  isActive
                    ? "border-brand bg-surface-muted ring-1 ring-brand/30"
                    : "border-border hover:border-brand/60 hover:bg-surface-muted",
                  focusRing,
                )}
              >
                <span className="flex items-baseline gap-1.5">
                  <span className="text-sm font-semibold tabular-nums text-strong">
                    {count}
                  </span>
                  <span className="text-xs font-medium text-strong">
                    {step.label}
                  </span>
                </span>
                <span className="text-[11px] text-soft">
                  {step.owner === "Concluído" ? "Concluído" : `Com: ${step.owner}`}
                </span>
              </button>
            </li>
          );
        })}
      </ol>
      <p className="mt-2 text-xs text-soft">
        {total} pagamento(s) no mês
        {processed > 0 ? ` · ${processed} processado(s) aguardando confirmação` : ""}
        {cancelled > 0 ? ` · ${cancelled} cancelado(s)` : ""}. O DP libera; o
        Financeiro envia a solicitação de NF e só ele reabre uma liberação.
      </p>
    </nav>
  );
}
