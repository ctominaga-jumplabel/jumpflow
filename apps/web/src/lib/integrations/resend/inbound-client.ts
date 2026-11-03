/**
 * Cliente minimo da API de RECEBIMENTO do Resend (Resend Inbound), via fetch —
 * mesmo motivo do transporte de envio: sem SDK, chave nunca em log/erro.
 *
 * - GET /emails/receiving/{id}              → corpo, cabecalhos, metadados
 * - GET /emails/receiving/{id}/attachments  → anexos com `download_url`
 *   (URL assinada valida por ~1 h)
 * O webhook `email.received` traz so metadados; o conteudo vem daqui.
 */
const RESEND_API = "https://api.resend.com";

export interface ReceivedEmailAttachmentMeta {
  id: string;
  filename: string | null;
  content_type: string | null;
  content_disposition?: string | null;
  content_id?: string | null;
  size?: number | null;
}

export interface ReceivedEmail {
  id: string;
  from: string;
  to: string[];
  cc?: string[];
  received_for?: string[];
  reply_to?: string[];
  subject: string | null;
  html: string | null;
  text: string | null;
  created_at: string;
  message_id?: string | null;
  attachments?: ReceivedEmailAttachmentMeta[];
}

export interface ReceivedAttachmentDownload extends ReceivedEmailAttachmentMeta {
  download_url: string;
  expires_at?: string;
}

export class ResendInboundError extends Error {
  constructor(
    readonly operation: "get" | "attachments" | "download",
    readonly status: number,
    detail?: string,
  ) {
    super(`Resend inbound ${operation} failed (${status})${detail ? `: ${detail}` : ""}`);
    this.name = "ResendInboundError";
  }
}

function apiKey(): string {
  const key = process.env.RESEND_API_KEY?.trim();
  if (!key) throw new ResendInboundError("get", 0, "RESEND_API_KEY ausente");
  return key;
}

async function errorDetail(res: Response): Promise<string> {
  try {
    const body = (await res.json()) as { message?: string; name?: string };
    return body.message || body.name || "";
  } catch {
    return "";
  }
}

export async function getReceivedEmail(emailId: string): Promise<ReceivedEmail> {
  const res = await fetch(`${RESEND_API}/emails/receiving/${encodeURIComponent(emailId)}`, {
    headers: { Authorization: `Bearer ${apiKey()}` },
  });
  if (!res.ok) throw new ResendInboundError("get", res.status, await errorDetail(res));
  return (await res.json()) as ReceivedEmail;
}

export async function listReceivedAttachments(
  emailId: string,
): Promise<ReceivedAttachmentDownload[]> {
  const res = await fetch(
    `${RESEND_API}/emails/receiving/${encodeURIComponent(emailId)}/attachments`,
    { headers: { Authorization: `Bearer ${apiKey()}` } },
  );
  if (!res.ok) throw new ResendInboundError("attachments", res.status, await errorDetail(res));
  const body = (await res.json()) as { data?: ReceivedAttachmentDownload[] };
  return body.data ?? [];
}

/** Baixa um anexo pela URL assinada (sem Authorization: a URL ja e assinada). */
export async function downloadReceivedAttachment(
  url: string,
  maxBytes: number,
): Promise<Uint8Array> {
  if (!url.startsWith("https://")) throw new ResendInboundError("download", 0, "URL inválida");
  const res = await fetch(url);
  if (!res.ok) throw new ResendInboundError("download", res.status);
  const buffer = new Uint8Array(await res.arrayBuffer());
  if (buffer.byteLength > maxBytes) {
    throw new ResendInboundError("download", 413, "anexo acima do limite");
  }
  return buffer;
}
