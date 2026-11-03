/**
 * Respostas a e-mails enviados pelo JumpFlow — parte PURA (sem Prisma), usada
 * pela tela de configuracao, pelo envio e pelo webhook de entrada.
 *
 * Como funciona (Resend Inbound):
 * - Cada e-mail de um evento com destino de respostas sai com
 *   `Reply-To: <prefixo>+<token>@<RESEND_INBOUND_DOMAIN>`.
 * - O dominio de recebimento tem MX apontando para o Resend; toda mensagem
 *   recebida dispara o webhook `email.received` (/api/webhooks/resend/inbound).
 * - O token liga a resposta ao envio (OutboundEmailThread): evento + registro
 *   de origem (ex.: o ConsultantPayment da solicitacao de NF). O webhook
 *   encaminha a resposta aos destinatarios configurados e guarda corpo/anexos.
 *
 * Sem recebimento configurado, o Reply-To aponta direto para os destinatarios
 * configurados (as respostas chegam a eles, mas nao ficam no Flow).
 */
import { z } from "zod";
import { ROLE_NAMES, roleLabels, type RoleName } from "@/lib/auth/roles";

export const REPLY_ADDRESS_DEFAULT_PREFIX = "respostas";

/** Destinatario de respostas: e-mail literal ou todos os usuarios de um perfil. */
export type ReplyRecipient =
  | { type: "STATIC"; address: string }
  | { type: "ROLE"; address: RoleName };

export const REPLY_RECIPIENT_MAX = 20;

export const replyRecipientSchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("STATIC"),
    address: z.string().trim().toLowerCase().email("E-mail inválido."),
  }),
  z.object({
    type: z.literal("ROLE"),
    address: z.enum(ROLE_NAMES),
  }),
]);

export const replyRecipientsSchema = z
  .array(replyRecipientSchema)
  .max(REPLY_RECIPIENT_MAX, `No máximo ${REPLY_RECIPIENT_MAX} destinatários.`)
  .transform((list) => {
    const seen = new Set<string>();
    return list.filter((r) => {
      const key = `${r.type}:${r.address}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  });

/** Le o JSON gravado em EmailReplyRoute.recipients (tolerante a lixo). */
export function parseStoredReplyRecipients(value: unknown): ReplyRecipient[] {
  const parsed = replyRecipientsSchema.safeParse(value);
  return parsed.success ? parsed.data : [];
}

export function describeReplyRecipient(r: ReplyRecipient): string {
  return r.type === "ROLE" ? `Perfil: ${roleLabels[r.address]}` : r.address;
}

/**
 * Token do Reply-To: 24 caracteres base32 minusculos (120 bits). So [a-z2-7]
 * para sobreviver a clientes de e-mail que mexem em maiusculas.
 */
export function generateReplyToken(randomBytes: Uint8Array): string {
  const alphabet = "abcdefghijklmnopqrstuvwxyz234567";
  let bits = 0;
  let value = 0;
  let out = "";
  for (const byte of randomBytes) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      out += alphabet[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  return out.slice(0, 24);
}

export function buildReplyAddress(prefix: string, token: string, domain: string): string {
  return `${prefix}+${token}@${domain}`;
}

/** Extrai o endereco de "Nome <a@b>" ou devolve o proprio texto, minusculo. */
export function bareAddress(value: string): string {
  const match = /<([^>]+)>/.exec(value);
  return (match ? match[1] : value).trim().toLowerCase();
}

/**
 * Token de um endereco de resposta (`<prefixo>+<token>@<dominio>`), ou null se
 * o endereco nao e do dominio de recebimento / nao tem token.
 */
export function parseReplyToken(address: string, domain: string): string | null {
  const bare = bareAddress(address);
  const at = bare.lastIndexOf("@");
  if (at < 0 || bare.slice(at + 1) !== domain.trim().toLowerCase()) return null;
  const local = bare.slice(0, at);
  const plus = local.indexOf("+");
  if (plus < 0) return null;
  const token = local.slice(plus + 1);
  return /^[a-z2-7]{16,64}$/.test(token) ? token : null;
}

/** Primeiro token valido entre os enderecos de destino da mensagem recebida. */
export function findReplyToken(addresses: readonly string[], domain: string): string | null {
  for (const address of addresses) {
    const token = parseReplyToken(address, domain);
    if (token) return token;
  }
  return null;
}

/**
 * HTML de uma resposta recebida pronto para o iframe `sandbox=""` da tela:
 * remove <meta http-equiv="refresh"> e injeta uma CSP que bloqueia qualquer
 * carga remota (pixels de rastreamento, CSS/fontes externos) — só imagens
 * embutidas (data:/cid:) e estilo inline.
 */
export function prepareInboundHtmlForPreview(html: string): string {
  const withoutRefresh = html.replace(/<meta[^>]*http-equiv\s*=\s*["']?refresh["']?[^>]*>/gi, "");
  const csp =
    '<meta http-equiv="Content-Security-Policy" content="default-src \'none\'; img-src data: cid:; style-src \'unsafe-inline\'; font-src data:">';
  return `<!doctype html><html><head>${csp}<meta charset="utf-8"></head><body>${withoutRefresh}</body></html>`;
}
