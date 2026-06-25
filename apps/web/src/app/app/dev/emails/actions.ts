"use server";

import { getEmailTransport } from "@/lib/automation/email-transport";
import { requireUser } from "@/lib/auth/guards";
import { findSample } from "./samples";

export interface SendTestResult {
  ok: boolean;
  provider?: string;
  messageId?: string;
  error?: string;
}

/**
 * Send one sample template to a recipient, using the REAL configured transport
 * (console locally; Resend when EMAIL_PROVIDER=resend). Dev-only: refuses in
 * production and requires an authenticated user.
 *
 * Resend free tier without a verified domain only delivers to the account's
 * own signup email — that is exactly the self-test flow (see docs/infra-notificacoes.md).
 */
export async function sendTestEmail(
  templateKey: string,
  to: string,
): Promise<SendTestResult> {
  if (process.env.NODE_ENV === "production") {
    return { ok: false, error: "Indisponível em produção." };
  }
  const user = await requireUser();
  const recipient = (to || user.email).trim();
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(recipient)) {
    return { ok: false, error: "E-mail de destino inválido." };
  }

  const sample = findSample(templateKey);
  if (!sample) return { ok: false, error: "Template não encontrado." };

  const built = sample.build(user.name ?? recipient);
  try {
    const sent = await getEmailTransport().send({
      to: [recipient],
      subject: `[TESTE] ${built.subject}`,
      text: built.text,
      html: built.html,
    });
    return { ok: true, provider: sent.provider, messageId: sent.id };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}
