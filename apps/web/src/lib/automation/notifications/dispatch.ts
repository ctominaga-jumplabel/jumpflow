/**
 * Notification dispatch service.
 *
 * Responsibilities (the foundation that the notification waves build on):
 *  1. Group notification fragments BY RECIPIENT so a person who would otherwise
 *     get N separate emails (one per project/allocation) receives a single
 *     consolidated digest — the "agrupamento por destinatário" requirement.
 *  2. Route each recipient to the right channel (EMAIL via Resend transport,
 *     TEAMS via webhook transport).
 *  3. Stay storage-agnostic: an optional `recordDelivery` sink lets callers log
 *     to `AutomationEmailLog` (idempotency) once that wiring lands with the
 *     feature waves. The grouping/routing itself is pure and unit-testable.
 *
 * It is intentionally decoupled from Prisma and from `NotificationRule`
 * resolution: callers resolve recipients (from rules) and hand fragments here.
 */
import { getEmailTransport, type EmailTransport } from "../email-transport";
import { renderEmail, heading, type EmailBlock } from "../email/layout";
import {
  getWebhookTransport,
  type WebhookMessage,
  type WebhookTransport,
} from "../webhook-transport";

export type NotificationChannel = "EMAIL" | "TEAMS";

export interface ResolvedRecipient {
  /** Stable dedup key — group fragments by this (e.g. the email address). */
  key: string;
  channel: NotificationChannel;
  /** Email address (EMAIL) or channel webhook URL (TEAMS). */
  address: string;
  name?: string;
}

/**
 * One unit of notification aimed at one recipient. Multiple fragments for the
 * same recipient are merged into a single message at dispatch time.
 */
export interface NotificationFragment {
  recipient: ResolvedRecipient;
  /** Section title; also the subject when this is the recipient's only fragment. */
  title: string;
  /**
   * Email body blocks (built with lib/automation/email/layout). Used when the
   * fragment may be merged with others into a per-recipient digest.
   */
  blocks?: EmailBlock[];
  /**
   * A ready-made template email. When the recipient has a single fragment it is
   * sent as-is (full branded layout). In a multi-fragment digest it degrades to
   * its plain text under the section title.
   */
  prebuilt?: { subject: string; html: string; text: string };
  /** Plain text for the Teams card body. */
  teamsText?: string;
  teamsFacts?: Array<{ name: string; value: string }>;
  teamsLink?: { label: string; url: string };
}

export interface DispatchResult {
  recipientKey: string;
  channel: NotificationChannel;
  fragments: number;
  status: "SENT" | "FAILED";
  messageId?: string;
  error?: string;
}

export interface DeliveryLogEntry {
  recipient: string;
  channel: NotificationChannel;
  status: "SENT" | "FAILED";
  messageId?: string;
  error?: string;
  fragments: number;
}

export interface DispatchOptions {
  emailTransport?: EmailTransport;
  webhookTransport?: WebhookTransport;
  /** Subject prefix for grouped digests. Defaults to "Resumo de notificações". */
  digestTitle?: string;
  /** Optional sink for delivery logging / idempotency. */
  recordDelivery?: (entry: DeliveryLogEntry) => Promise<void> | void;
}

/** Group fragments by recipient key, preserving order. */
export function groupByRecipient(
  fragments: NotificationFragment[],
): Map<string, NotificationFragment[]> {
  const groups = new Map<string, NotificationFragment[]>();
  for (const fragment of fragments) {
    const existing = groups.get(fragment.recipient.key);
    if (existing) existing.push(fragment);
    else groups.set(fragment.recipient.key, [fragment]);
  }
  return groups;
}

