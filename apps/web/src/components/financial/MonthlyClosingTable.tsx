"use client";

import { useState, useTransition } from "react";
import {
  AlertTriangle,
  CheckCircle2,
  Download,
  FileCheck2,
  FilePlus2,
  FileText,
  Lock,
  Mail,
  Paperclip,
  RotateCw,
  Undo2,
  Users,
} from "lucide-react";
import { ActionButton } from "@/components/ui/ActionButton";
import { DataTable, type DataTableColumn } from "@/components/ui/DataTable";
import { FeedbackBanner, useFeedback } from "@/components/ui/Feedback";
import { Modal } from "@/components/ui/Modal";
import { SectionPanel } from "@/components/ui/SectionPanel";
import { StatusBadge, type StatusTone } from "@/components/ui/StatusBadge";
import { focusRingInput } from "@/lib/styles";
import { cn } from "@/lib/utils";
import {
  formatCurrency,
  formatCurrencyPrecise,
  formatDate,
  formatHours,
} from "@/lib/format";
import {
  fiscalDocumentStatusLabels,
  revenueClosingStatusLabels,
  type RevenueClosingRow,
  type RevenueClosingStatus,
} from "@/lib/financial/types";
import {
  advanceRevenueClosing,
  createFiscalDocumentDraft,
  generateMonthlyRevenueClosings,
  generatePreInvoice,
  requestFiscalDocumentIssue,
  sendClientBillingSummary,
  sendPreInvoiceEmail,
} from "@/app/app/financeiro/actions";
import { getTimeEntryAttachmentUrl } from "@/app/app/horas/actions";
import { activityLabelOf } from "@/lib/timesheet/types";
import { opportunityTypeLabels } from "@/lib/projects/labels";
import type {
  RevenueExceptionEntry,
  RevenueExceptionsByProject,
} from "@/lib/db/period-exceptions";

const toneByStatus: Record<RevenueClosingStatus, StatusTone> = {
  OPEN: "neutral",
  IN_REVIEW: "warning",
  READY_TO_CLOSE: "info",
  CLOSED: "success",
  INVOICED: "success",
  CANCELLED: "danger",
};

export interface MonthlyClosingTableProps {
  mode: "demo" | "db";
  rows: RevenueClosingRow[];
  month: number;
  year: number;
  monthLabel: string;
  /**
   * Time-entry exceptions of the period grouped by projectId (P5). Drives the
   * per-line "Exceções" indicator + drill-down. Absent in demo mode.
   */
  exceptionsByProject?: RevenueExceptionsByProject;
}

/**
 * Monthly closing table: only approved hours feed it; amount = hours x rate.
 * In DB mode, transitions are guarded by server actions and audited.
 */
