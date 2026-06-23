import { randomUUID } from "node:crypto";

/**
 * Minimal pluggable email transport.
 *
 * MVP ships only a console transport (logs + returns a synthetic id). A real
 * provider (SMTP, Resend, SES…) is selected by `EMAIL_PROVIDER` and added here
 * without touching callers — keeping the engine provider-agnostic and free of
 * Supabase coupling.
 */
export interface EmailAttachment {
  filename: string;
  content: string;
  contentType: string;
}

export interface EmailMessage {
  to: string[];
  subject: string;
  text: string;
  /**
   * Optional HTML body. When present it is sent alongside `text` (which stays
   * the required plain-text fallback). Built via `lib/automation/email`.
   */
  html?: string;
  attachments?: EmailAttachment[];
}

export interface EmailSendResult {
  id: string;
  provider: string;
}

export interface EmailTransport {
  send(message: EmailMessage): Promise<EmailSendResult>;
}

class ConsoleEmailTransport implements EmailTransport {
  async send(message: EmailMessage): Promise<EmailSendResult> {
    const id = randomUUID();
    console.info("[email:console] sending", {
      id,
      to: message.to,
      subject: message.subject,
      hasHtml: Boolean(message.html),
      attachments: message.attachments?.map((a) => ({
        filename: a.filename,
        bytes: a.content.length,
      })),
    });
    return { id, provider: "console" };
  }
}

/**
 * Resend transport. Selected by `EMAIL_PROVIDER=resend`; requires
 * `RESEND_API_KEY` and `RESEND_FROM_EMAIL`. The api key is never logged nor
 * included in any thrown error.
 */
class ResendEmailTransport implements EmailTransport {
  async send(message: EmailMessage): Promise<EmailSendResult> {
    const apiKey = process.env.RESEND_API_KEY;
    const from = process.env.RESEND_FROM_EMAIL;
    // Misconfig falls back to console so the job never crashes on a missing key.
    if (!apiKey || !from) {
      console.warn(
        "[email:resend] missing RESEND_API_KEY/RESEND_FROM_EMAIL; falling back to console",
      );
      return new ConsoleEmailTransport().send(message);
    }
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from,
        to: message.to,
        subject: message.subject,
        text: message.text,
        ...(message.html ? { html: message.html } : {}),
        attachments: message.attachments?.map((a) => ({
          filename: a.filename,
          // Resend expects base64 content for inline attachments.
          content: Buffer.from(a.content, "utf-8").toString("base64"),
          // Resend's HTTP API uses snake_case `content_type` (it otherwise
          // infers the type from the filename extension).
          content_type: a.contentType,
        })),
      }),
    });
    if (!res.ok) {
      // SAFE error: status + provider message only. NEVER include the api key,
      // the Authorization header, or the request init.
      let detail = "";
      try {
        const body = (await res.json()) as { message?: string; name?: string };
        detail = body.message || body.name || "";
      } catch {
        // ignore body parse errors
      }
      throw new Error(
        `Resend send failed (${res.status})${detail ? `: ${detail}` : ""}`,
      );
    }
    const body = (await res.json()) as { id?: string };
    return { id: body.id ?? "", provider: "resend" };
  }
}

/**
 * Resolve the configured transport. Defaults to the console transport so the
 * automation works end-to-end locally without a real email account.
 */
export function getEmailTransport(): EmailTransport {
  switch (process.env.EMAIL_PROVIDER) {
    // case "smtp": return new SmtpEmailTransport();  // future
    case "resend":
      return new ResendEmailTransport();
    case "console":
    default:
      return new ConsoleEmailTransport();
  }
}
