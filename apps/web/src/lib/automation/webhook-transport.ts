import { randomUUID } from "node:crypto";

/**
 * Pluggable outbound webhook transport — the second notification channel
 * (Microsoft Teams), mirroring the email transport design.
 *
 * Free solution: Microsoft Teams **Incoming Webhook** (no paid plan, no Graph
 * API, no app registration). An admin creates a webhook on a channel and pastes
 * the URL into the notification rule; we POST a MessageCard JSON to it.
 *
 * The URL is treated as a secret: it is never logged nor embedded in errors.
 * When no URL is configured the transport falls back to a console no-op so the
 * engine never crashes on a missing channel.
 */
export interface WebhookMessage {
  /** Channel webhook URL (secret). When omitted, resolves to console fallback. */
  url?: string;
  title: string;
  /** Plain-text body; rendered as the card text. */
  text: string;
  /** Optional key/value facts shown as a compact list in the card. */
  facts?: Array<{ name: string; value: string }>;
  /** Optional deep link rendered as an action button. */
  link?: { label: string; url: string };
  /** Accent color (hex without #). Defaults to JumpFlow coral. */
  themeColor?: string;
}

export interface WebhookSendResult {
  id: string;
  provider: string;
  status: number;
}

export interface WebhookTransport {
  send(message: WebhookMessage): Promise<WebhookSendResult>;
}

class ConsoleWebhookTransport implements WebhookTransport {
  async send(message: WebhookMessage): Promise<WebhookSendResult> {
    const id = randomUUID();
    console.info("[webhook:console] sending", {
      id,
      title: message.title,
      facts: message.facts?.length ?? 0,
      hasLink: Boolean(message.link),
    });
    return { id, provider: "console", status: 200 };
  }
}

/**
 * Build a Teams MessageCard (legacy "Office 365 Connector" card) — the format
 * Incoming Webhooks accept without any extra setup.
 */
function buildTeamsCard(message: WebhookMessage): unknown {
  return {
    "@type": "MessageCard",
    "@context": "https://schema.org/extensions",
    themeColor: message.themeColor ?? "ff5a5f",
    summary: message.title,
    sections: [
      {
        activityTitle: message.title,
        text: message.text,
        facts: message.facts,
        markdown: true,
      },
    ],
    potentialAction: message.link
      ? [
          {
            "@type": "OpenUri",
            name: message.link.label,
            targets: [{ os: "default", uri: message.link.url }],
          },
        ]
      : undefined,
  };
}

class TeamsWebhookTransport implements WebhookTransport {
  async send(message: WebhookMessage): Promise<WebhookSendResult> {
    const url = message.url;
    if (!url) {
      console.warn(
        "[webhook:teams] missing channel url; falling back to console",
      );
      return new ConsoleWebhookTransport().send(message);
    }
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(buildTeamsCard(message)),
    });
    if (!res.ok) {
      // SAFE error: status only. NEVER include the webhook URL.
      throw new Error(`Teams webhook failed (${res.status})`);
    }
    return { id: randomUUID(), provider: "teams", status: res.status };
  }
}

/**
 * Resolve the configured webhook transport. Defaults to console so automation
 * works end-to-end locally without a real Teams channel.
 */
export function getWebhookTransport(): WebhookTransport {
  switch (process.env.WEBHOOK_PROVIDER) {
    case "teams":
      return new TeamsWebhookTransport();
    case "console":
    default:
      return new ConsoleWebhookTransport();
  }
}