export function MonthlyClosingTable({
  mode,
  rows,
  month,
  year,
  monthLabel,
  exceptionsByProject,
}: MonthlyClosingTableProps) {
  const isDemo = mode === "demo";
  const [isPending, startTransition] = useTransition();
  const { feedback, notify } = useFeedback();
  const [preview, setPreview] = useState<{
    html: string;
    downloadUrl: string | null;
    stored: boolean;
  } | null>(null);
  // P5: drill-down das exceções de uma linha (cliente-projeto) do fechamento.
  const [exceptionsDialog, setExceptionsDialog] = useState<{
    title: string;
    entries: RevenueExceptionEntry[];
  } | null>(null);

  function viewEntryAttachment(id: string) {
    startTransition(async () => {
      const result = await getTimeEntryAttachmentUrl({ id });
      if (result.ok) window.open(result.data.url, "_blank", "noopener");
      else notify("warning", result.message);
    });
  }
  // D4 (Onda B) + P16 (Onda 4): transições sensíveis do fechamento exigem uma
  // justificativa registrada (CLOSE "liberar faturamento" e as REVERSAS: voltar
  // status / reabrir). Capturamos num diálogo do design system (nunca
  // window.confirm). Um único diálogo parametrizado por ação.
  type JustifyAction = "CLOSE" | "REVERT_TO_OPEN" | "REVERT_TO_REVIEW" | "REOPEN";
  const justifyDialogCopy: Record<
    JustifyAction,
    { title: string; description: string; confirm: string; success: string }
  > = {
    CLOSE: {
      title: "Liberar faturamento para o financeiro",
      description:
        "Fecha o fechamento de receita e o entrega ao financeiro (libera pre-fatura e NFS-e). A justificativa fica registrada na trilha de auditoria.",
      confirm: "Liberar faturamento",
      success: "Faturamento liberado para o financeiro.",
    },
    REVERT_TO_OPEN: {
      title: "Voltar status para Aberto",
      description:
        "Desfaz o envio para revisão, retornando o fechamento a Aberto. A justificativa fica registrada na trilha de auditoria.",
      confirm: "Voltar status",
      success: "Status revertido para Aberto.",
    },
    REVERT_TO_REVIEW: {
      title: "Voltar status para Em revisão",
      description:
        "Desfaz a marcação de Pronto, retornando o fechamento a Em revisão. A justificativa fica registrada na trilha de auditoria.",
      confirm: "Voltar status",
      success: "Status revertido para Em revisão.",
    },
    REOPEN: {
      title: "Reabrir fechamento",
      description:
        "Reabre um fechamento fechado (volta a Pronto para liberar). A justificativa fica registrada na trilha de auditoria.",
      confirm: "Reabrir fechamento",
      success: "Fechamento reaberto.",
    },
  };
  const [justifyDialog, setJustifyDialog] = useState<{
    id: string;
    action: JustifyAction;
  } | null>(null);
  const [justification, setJustification] = useState("");
  const [justificationError, setJustificationError] = useState<string | null>(
    null,
  );

  function openJustifyDialog(id: string, action: JustifyAction) {
    if (isDemo) {
      notify("info", "Transicao local simulada.");
      return;
    }
    setJustification("");
    setJustificationError(null);
    setJustifyDialog({ id, action });
  }

  function dismissJustifyDialog() {
    setJustifyDialog(null);
    setJustification("");
    setJustificationError(null);
  }

  function handleConfirmJustify() {
    if (!justifyDialog) return;
    const text = justification.trim();
    if (!text) {
      setJustificationError(
        justifyDialog.action === "CLOSE"
          ? "Informe uma justificativa para liberar o faturamento para o financeiro."
          : "Informe uma justificativa para alterar o status deste fechamento.",
      );
      return;
    }
    const { id, action } = justifyDialog;
    startTransition(async () => {
      const result = await advanceRevenueClosing({ id, action, justification: text });
      if (result.ok) {
        notify("success", justifyDialogCopy[action].success);
        dismissJustifyDialog();
      } else {
        setJustificationError(result.message);
      }
    });
  }

  function handlePreInvoice(id: string) {
    if (isDemo) {
      notify("info", "Pre-fatura local simulada.");
      return;
    }
    startTransition(async () => {
      const result = await generatePreInvoice({ closingId: id });
      if (result.ok) {
        setPreview({
          html: result.data.html,
          downloadUrl: result.data.downloadUrl,
          stored: result.data.stored,
        });
        notify(
          result.data.stored ? "success" : "info",
          result.data.stored
            ? "Pré-fatura gerada e armazenada."
            : "Armazenamento não configurado: a pré-fatura foi gerada apenas para visualização. Baixe o HTML para arquivar.",
        );
      } else {
        notify("warning", result.message);
      }
    });
  }

  function handleSendPreInvoice(id: string) {
    if (isDemo) {
      notify("info", "Envio de pre-fatura local simulado.");
      return;
    }
    startTransition(async () => {
      const result = await sendPreInvoiceEmail({ closingId: id });
      if (result.ok) {
        if (result.data.alreadySent) {
          notify("info", "Pré-fatura já havia sido enviada ao cliente.");
        } else if (result.data.emailed) {
          notify("success", "Pré-fatura enviada ao cliente.");
        } else {
          // Envio suprimido pela regra de notificação PRE_INVOICE_ISSUED
          // (desligada / sem destinatário): não fingimos que enviou.
          notify(
            "info",
            "Envio de pré-fatura está desativado nas regras de notificação. Gere a pré-fatura e baixe o HTML para enviar manualmente.",
          );
        }
      } else {
        // Degrade acionável conhecido (P3): cliente sem e-mail de contato.
        // sendPreInvoiceEmail nunca emite NO_EMAIL/NO_STORAGE (o transporte cai
        // para console quando não configurado), então não mapeamos códigos
        // inexistentes — os demais erros usam a mensagem do servidor.
        const message =
          result.error === "NO_CONTACT_EMAIL"
            ? "Cadastre o e-mail de contato do cliente (em Clientes) para enviar a pré-fatura."
            : result.message;
        notify("warning", message);
      }
    });
  }

  function handleDownloadPreview() {
    if (!preview) return;
    const blob = new Blob([preview.html], { type: "text/html;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = "pre-fatura.html";
    anchor.click();
    URL.revokeObjectURL(url);
  }

  function handleGenerate() {
    if (isDemo) {
      notify("info", "Geracao local simulada.");
      return;
    }
    startTransition(async () => {
      const result = await generateMonthlyRevenueClosings({ month, year });
      if (result.ok) {
        notify(
          "success",
          `${result.data.generated} fechamento(s) atualizado(s). ${result.data.skippedClosed} fechado(s) preservado(s).`,
        );
      } else {
        notify("warning", result.message);
      }
    });
  }

  function handleAdvance(
    id: string,
    action: Parameters<typeof advanceRevenueClosing>[0]["action"],
  ) {
    if (isDemo) {
      notify("info", "Transicao local simulada.");
      return;
    }
    startTransition(async () => {
      const result = await advanceRevenueClosing({ id, action });
      if (result.ok) notify("success", "Status atualizado.");
      else notify("warning", result.message);
    });
  }

  function handleSendApuracao(id: string) {
    if (isDemo) {
      notify("info", "Envio de apuração local simulado.");
      return;
    }
    startTransition(async () => {
      const result = await sendClientBillingSummary({ closingId: id });
      if (result.ok) notify("success", "Apuração por consultor enviada ao cliente.");
      else notify("warning", result.message);
    });
  }

  function handleFiscalDraft(id: string) {
    if (isDemo) {
      notify("info", "Rascunho fiscal local simulado.");
      return;
    }
    startTransition(async () => {
      const result = await createFiscalDocumentDraft({ closingId: id });
      if (result.ok) notify("success", "Rascunho de NFS-e criado.");
      else notify("warning", result.message);
    });
  }

  function handleFiscalRequest(id: string) {
    if (isDemo) {
      notify("info", "Solicitacao fiscal local simulada.");
      return;
    }
    startTransition(async () => {
      const result = await requestFiscalDocumentIssue({ closingId: id });
      if (result.ok) notify("success", "Solicitacao enviada ao provider.");
      else notify("warning", result.message);
    });
  }

  const columns: DataTableColumn<RevenueClosingRow>[] = [
    {
      key: "project",
      header: "Cliente / Projeto",
      cell: (r) => (
        <div>
          <div className="flex flex-wrap items-center gap-1.5">
            <p className="font-medium text-strong">{r.projectName}</p>
            {r.opportunityType ? (
              <span className="rounded-full border border-border bg-surface-muted px-2 py-0.5 text-[11px] font-medium text-medium">
                {opportunityTypeLabels[r.opportunityType]}
              </span>
            ) : null}
          </div>
          <p className="text-xs text-soft">{r.clientName}</p>
        </div>
      ),
    },
    {
      key: "hours",
      header: "Horas aprovadas",
      align: "right",
      cell: (r) => (
        <span className="text-sm tabular-nums">
          {formatHours(r.approvedHours)}
        </span>
      ),
    },
    {
      key: "rate",
      header: "Valor hora",
      align: "right",
      cell: (r) => (
        <span className="text-sm tabular-nums text-medium">
          {formatCurrencyPrecise(r.billingHourlyRate)}
        </span>
      ),
      className: "hidden sm:table-cell",
    },
    {
      key: "amount",
      header: "Total estimado",
      align: "right",
      cell: (r) => (
        <span className="text-sm font-semibold tabular-nums text-strong">
          {formatCurrency(r.amount)}
        </span>
      ),
    },
    {
      key: "status",
      header: "Status",
      cell: (r) => (
        <StatusBadge tone={toneByStatus[r.status]}>
          {revenueClosingStatusLabels[r.status]}
        </StatusBadge>
      ),
    },
    {
      key: "fiscal",
      header: "Fiscal",
      cell: (r) =>
        r.fiscalDocument ? (
          <div className="space-y-0.5">
            <StatusBadge
              tone={r.fiscalDocument.status === "ISSUED" ? "success" : "neutral"}
            >
              {fiscalDocumentStatusLabels[r.fiscalDocument.status]}
            </StatusBadge>
            {r.fiscalDocument.invoiceNumber ? (
              <p className="text-xs text-soft">
                NFS-e {r.fiscalDocument.invoiceNumber}
              </p>
            ) : null}
          </div>
        ) : (
          <span className="text-xs text-soft">Sem documento</span>
        ),
      className: "hidden lg:table-cell",
    },
    {
      key: "exceptions",
      header: "Exceções",
      cell: (r) => {
        const entries = r.projectId
          ? (exceptionsByProject?.[r.projectId] ?? [])
          : [];
        if (entries.length === 0) {
          return <span className="text-xs text-soft">—</span>;
        }
        return (
          <button
            type="button"
            className="inline-flex items-center gap-1.5 rounded-md bg-warning-soft px-2.5 py-1 text-xs font-semibold text-warning hover:brightness-95"
            onClick={() =>
              setExceptionsDialog({
                title: `${r.projectName} — ${r.clientName}`,
                entries,
              })
            }
          >
            <AlertTriangle size={14} /> {entries.length}
          </button>
        );
      },
      className: "hidden md:table-cell",
    },
    {
      key: "actions",
      header: "Acoes",
      cell: (r) => (
        <div className="flex flex-wrap gap-1.5">
          {r.status === "OPEN" ? (
            <ActionButton
              size="sm"
              variant="secondary"
              icon={FileCheck2}
              disabled={isPending}
              onClick={() => handleAdvance(r.id, "SUBMIT_REVIEW")}
            >
              Revisar
            </ActionButton>
          ) : null}
          {r.status === "IN_REVIEW" ? (
            <>
              <ActionButton
                size="sm"
                variant="secondary"
                icon={CheckCircle2}
                disabled={isPending}
                onClick={() => handleAdvance(r.id, "MARK_READY")}
              >
                Pronto
              </ActionButton>
              <ActionButton
                size="sm"
                variant="secondary"
                icon={Undo2}
                disabled={isPending}
                onClick={() => openJustifyDialog(r.id, "REVERT_TO_OPEN")}
              >
                Voltar
              </ActionButton>
            </>
          ) : null}
          {r.status === "READY_TO_CLOSE" ? (
            <>
              <ActionButton
                size="sm"
                variant="primary"
                icon={Lock}
                disabled={isPending}
                onClick={() => openJustifyDialog(r.id, "CLOSE")}
              >
                Liberar faturamento
              </ActionButton>
              <ActionButton
                size="sm"
                variant="secondary"
                icon={Undo2}
                disabled={isPending}
                onClick={() => openJustifyDialog(r.id, "REVERT_TO_REVIEW")}
              >
                Voltar
              </ActionButton>
            </>
          ) : null}
          {r.status === "CLOSED" ? (
            <ActionButton
              size="sm"
              variant="secondary"
              icon={FileText}
              disabled={isPending}
              onClick={() => handlePreInvoice(r.id)}
            >
              Pre-fatura
            </ActionButton>
          ) : null}
          {r.status === "CLOSED" ? (
            <ActionButton
              size="sm"
              variant="secondary"
              icon={Mail}
              disabled={isPending}
              onClick={() => handleSendPreInvoice(r.id)}
            >
              Enviar cliente
            </ActionButton>
          ) : null}
          {r.status === "CLOSED" || r.status === "INVOICED" ? (
            <ActionButton
              size="sm"
              variant="secondary"
              icon={Users}
              disabled={isPending}
              onClick={() => handleSendApuracao(r.id)}
            >
              Apuração
            </ActionButton>
          ) : null}
          {r.status === "CLOSED" && !r.fiscalDocument ? (
            <ActionButton
              size="sm"
              variant="secondary"
              icon={FilePlus2}
              disabled={isPending}
              onClick={() => handleFiscalDraft(r.id)}
            >
              NFS-e
            </ActionButton>
          ) : null}
          {r.status === "CLOSED" && r.fiscalDocument?.status === "DRAFT" ? (
            <ActionButton
              size="sm"
              variant="secondary"
              icon={FilePlus2}
              disabled={isPending}
              onClick={() => handleFiscalRequest(r.id)}
            >
              Solicitar
            </ActionButton>
          ) : null}
          {r.status === "CLOSED" && r.fiscalDocument?.status === "ISSUED" ? (
            <ActionButton
              size="sm"
              variant="success"
              icon={CheckCircle2}
              disabled={isPending}
              onClick={() => handleAdvance(r.id, "MARK_INVOICED")}
            >
              Faturado
            </ActionButton>
          ) : null}
          {r.status === "CLOSED" &&
          (!r.fiscalDocument || r.fiscalDocument.status === "CANCELLED") ? (
            <ActionButton
              size="sm"
              variant="danger"
              icon={Undo2}
              disabled={isPending}
              onClick={() => openJustifyDialog(r.id, "REOPEN")}
            >
              Reabrir
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
        title="Fechamento mensal"
        description={`Horas aprovadas por cliente e projeto - ${monthLabel}`}
        action={
          <ActionButton
            variant="primary"
            size="sm"
            icon={RotateCw}
            disabled={isPending}
            onClick={handleGenerate}
          >
            Gerar/recalcular
          </ActionButton>
        }
      >
        <DataTable
          columns={columns}
          rows={rows}
          rowKey={(r) => r.id}
          caption="Fechamento mensal por projeto"
        />
      </SectionPanel>

      <Modal
        open={preview != null}
        onClose={() => setPreview(null)}
        title="Pre-fatura"
        description="Validacao financeira antes da emissao fiscal. Nao constitui documento fiscal."
        className="max-w-2xl"
        footer={
          <>
            {preview?.downloadUrl ? (
              <a
                href={preview.downloadUrl}
                target="_blank"
                rel="noreferrer"
                className="text-sm font-medium text-accent underline"
              >
                Abrir artefato armazenado
              </a>
            ) : null}
            <ActionButton
              size="sm"
              variant="secondary"
              icon={Download}
              onClick={handleDownloadPreview}
            >
              Baixar HTML
            </ActionButton>
          </>
        }
      >
        {preview ? (
          <div className="space-y-3">
            {!preview.stored ? (
              <p className="rounded-md border border-warning/30 bg-warning-soft px-3 py-2 text-xs font-medium text-warning">
                Armazenamento não configurado: a pré-fatura foi gerada apenas
                para visualização e não ficou arquivada. Use “Baixar HTML” para
                guardar uma cópia.
              </p>
            ) : null}
            <iframe
              title="Pre-fatura"
              srcDoc={preview.html}
              className="h-[60vh] w-full rounded-md border border-border bg-white"
            />
          </div>
        ) : null}
      </Modal>

      <Modal
        open={exceptionsDialog != null}
        onClose={() => setExceptionsDialog(null)}
        title="Exceções do período"
        description={
          exceptionsDialog
            ? `${exceptionsDialog.title} — lançamentos aprovados fora do Dia Útil ou com anexo.`
            : undefined
        }
        className="max-w-2xl"
      >
        {exceptionsDialog ? (
          <DataTable
            columns={[
              {
                key: "date",
                header: "Data",
                cell: (e: RevenueExceptionEntry) => (
                  <span className="text-sm tabular-nums">
                    {formatDate(e.date)}
                  </span>
                ),
              },
              {
                key: "consultant",
                header: "Consultor",
                cell: (e: RevenueExceptionEntry) => (
                  <span className="text-sm text-strong">{e.consultantName}</span>
                ),
              },
              {
                key: "activity",
                header: "Atividade",
                cell: (e: RevenueExceptionEntry) => (
                  <span className="text-sm text-medium">
                    {activityLabelOf(e.activityType)}
                  </span>
                ),
              },
              {
                key: "hours",
                header: "Horas",
                align: "right",
                cell: (e: RevenueExceptionEntry) => (
                  <span className="text-sm tabular-nums">
                    {formatHours(e.hours)}
                  </span>
                ),
              },
              {
                key: "attachment",
                header: "Anexo",
                cell: (e: RevenueExceptionEntry) =>
                  e.hasAttachment ? (
                    <button
                      type="button"
                      className="inline-flex items-center gap-1 text-sm text-accent underline"
                      disabled={isPending}
                      onClick={() => viewEntryAttachment(e.id)}
                    >
                      <Paperclip size={13} /> Ver
                    </button>
                  ) : (
                    <span className="text-xs text-soft">—</span>
                  ),
              },
            ]}
            rows={exceptionsDialog.entries}
            rowKey={(e) => e.id}
            caption="Exceções do período por lançamento"
          />
        ) : null}
      </Modal>

      <Modal
        open={justifyDialog != null}
        onClose={dismissJustifyDialog}
        title={justifyDialog ? justifyDialogCopy[justifyDialog.action].title : ""}
        description={
          justifyDialog ? justifyDialogCopy[justifyDialog.action].description : ""
        }
        footer={
          <>
            <ActionButton
              size="sm"
              variant="secondary"
              disabled={isPending}
              onClick={dismissJustifyDialog}
            >
              Cancelar
            </ActionButton>
            <ActionButton
              size="sm"
              variant="primary"
              icon={Lock}
              disabled={isPending}
              onClick={handleConfirmJustify}
            >
              {justifyDialog ? justifyDialogCopy[justifyDialog.action].confirm : ""}
            </ActionButton>
          </>
        }
      >
        <label
          htmlFor="closing-justification"
          className="mb-1 block text-xs font-semibold text-medium"
        >
          Justificativa{" "}
          <span className="font-normal text-soft">(obrigatoria)</span>
        </label>
        <textarea
          id="closing-justification"
          value={justification}
          onChange={(e) => {
            setJustification(e.target.value);
            if (justificationError && e.target.value.trim().length > 0) {
              setJustificationError(null);
            }
          }}
          rows={4}
          aria-invalid={justificationError != null}
          placeholder="Ex.: Ajuste solicitado pelo cliente; correção de horas antes do fechamento."
          className={cn(
            "w-full resize-y rounded-md border border-border bg-surface px-3 py-2 text-sm text-strong placeholder:text-soft",
            focusRingInput,
            justificationError && "border-danger",
          )}
        />
        {justificationError ? (
          <p className="mt-1 text-xs font-medium text-danger">
            {justificationError}
          </p>
        ) : null}
      </Modal>
    </div>
  );
}
