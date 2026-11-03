/**
 * Processamento de uma resposta recebida pelo Resend Inbound (webhook
 * `email.received`). Ver `reply-routing-core.ts` para o fluxo.
 *
 * 1. Idempotencia por `resendEmailId` (o Resend reentrega em falha/timeout).
 * 2. Busca o conteudo (corpo + anexos) na API de recebimento.
 * 3. Liga a resposta ao envio pelo token do endereco (OutboundEmailThread).
 * 4. Guarda a resposta (InboundEmail) para visualizacao no Flow.
 * 5. Solicitacao de NF: anexos validos (PDF/XML/imagem) viram NF do pagamento
 *    (ConsultantInvoiceAttachment source = EMAIL) e o status avanca para NF
 *    Recebida, como no upload pela tela.
 * 6. Encaminha a resposta (com anexos) aos destinatarios configurados do
 *    evento (EmailReplyRoute), com Reply-To = remetente original.
 *
 * Retomada: a linha nasce PENDING e so sai dele no fim. Falha no meio
 * (storage, queda do processo) => webhook 500 => o Resend reentrega e o
 * processamento continua de onde parou (NF ja registrada nao duplica; o
 * encaminhamento so acontece depois da NF). Falha do proprio encaminhamento e
 * registrada (FAILED) e nao reentrega, para nao duplicar e-mails.
 *
 * Seguranca da NF por e-mail: so vira anexo quando o remetente e o e-mail do
 * consultor do pagamento e o pagamento ainda aceita NF do dono (mesmos status
 * do upload pela tela, checados na transacao). Fora disso a resposta fica
 * registrada para triagem do Financeiro.
 */
import { Prisma, prisma } from "@jumpflow/database";
import { buildAuditEventData } from "@/lib/db/audit";
import {
  downloadReceivedAttachment,
  getReceivedEmail,
  listReceivedAttachments,
  type ReceivedAttachmentDownload,
  type ReceivedEmail,
} from "@/lib/integrations/resend/inbound-client";
import {
  buildConsultantInvoiceKey,
  validateInvoiceFile,
} from "@/lib/storage/file-validation";
import {
  CONSULTANT_INVOICES_BUCKET,
  getConsultantInvoiceStorageProvider,
} from "@/lib/storage/provider";
import { getEmailTransport, type EmailAttachment, type EmailTransport } from "../email-transport";
import { renderEmail, keyValueList, paragraph, type EmailBlock } from "./layout";
import { bareAddress, findReplyToken } from "./reply-routing-core";
import { inboundDomain, replyForwardEmails } from "./reply-routing";

export const INVOICE_REQUEST_EVENT = "CONSULTANT_INVOICE_REQUEST";
export const PAYMENT_REFERENCE_TYPE = "ConsultantPayment";

/** Limite total de anexos baixados por resposta (encaminhamento + NF). */
const MAX_TOTAL_ATTACHMENT_BYTES = 25 * 1024 * 1024;
const MAX_SINGLE_ATTACHMENT_BYTES = 15 * 1024 * 1024;
const MAX_STORED_HTML = 500_000;
const MAX_STORED_TEXT = 200_000;
/** Reentrega so retoma linhas PENDING com mais que isso (evita corrida). */
const RESUME_AFTER_MS = 60_000;

/** Mesmos status em que o dono pode anexar NF pela tela (invoice.actions). */
export const EMAIL_INVOICE_MUTABLE_STATUSES = [
  "OPEN",
  "PEOPLE_RELEASED",
  "WAITING_FOR_INVOICE",
  "INVOICE_RECEIVED",
] as const;

const EXTENSION_MIME: Record<string, string> = {
  ".pdf": "application/pdf",
  ".xml": "application/xml",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".png": "image/png",
  ".webp": "image/webp",
};

export interface DownloadedAttachment {
  meta: ReceivedAttachmentDownload;
  fileName: string;
  contentType: string;
  bytes: Uint8Array;
}

/**
 * Tipo do anexo para a NF: clientes de e-mail costumam mandar PDF/XML como
 * application/octet-stream — nesse caso o tipo vem da extensao.
 */
export function normalizeAttachmentType(fileName: string, contentType: string | null): string {
  const type = (contentType ?? "").split(";")[0].trim().toLowerCase();
  if (type && type !== "application/octet-stream" && type !== "binary/octet-stream") return type;
  const dot = fileName.lastIndexOf(".");
  const ext = dot >= 0 ? fileName.slice(dot).toLowerCase() : "";
  return EXTENSION_MIME[ext] ?? (type || "application/octet-stream");
}

/** Imagem embutida no corpo (assinatura/logo), nao um documento anexado. */
export function isInlinePart(meta: { content_disposition?: string | null; content_id?: string | null }): boolean {
  return meta.content_disposition === "inline" || Boolean(meta.content_id && meta.content_disposition !== "attachment");
}

