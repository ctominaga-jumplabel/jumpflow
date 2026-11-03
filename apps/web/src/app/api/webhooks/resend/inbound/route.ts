import { isDatabaseConfigured } from "@/lib/db/config";
import { processInboundEmail } from "@/lib/automation/email/inbound";
import { isInboundConfigured } from "@/lib/automation/email/reply-routing";
import { verifyResendWebhook } from "@/lib/integrations/resend/webhook-signature";

export const dynamic = "force-dynamic";

/**
 * Webhook do Resend Inbound (evento `email.received`): respostas aos e-mails
 * enviados pelo Flow. Configure no Resend (Webhooks) apontando para
 * `$NEXT_PUBLIC_APP_URL/api/webhooks/resend/inbound` com o evento
 * `email.received`; o signing secret vai em RESEND_WEBHOOK_SECRET.
 *
 * Fora do proxy de /app (sem sessao): a autenticacao e a assinatura Svix.
 * Responde 2xx para eventos ignorados/duplicados (senao o Resend reentrega) e
 * 5xx so em falha transitoria antes de registrar a resposta.
 */
function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json; charset=utf-8" },
  });
}

export async function POST(request: Request) {
  const secret = process.env.RESEND_WEBHOOK_SECRET?.trim();
  if (!secret || !isInboundConfigured()) {
    return json({ ok: false, error: "NOT_CONFIGURED" }, 503);
  }
  const body = await request.text();
  const valid = verifyResendWebhook({
    headers: {
      id: request.headers.get("svix-id"),
      timestamp: request.headers.get("svix-timestamp"),
      signature: request.headers.get("svix-signature"),
    },
    body,
    secret,
  });
  if (!valid) return json({ ok: false, error: "INVALID_SIGNATURE" }, 401);

  let event: { type?: string; data?: { email_id?: string } };
  try {
    event = JSON.parse(body) as typeof event;
  } catch {
    return json({ ok: false, error: "INVALID_BODY" }, 400);
  }
  if (event.type !== "email.received") return json({ ok: true, ignored: event.type ?? null });
  const emailId = event.data?.email_id;
  if (typeof emailId !== "string" || emailId.length === 0) {
    return json({ ok: false, error: "INVALID_BODY" }, 400);
  }
  if (!isDatabaseConfigured()) return json({ ok: false, error: "NO_DATABASE" }, 503);

  try {
    const result = await processInboundEmail(emailId);
    return json({ ok: true, ...result });
  } catch (error) {
    console.error("[webhook:resend-inbound] processing failed", {
      emailId,
      error: error instanceof Error ? error.message : String(error),
    });
    return json({ ok: false, error: "UNEXPECTED" }, 500);
  }
}
