"use client";

import { useState, useTransition } from "react";
import {
  CheckCircle2,
  Download,
  FileCheck2,
  FilePlus2,
  FileText,
  Lock,
  Mail,
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
import { formatCurrency, formatCurrencyPrecise, formatHours } from "@/lib/format";
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
}: MonthlyClosingTableProps) {
  const isDemo = mode === "demo";
  const [isPending, startTransition] = useTransition();
  const { feedback, notify } = useFeedback();
  const [preview, setPreview] = useState<{
    html: string;
    downloadUrl: string | null;
    stored: boolean;
  } | null>(null);
  // D4 (Onda B): liberar o faturamento para o financeiro (transição CLOSE) exige
  // justificativa. Capturamos num diálogo do design system (nunca window.confirm).
  const [closeDialog, setCloseDialog] = useState<{ id: string } | null>(null);
  const [justification, setJustification] = useState("");
  const [justificationError, setJustificationError] = useState<string | null>(
    null,
  );

  function openCloseDialog(id: string) {
    if (isDemo) {
      notify("info", "Transicao local simulada.");
      return;
    }
    setJustification("");
    setJustificationError(null);
    setCloseDialog({ id });
  }

  function dismissCloseDialog() {
    setCloseDialog(null);
    setJustification("");
    setJustificationError(null);
  }

  function handleConfirmClose() {
    if (!closeDialog) return;
    const text = justification.trim();
    if (!text) {
      setJustificationError(
        "Informe uma justificativa para liberar o faturamento para o financeiro.",
      );
      return;
    }
    const id = closeDialog.id;
    startTransition(async () => {
      const result = await advanceRevenueClosing({
        id,
        action: "CLOSE",
        justification: text,
      });
      if (result.ok) {
        notify("success", "Faturamento liberado para o financeiro.");
        setCloseDialog(null);
        setJustification("");
        setJustificationError(null);
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
          "success",
          result.data.stored
            ? "Pre-fatura gerada e armazenada."
            : "Pre-fatura gerada (visualizacao em tela; storage nao configurado).",
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
        notify(
          "success",
          result.data.alreadySent
            ? "Pre-fatura ja havia sido enviada ao cliente."
            : "Pre-fatura enviada ao cliente.",
        );
      } else {
        notify("warning", result.message);
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
          <p className="font-medium text-strong">{r.projectName}</p>
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
                onClick={() => handleAdvance(r.id, "REVERT_TO_OPEN")}
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
                onClick={() => openCloseDialog(r.id)}
              >
                Liberar faturamento
              </ActionButton>
              <ActionButton
                size="sm"
                variant="secondary"
                icon={Undo2}
                disabled={isPending}
                onClick={() => handleAdvance(r.id, "REVERT_TO_REVIEW")}
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
              onClick={() => handleAdvance(r.id, "REOPEN")}
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
          <iframe
            title="Pre-fatura"
            srcDoc={preview.html}
            className="h-[60vh] w-full rounded-md border border-border bg-white"
          />
        ) : null}
      </Modal>

      <Modal
        open={closeDialog != null}
        onClose={dismissCloseDialog}
        title="Liberar faturamento para o financeiro"
        description="Fecha o fechamento de receita e o entrega ao financeiro (libera pre-fatura e NFS-e). A justificativa fica registrada na trilha de auditoria."
        footer={
          <>
            <ActionButton
              size="sm"
              variant="secondary"
              disabled={isPending}
              onClick={dismissCloseDialog}
            >
              Cancelar
            </ActionButton>
            <ActionButton
              size="sm"
              variant="primary"
              icon={Lock}
              disabled={isPending}
              onClick={handleConfirmClose}
            >
              Liberar faturamento
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
          placeholder="Ex.: Horas conferidas e aprovadas; valores conferem com o contrato."
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
