import { createHmac, timingSafeEqual } from "node:crypto";

/**
 * Verificacao da assinatura dos webhooks do Resend (padrao Svix), sem SDK:
 * - headers `svix-id`, `svix-timestamp` (unix s) e `svix-signature`
 *   (lista "v1,<base64>" separada por espaco);
 * - conteudo assinado = `${id}.${timestamp}.${corpo cru}`;
 * - HMAC-SHA256 com o segredo `whsec_<base64>` decodificado, em base64.
 * Rejeita timestamps fora da tolerancia (replay). Usar o corpo CRU: re-serializar
 * o JSON quebra a assinatura.
 */
export const WEBHOOK_TOLERANCE_SECONDS = 5 * 60;

export interface SvixHeaders {
  id: string | null;
  timestamp: string | null;
  signature: string | null;
}

export function verifyResendWebhook(input: {
  headers: SvixHeaders;
  body: string;
  secret: string;
  now?: Date;
}): boolean {
  const { id, timestamp, signature } = input.headers;
  if (!id || !timestamp || !signature) return false;
  const ts = Number(timestamp);
  if (!Number.isFinite(ts)) return false;
  const nowSeconds = Math.floor((input.now ?? new Date()).getTime() / 1000);
  if (Math.abs(nowSeconds - ts) > WEBHOOK_TOLERANCE_SECONDS) return false;

  const rawSecret = input.secret.trim().replace(/^whsec_/, "");
  let key: Buffer;
  try {
    key = Buffer.from(rawSecret, "base64");
  } catch {
    return false;
  }
  if (key.length === 0) return false;
  const expected = createHmac("sha256", key)
    .update(`${id}.${timestamp}.${input.body}`)
    .digest();

  for (const part of signature.split(" ")) {
    const [version, value] = part.split(",");
    if (version !== "v1" || !value) continue;
    let candidate: Buffer;
    try {
      candidate = Buffer.from(value, "base64");
    } catch {
      continue;
    }
    if (candidate.length === expected.length && timingSafeEqual(candidate, expected)) {
      return true;
    }
  }
  return false;
}

/** Assina como o Svix (teste/ferramentas locais). */
export function signResendWebhook(input: {
  id: string;
  timestamp: string;
  body: string;
  secret: string;
}): string {
  const key = Buffer.from(input.secret.trim().replace(/^whsec_/, ""), "base64");
  const sig = createHmac("sha256", key)
    .update(`${input.id}.${input.timestamp}.${input.body}`)
    .digest("base64");
  return `v1,${sig}`;
}
