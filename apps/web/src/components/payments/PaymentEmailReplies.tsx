"use client";

import { useState, useTransition } from "react";
import { ExternalLink, Eye, Mail, Paperclip } from "lucide-react";
import { getPaymentEmailRepliesAction } from "@/app/app/pagamentos/email-replies.actions";
import { Modal } from "@/components/ui/Modal";
import { prepareInboundHtmlForPreview } from "@/lib/automation/email/reply-routing-core";
import { StatusBadge } from "@/components/ui/StatusBadge";
import type { PaymentEmailReplyView } from "@/lib/payments/types";
import { focusRing } from "@/lib/styles";
import { cn } from "@/lib/utils";

const linkCls = cn(
  "inline-flex items-center gap-1 text-xs font-semibold text-brand-dark hover:underline",
  focusRing,
);

export function invoiceFileHref(attachmentId: string): string {
  return `/api/pagamentos/nf?id=${encodeURIComponent(attachmentId)}`;
}

function previewKind(contentType: string): "pdf" | "image" | null {
  if (contentType === "application/pdf") return "pdf";
  if (contentType.startsWith("image/")) return "image";
  return null;
}

function formatDateTime(iso: string): string {
  return new Date(iso).toLocaleString("pt-BR", {
    timeZone: "America/Sao_Paulo",
    dateStyle: "short",
    timeStyle: "short",
  });
}

/**
 * Visualização da NF dentro do Flow (PDF/imagem) + abrir em nova aba. O
 * arquivo vem do endpoint /api/pagamentos/nf, que checa o escopo e redireciona
 * para uma URL assinada de curta duração. XML não tem prévia: só abrir/baixar.
 */
export function InvoiceFileViewer({
  file,
  onClose,
}: {
  file: { id: string; fileName: string; contentType: string } | null;
  onClose: () => void;
}) {
  const kind = file ? previewKind(file.contentType) : null;
  return (
    <Modal
      open={file !== null}
      onClose={onClose}
      title={file?.fileName ?? "Nota fiscal"}
      className="max-w-4xl"
      headerActions={
        file ? (
          <a href={invoiceFileHref(file.id)} target="_blank" rel="noopener noreferrer" className={linkCls}>
            <ExternalLink aria-hidden className="size-3.5" /> Abrir em nova aba
          </a>
        ) : null
      }
    >
      {file ? (
        kind === "pdf" ? (
          <iframe
            title={`Prévia de ${file.fileName}`}
            src={invoiceFileHref(file.id)}
            className="h-[70vh] w-full rounded-md border border-border"
          />
        ) : kind === "image" ? (
          // eslint-disable-next-line @next/next/no-img-element -- URL assinada dinâmica
          <img
            src={invoiceFileHref(file.id)}
            alt={`Nota fiscal ${file.fileName}`}
            className="mx-auto max-h-[70vh] rounded-md border border-border"
          />
        ) : (
          <p className="text-sm text-medium">
            Este formato não tem prévia. Use “Abrir em nova aba” para ver ou baixar o arquivo.
          </p>
        )
      ) : null}
    </Modal>
  );
}

const FORWARD_LABEL: Record<PaymentEmailReplyView["forwardStatus"], string> = {
  PENDING: "Encaminhamento pendente",
  FORWARDED: "Encaminhada",
  NO_RECIPIENTS: "Sem destino de encaminhamento",
  FAILED: "Falha no encaminhamento",
};

/**
 * Botão + modal com as respostas do consultor ao e-mail de solicitação de NF:
 * remetente, data, corpo (HTML em iframe isolado, sem scripts) e as NFs que a
 * resposta trouxe. Carrega sob demanda (gate PAGAMENTOS_RESPOSTAS_EMAIL).
 */
