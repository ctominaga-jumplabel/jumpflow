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
  to: string;
  subject: string;
  text: string;
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
      attachments: message.attachments?.map((a) => ({
        filename: a.filename,
        bytes: a.content.length,
      })),
    });
    return { id, provider: "console" };
  }
}

/**
 * Resolve the configured transport. Defaults to the console transport so the
 * automation works end-to-end locally without a real email account.
 */
export function getEmailTransport(): EmailTransport {
  switch (process.env.EMAIL_PROVIDER) {
    // case "smtp": return new SmtpEmailTransport();  // future
    case "console":
    default:
      return new ConsoleEmailTransport();
  }
}
