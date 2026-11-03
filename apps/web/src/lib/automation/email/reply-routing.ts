/**
 * Respostas a e-mails enviados — parte server (Prisma). Ver
 * `reply-routing-core.ts` para o fluxo completo.
 *
 * Fail-open em tudo: qualquer erro de leitura/gravacao devolve `undefined`
 * (o e-mail sai sem Reply-To customizado), nunca derruba o envio.
 */
import { randomBytes } from "node:crypto";
import { prisma } from "@jumpflow/database";
import { isDatabaseConfigured } from "@/lib/db/config";
import { resolveRecipients } from "../notifications/resolve";
import {
  REPLY_ADDRESS_DEFAULT_PREFIX,
  buildReplyAddress,
  generateReplyToken,
  parseStoredReplyRecipients,
  type ReplyRecipient,
} from "./reply-routing-core";

/**
 * Eventos cujas respostas sao CAPTURADAS no Flow mesmo sem destino de
 * encaminhamento configurado (ex.: a NF que o consultor responde por e-mail
 * vira anexo do pagamento).
 */
export const REPLY_CAPTURE_EVENTS: ReadonlySet<string> = new Set([
  "CONSULTANT_INVOICE_REQUEST",
]);

/**
 * Dominio de recebimento do Resend Inbound (MX apontando para o Resend), ex.:
 * `respostas.flow.jump.tec.br`. So vale com EMAIL_PROVIDER=resend.
 */
export function inboundDomain(): string | null {
  if (process.env.EMAIL_PROVIDER !== "resend") return null;
  const domain = process.env.RESEND_INBOUND_DOMAIN?.trim().toLowerCase();
  return domain ? domain : null;
}

export function inboundAddressPrefix(): string {
  const prefix = process.env.RESEND_INBOUND_PREFIX?.trim().toLowerCase();
  return prefix && /^[a-z0-9._-]+$/.test(prefix) ? prefix : REPLY_ADDRESS_DEFAULT_PREFIX;
}

/** Recebimento completo: dominio + segredo do webhook + chave da API. */
export function isInboundConfigured(): boolean {
  return Boolean(
    inboundDomain() && process.env.RESEND_WEBHOOK_SECRET?.trim() && process.env.RESEND_API_KEY?.trim(),
  );
}

export interface ReplyRoute {
  active: boolean;
  recipients: ReplyRecipient[];
}

export async function loadReplyRoute(event: string): Promise<ReplyRoute | null> {
  if (!isDatabaseConfigured()) return null;
  try {
    const row = await prisma.emailReplyRoute.findUnique({ where: { event: event as never } });
    if (!row) return null;
    return { active: row.active, recipients: parseStoredReplyRecipients(row.recipients) };
  } catch {
    return null;
  }
}

/** Expande e-mails + perfis (usuarios ATIVOS do papel) em e-mails unicos. */
export async function resolveReplyRecipientEmails(
  recipients: readonly ReplyRecipient[],
): Promise<string[]> {
  const resolved = await resolveRecipients(
    recipients.map((r) => ({ type: r.type, channel: "EMAIL" as const, address: r.address, name: null })),
    {},
  );
  return [...new Set(resolved.map((r) => r.address.toLowerCase()))];
}

/**
 * Destino padrao das respostas de eventos capturados sem rota configurada: a
 * resposta nunca fica "so no Flow" sem ninguem avisado (antes, ela ia para o
 * remetente do e-mail).
 */
export const REPLY_CAPTURE_FALLBACK: ReplyRecipient[] = [{ type: "ROLE", address: "FINANCE" }];

/**
 * Destinatarios efetivos de um evento: rota ativa; sem rota, o fallback dos
 * eventos capturados; senao []. Nunca devolve enderecos do proprio dominio de
 * recebimento (evita laço de encaminhamento).
 */
export async function replyForwardEmails(event: string): Promise<string[]> {
  const route = await loadReplyRoute(event);
  let recipients: ReplyRecipient[] = [];
  if (route) {
    recipients = route.active ? route.recipients : [];
  } else if (REPLY_CAPTURE_EVENTS.has(event)) {
    recipients = REPLY_CAPTURE_FALLBACK;
  }
  if (recipients.length === 0) return [];
  const domain = inboundDomain();
  const emails = await resolveReplyRecipientEmails(recipients);
  return domain ? emails.filter((e) => !e.endsWith(`@${domain}`)) : emails;
}

/**
 * Reply-To do e-mail de `event`:
 * - recebimento configurado e (rota ativa ou evento capturado): cria um
 *   OutboundEmailThread e devolve o endereco com token;
 * - so rota ativa (sem recebimento): os proprios destinatarios da rota;
 * - senao: undefined (Reply-To padrao do remetente).
 */
export async function buildReplyTo(input: {
  event: string;
  referenceType?: string;
  referenceId?: string;
  subject?: string;
  sentTo?: readonly string[];
}): Promise<string[] | undefined> {
  if (!isDatabaseConfigured()) return undefined;
  try {
    const route = await loadReplyRoute(input.event);
    const routeActive = Boolean(route?.active && route.recipients.length > 0);
    const domain = inboundDomain();
    if (domain && isInboundConfigured() && (routeActive || REPLY_CAPTURE_EVENTS.has(input.event))) {
      const token = generateReplyToken(randomBytes(15));
      await prisma.outboundEmailThread.create({
        data: {
          token,
          event: input.event as never,
          referenceType: input.referenceType ?? null,
          referenceId: input.referenceId ?? null,
          subject: input.subject?.slice(0, 300) ?? null,
          sentTo: input.sentTo?.join(", ").slice(0, 1000) ?? null,
        },
      });
      return [buildReplyAddress(inboundAddressPrefix(), token, domain)];
    }
    if (routeActive && route) {
      const emails = await resolveReplyRecipientEmails(route.recipients);
      return emails.length ? emails : undefined;
    }
    return undefined;
  } catch (error) {
    console.error("[email:reply-to] failed to build reply-to", { event: input.event, error });
    return undefined;
  }
}