export function PaymentEmailRepliesButton({
  paymentId,
  consultantName,
  count,
  onViewInvoice,
}: {
  paymentId: string;
  consultantName: string;
  count: number;
  onViewInvoice: (file: { id: string; fileName: string; contentType: string }) => void;
}) {
  const [open, setOpen] = useState(false);
  const [replies, setReplies] = useState<PaymentEmailReplyView[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function load() {
    setOpen(true);
    setError(null);
    startTransition(async () => {
      const result = await getPaymentEmailRepliesAction({ paymentId });
      if (!result.ok) {
        setError(result.message);
        return;
      }
      setReplies(result.data);
    });
  }

  return (
    <>
      <button type="button" className={linkCls} onClick={load}>
        <Mail aria-hidden className="size-3.5" />
        {count} resposta{count === 1 ? "" : "s"} por e-mail
      </button>
      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title={`Respostas por e-mail — ${consultantName}`}
        description="Respostas ao e-mail de solicitação de NF recebidas pelo Flow."
        className="max-w-3xl"
      >
        {pending && !replies ? (
          <p className="text-sm text-medium">Carregando…</p>
        ) : error ? (
          <p role="alert" className="text-sm font-semibold text-danger">
            {error}
          </p>
        ) : replies && replies.length === 0 ? (
          <p className="text-sm text-medium">Nenhuma resposta recebida.</p>
        ) : (
          <ol className="space-y-5">
            {(replies ?? []).map((reply) => (
              <li key={reply.id} className="space-y-3 rounded-md border border-border p-3">
                <header className="space-y-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="text-sm font-semibold text-strong">{reply.fromAddress}</p>
                    {reply.fromConsultant ? null : (
                      <StatusBadge tone="warning">Remetente diferente do consultor</StatusBadge>
                    )}
                    <StatusBadge tone={reply.forwardStatus === "FAILED" ? "danger" : "neutral"}>
                      {FORWARD_LABEL[reply.forwardStatus]}
                    </StatusBadge>
                  </div>
                  <p className="text-xs text-soft">
                    {formatDateTime(reply.receivedAt)}
                    {reply.subject ? ` · ${reply.subject}` : ""}
                    {reply.forwardedTo.length ? ` · encaminhada a ${reply.forwardedTo.join(", ")}` : ""}
                  </p>
                </header>

                {reply.invoiceAttachments.length > 0 ? (
                  <div className="space-y-1">
                    <p className="text-xs font-semibold uppercase tracking-wide text-soft">
                      NF registrada no pagamento
                    </p>
                    <ul className="space-y-1">
                      {reply.invoiceAttachments.map((file) => (
                        <li key={file.id} className="flex flex-wrap items-center gap-3 text-sm">
                          <span className="inline-flex items-center gap-1 text-ink">
                            <Paperclip aria-hidden className="size-3.5" /> {file.fileName}
                          </span>
                          <button type="button" className={linkCls} onClick={() => onViewInvoice(file)}>
                            <Eye aria-hidden className="size-3.5" /> Visualizar
                          </button>
                          <a
                            href={invoiceFileHref(file.id)}
                            target="_blank"
                            rel="noopener noreferrer"
                            className={linkCls}
                          >
                            <ExternalLink aria-hidden className="size-3.5" /> Abrir
                          </a>
                        </li>
                      ))}
                    </ul>
                  </div>
                ) : reply.attachments.some((a) => !a.inline) ? (
                  <p className="text-xs text-medium">
                    Anexos recebidos (não aceitos como NF):{" "}
                    {reply.attachments
                      .filter((a) => !a.inline)
                      .map((a) => a.filename ?? "anexo")
                      .join(", ")}
                  </p>
                ) : null}

                {reply.htmlBody ? (
                  <iframe
                    title={`Mensagem de ${reply.fromAddress}`}
                    // Sandbox vazio: sem scripts, formulários nem acesso à origem.
                    sandbox=""
                    srcDoc={prepareInboundHtmlForPreview(reply.htmlBody)}
                    className="h-72 w-full rounded-md border border-border bg-white"
                  />
                ) : (
                  <pre className="max-h-72 overflow-auto whitespace-pre-wrap rounded-md bg-surface-muted p-3 font-sans text-sm text-ink">
                    {reply.textBody?.trim() || "(sem texto)"}
                  </pre>
                )}
              </li>
            ))}
          </ol>
        )}
      </Modal>
    </>
  );
}