function buildEmailBody(
  fragments: NotificationFragment[],
  digestTitle: string,
): { subject: string; html: string; text: string } {
  if (fragments.length === 1) {
    const only = fragments[0];
    if (only.prebuilt) return only.prebuilt;
    const { html, text } = renderEmail({ title: only.title, blocks: only.blocks ?? [] });
    return { subject: only.title, html, text };
  }
  // Multiple fragments → one digest, each fragment as its own section.
  const blocks: EmailBlock[] = [];
  fragments.forEach((fragment, idx) => {
    if (idx > 0) {
      blocks.push({
        html: `<div style="height:1px;background:#d7d8cf;margin:24px 0;"></div>`,
        text: "\n———\n",
      });
    }
    blocks.push(heading(fragment.title));
    if (fragment.blocks && fragment.blocks.length > 0) {
      blocks.push(...fragment.blocks);
    } else if (fragment.prebuilt) {
      blocks.push({
        html: `<p style="margin:0 0 16px;font-size:14px;line-height:1.55;color:#42524a;white-space:pre-line;">${fragment.prebuilt.text
          .replace(/&/g, "&amp;")
          .replace(/</g, "&lt;")}</p>`,
        text: fragment.prebuilt.text,
      });
    }
  });
  const title = `${digestTitle} (${fragments.length})`;
  const { html, text } = renderEmail({ title, blocks });
  return { subject: title, html, text };
}

async function dispatchEmailGroup(
  recipient: ResolvedRecipient,
  fragments: NotificationFragment[],
  transport: EmailTransport,
  digestTitle: string,
): Promise<DispatchResult> {
  const { subject, html, text } = buildEmailBody(fragments, digestTitle);
  try {
    const sent = await transport.send({ to: [recipient.address], subject, text, html });
    return {
      recipientKey: recipient.key,
      channel: "EMAIL",
      fragments: fragments.length,
      status: "SENT",
      messageId: sent.id,
    };
  } catch (e) {
    return {
      recipientKey: recipient.key,
      channel: "EMAIL",
      fragments: fragments.length,
      status: "FAILED",
      error: e instanceof Error ? e.message : String(e),
    };
  }
}

async function dispatchTeamsGroup(
  recipient: ResolvedRecipient,
  fragments: NotificationFragment[],
  transport: WebhookTransport,
  digestTitle: string,
): Promise<DispatchResult> {
  const title =
    fragments.length === 1
      ? fragments[0].title
      : `${digestTitle} (${fragments.length})`;
  const text = fragments
    .map((f) => f.teamsText ?? f.title)
    .join("\n\n");
  const facts = fragments.flatMap((f) => f.teamsFacts ?? []);
  const link = fragments.find((f) => f.teamsLink)?.teamsLink;
  const message: WebhookMessage = {
    url: recipient.address,
    title,
    text,
    facts: facts.length ? facts : undefined,
    link,
  };
  try {
    const sent = await transport.send(message);
    return {
      recipientKey: recipient.key,
      channel: "TEAMS",
      fragments: fragments.length,
      status: "SENT",
      messageId: sent.id,
    };
  } catch (e) {
    return {
      recipientKey: recipient.key,
      channel: "TEAMS",
      fragments: fragments.length,
      status: "FAILED",
      error: e instanceof Error ? e.message : String(e),
    };
  }
}

/**
 * Dispatch all fragments, grouping by recipient and routing per channel.
 * Never throws on a single delivery failure — returns a per-recipient result
 * array so callers can log/retry.
 */
export async function dispatchNotifications(
  fragments: NotificationFragment[],
  options: DispatchOptions = {},
): Promise<DispatchResult[]> {
  const emailTransport = options.emailTransport ?? getEmailTransport();
  const webhookTransport = options.webhookTransport ?? getWebhookTransport();
  const digestTitle = options.digestTitle ?? "Resumo de notificações";

  const groups = groupByRecipient(fragments);
  const results: DispatchResult[] = [];

  for (const group of groups.values()) {
    const recipient = group[0].recipient;
    const result =
      recipient.channel === "TEAMS"
        ? await dispatchTeamsGroup(recipient, group, webhookTransport, digestTitle)
        : await dispatchEmailGroup(recipient, group, emailTransport, digestTitle);
    results.push(result);

    if (options.recordDelivery) {
      await options.recordDelivery({
        recipient: recipient.address,
        channel: result.channel,
        status: result.status,
        messageId: result.messageId,
        error: result.error,
        fragments: result.fragments,
      });
    }
  }

  return results;
}