/** Anexos que viram NF do pagamento: nao embutidos e de tipo/tamanho aceito. */
export function selectInvoiceFiles(files: readonly DownloadedAttachment[]): DownloadedAttachment[] {
  return files.filter(
    (f) =>
      !isInlinePart(f.meta) &&
      validateInvoiceFile({ name: f.fileName, type: f.contentType, size: f.bytes.byteLength }) === null,
  );
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export interface InboundDeps {
  getReceivedEmail: typeof getReceivedEmail;
  listReceivedAttachments: typeof listReceivedAttachments;
  downloadReceivedAttachment: typeof downloadReceivedAttachment;
  transport?: EmailTransport;
}

const defaultDeps: InboundDeps = {
  getReceivedEmail,
  listReceivedAttachments,
  downloadReceivedAttachment,
};

export interface InboundProcessResult {
  status: "DUPLICATE" | "PROCESSED";
  /** Motivo de a NF nao ter sido registrada (quando havia anexo candidato). */
  invoiceSkipped?: "SENDER_MISMATCH" | "PAYMENT_LOCKED" | "NO_STORAGE";
  inboundEmailId?: string;
  matchedThread: boolean;
  forwardStatus?: "FORWARDED" | "NO_RECIPIENTS" | "FAILED";
  invoiceAttachments: number;
}

async function downloadAll(
  email: ReceivedEmail,
  deps: InboundDeps,
): Promise<{ files: DownloadedAttachment[]; skipped: string[] }> {
  if (!email.attachments?.length) return { files: [], skipped: [] };
  const list = await deps.listReceivedAttachments(email.id);
  const files: DownloadedAttachment[] = [];
  const skipped: string[] = [];
  let total = 0;
  for (const meta of list) {
    const fileName = (meta.filename ?? "anexo").slice(0, 200);
    const size = meta.size ?? 0;
    if (size > MAX_SINGLE_ATTACHMENT_BYTES || total + size > MAX_TOTAL_ATTACHMENT_BYTES) {
      skipped.push(fileName);
      continue;
    }
    try {
      const bytes = await deps.downloadReceivedAttachment(
        meta.download_url,
        Math.min(MAX_SINGLE_ATTACHMENT_BYTES, MAX_TOTAL_ATTACHMENT_BYTES - total),
      );
      total += bytes.byteLength;
      files.push({
        meta,
        fileName,
        contentType: normalizeAttachmentType(fileName, meta.content_type),
        bytes,
      });
    } catch (error) {
      console.error("[email:inbound] attachment download failed", { emailId: email.id, error });
      skipped.push(fileName);
    }
  }
  return { files, skipped };
}

/**
 * NF recebida por e-mail → anexos do pagamento + NF Recebida (mesma regra do
 * upload: so avanca a partir de Liberado pelo DP / Aguardando NF). Erros de
 * storage/banco sobem (o webhook devolve 500 e o Resend reentrega).
 */
async function storeInvoiceAttachments(input: {
  paymentId: string;
  inboundEmailId: string;
  receivedAt: Date;
  fromAddress: string;
  files: DownloadedAttachment[];
}): Promise<{ stored: number; skipped?: InboundProcessResult["invoiceSkipped"] }> {
  const invoiceFiles = selectInvoiceFiles(input.files);
  if (invoiceFiles.length === 0) return { stored: 0 };
  const payment = await prisma.consultantPayment.findUnique({
    where: { id: input.paymentId },
    select: { id: true, status: true, contractType: true, consultant: { select: { email: true } } },
  });
  if (!payment || payment.contractType === "CLT") return { stored: 0 };
  const consultantEmail = payment.consultant?.email?.trim().toLowerCase() ?? "";
  if (!consultantEmail || consultantEmail !== input.fromAddress) {
    return { stored: 0, skipped: "SENDER_MISMATCH" };
  }
  if (!(EMAIL_INVOICE_MUTABLE_STATUSES as readonly string[]).includes(payment.status)) {
    return { stored: 0, skipped: "PAYMENT_LOCKED" };
  }
  const provider = getConsultantInvoiceStorageProvider();
  if (!provider) {
    console.warn("[email:inbound] storage not configured; NF from email not stored", {
      paymentId: payment.id,
    });
    return { stored: 0, skipped: "NO_STORAGE" };
  }

  const uploaded: Array<{ file: DownloadedAttachment; storageKey: string }> = [];
  try {
    for (const file of invoiceFiles) {
      const storageKey = buildConsultantInvoiceKey(payment.id, file.fileName);
      await provider.upload(storageKey, file.bytes, file.contentType);
      uploaded.push({ file, storageKey });
    }
    const locked = await prisma.$transaction(async (tx) => {
      // Trava a prova de corrida: o pagamento ainda aceita NF do dono.
      const guard = await tx.consultantPayment.updateMany({
        where: { id: payment.id, status: { in: [...EMAIL_INVOICE_MUTABLE_STATUSES] } },
        data: { updatedAt: new Date() },
      });
      if (guard.count !== 1) return true;
      const ids: string[] = [];
      for (const { file, storageKey } of uploaded) {
        const row = await tx.consultantInvoiceAttachment.create({
          data: {
            consultantPaymentId: payment.id,
            fileName: file.fileName,
            contentType: file.contentType,
            size: file.bytes.byteLength,
            storageBucket: CONSULTANT_INVOICES_BUCKET,
            storageKey,
            uploadedByUserId: null,
            source: "EMAIL",
            inboundEmailId: input.inboundEmailId,
          },
        });
        ids.push(row.id);
      }
      const advanced = await tx.consultantPayment.updateMany({
        where: { id: payment.id, status: { in: ["PEOPLE_RELEASED", "WAITING_FOR_INVOICE"] } },
        data: { status: "INVOICE_RECEIVED", invoiceReceivedAt: input.receivedAt },
      });
      await tx.auditEvent.create({
        data: buildAuditEventData({
          actorUserId: null,
          entityType: "ConsultantPayment",
          entityId: payment.id,
          action: "CONSULTANT_PAYMENT_INVOICE_RECEIVED_BY_EMAIL",
          before: { status: payment.status },
          after: {
            status: advanced.count === 1 ? "INVOICE_RECEIVED" : payment.status,
            attachmentIds: ids,
            fileNames: uploaded.map((u) => u.file.fileName),
            inboundEmailId: input.inboundEmailId,
            from: input.fromAddress,
          },
        }),
      });
      return false;
    });
    if (locked) {
      for (const { storageKey } of uploaded) await provider.delete(storageKey).catch(() => undefined);
      return { stored: 0, skipped: "PAYMENT_LOCKED" };
    }
  } catch (error) {
    for (const { storageKey } of uploaded) {
      await provider.delete(storageKey).catch(() => undefined);
    }
    throw error;
  }
  return { stored: uploaded.length };
}

function buildForward(input: {
  email: ReceivedEmail;
  eventLabel: string | null;
  originalSubject: string | null;
  skipped: string[];
}): { subject: string; html: string; text: string } {
  const { email } = input;
  const subject = `Resposta recebida: ${email.subject ?? input.originalSubject ?? "(sem assunto)"}`.slice(0, 250);
  const header: EmailBlock[] = [
    keyValueList([
      { label: "De", value: email.from },
      { label: "Recebido em", value: new Date(email.created_at).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" }) },
      ...(input.eventLabel ? [{ label: "Em resposta a", value: input.eventLabel }] : []),
    ]),
  ];
  if (input.skipped.length) {
    header.push(paragraph(`Anexos não encaminhados (acima do limite): ${input.skipped.join(", ")}.`));
  }
  const wrapper = renderEmail({ title: "Resposta a um e-mail do Flow", blocks: header });
  const originalHtml = email.html
    ? email.html
    : `<pre style="white-space:pre-wrap;font-family:inherit">${escapeHtml(email.text ?? "")}</pre>`;
  const html = `${wrapper.html}<hr style="margin:24px 0;border:none;border-top:1px solid #d7d8cf" />${originalHtml}`;
  const text = `${wrapper.text}\n\n———\n${email.text ?? ""}`;
  return { subject, html, text };
}

export async function processInboundEmail(
  emailId: string,
  deps: InboundDeps = defaultDeps,
  now: Date = new Date(),
): Promise<InboundProcessResult> {
  const existing = await prisma.inboundEmail.findUnique({
    where: { resendEmailId: emailId },
    select: { id: true, forwardStatus: true, createdAt: true },
  });
  // Ja concluida, ou em andamento por outra entrega recente: nada a fazer.
  if (
    existing &&
    (existing.forwardStatus !== "PENDING" ||
      now.getTime() - existing.createdAt.getTime() < RESUME_AFTER_MS)
  ) {
    return { status: "DUPLICATE", inboundEmailId: existing.id, matchedThread: false, invoiceAttachments: 0 };
  }

  const email = await deps.getReceivedEmail(emailId);
  const domain = inboundDomain();
  const destinations = [...(email.to ?? []), ...(email.received_for ?? []), ...(email.cc ?? [])];
  const token = domain ? findReplyToken(destinations, domain) : null;
  const thread = token
    ? await prisma.outboundEmailThread.findUnique({ where: { token } })
    : null;
  const parsedAt = new Date(email.created_at);
  const receivedAt = Number.isNaN(parsedAt.getTime()) ? now : parsedAt;
  const fromAddress = bareAddress(email.from);

  let inboundId: string;
  if (existing) {
    inboundId = existing.id;
  } else {
    try {
      const row = await prisma.inboundEmail.create({
        data: {
          resendEmailId: email.id,
          threadId: thread?.id ?? null,
          event: thread?.event ?? null,
          referenceType: thread?.referenceType ?? null,
          referenceId: thread?.referenceId ?? null,
          fromAddress: email.from.slice(0, 320),
          toAddresses: destinations.map(bareAddress).slice(0, 20),
          subject: email.subject?.slice(0, 500) ?? null,
          // Sem token (spam/endereco solto): so metadados, sem corpo.
          textBody: thread ? (email.text?.slice(0, MAX_STORED_TEXT) ?? null) : null,
          htmlBody: thread ? (email.html?.slice(0, MAX_STORED_HTML) ?? null) : null,
          attachmentsMeta: (email.attachments ?? []).map((a) => ({
            filename: a.filename,
            contentType: a.content_type,
            size: a.size ?? null,
            inline: isInlinePart(a),
          })) as Prisma.InputJsonValue,
          receivedAt,
          forwardStatus: thread ? "PENDING" : "NO_RECIPIENTS",
          forwardedTo: [],
        },
      });
      inboundId = row.id;
    } catch (error) {
      // Entrega concorrente do mesmo e-mail: a outra execucao ja processa.
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
        return { status: "DUPLICATE", matchedThread: Boolean(thread), invoiceAttachments: 0 };
      }
      throw error;
    }
  }
  if (!thread) {
    if (existing) {
      await prisma.inboundEmail.update({ where: { id: inboundId }, data: { forwardStatus: "NO_RECIPIENTS" } });
    }
    return { status: "PROCESSED", inboundEmailId: inboundId, matchedThread: false, forwardStatus: "NO_RECIPIENTS", invoiceAttachments: 0 };
  }

  const forwardTo = await replyForwardEmails(thread.event);
  const captureInvoice =
    thread.event === INVOICE_REQUEST_EVENT &&
    thread.referenceType === PAYMENT_REFERENCE_TYPE &&
    Boolean(thread.referenceId);

  // Erros aqui sobem: a linha fica PENDING e a reentrega retoma.
  let files: DownloadedAttachment[] = [];
  let skipped: string[] = [];
  if (forwardTo.length > 0 || captureInvoice) {
    ({ files, skipped } = await downloadAll(email, deps));
  }

  let invoiceAttachments = 0;
  let invoiceSkipped: InboundProcessResult["invoiceSkipped"];
  if (captureInvoice && thread.referenceId) {
    const already = existing
      ? await prisma.consultantInvoiceAttachment.count({ where: { inboundEmailId: inboundId } })
      : 0;
    if (already > 0) {
      invoiceAttachments = already;
    } else {
      const result = await storeInvoiceAttachments({
        paymentId: thread.referenceId,
        inboundEmailId: inboundId,
        receivedAt,
        fromAddress,
        files,
      });
      invoiceAttachments = result.stored;
      invoiceSkipped = result.skipped;
    }
  }

  let forwardStatus: InboundProcessResult["forwardStatus"] = "NO_RECIPIENTS";
  let forwardError: string | null = null;
  // Nunca devolve a resposta ao proprio remetente.
  const recipients = forwardTo.filter((address) => address !== fromAddress);
  if (recipients.length > 0) {
    const forward = buildForward({
      email,
      eventLabel: thread.subject ?? null,
      originalSubject: thread.subject ?? null,
      skipped,
    });
    const attachments: EmailAttachment[] = files.map((f) => ({
      filename: f.fileName,
      content: Buffer.from(f.bytes).toString("base64"),
      contentType: f.contentType,
      encoding: "base64",
      ...(isInlinePart(f.meta) && f.meta.content_id
        ? { contentId: f.meta.content_id, disposition: "inline" as const }
        : {}),
    }));
    try {
      await (deps.transport ?? getEmailTransport()).send({
        to: recipients,
        subject: forward.subject,
        html: forward.html,
        text: forward.text,
        replyTo: [email.from],
        ...(attachments.length ? { attachments } : {}),
      });
      forwardStatus = "FORWARDED";
    } catch (error) {
      forwardStatus = "FAILED";
      forwardError = (error instanceof Error ? error.message : String(error)).slice(0, 500);
    }
  }

  await prisma.inboundEmail.update({
    where: { id: inboundId },
    data: {
      forwardStatus,
      forwardedTo: forwardStatus === "FORWARDED" ? recipients : [],
      forwardError: forwardError ?? (invoiceSkipped ? `NF não registrada: ${invoiceSkipped}` : null),
    },
  });

  return {
    status: "PROCESSED",
    inboundEmailId: inboundId,
    matchedThread: true,
    forwardStatus,
    invoiceAttachments,
    ...(invoiceSkipped ? { invoiceSkipped } : {}),
  };
}
