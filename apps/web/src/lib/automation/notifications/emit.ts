/**
 * Notification emit engine — the bridge between business events and delivery.
 *
 * `emitNotification` is the single entry point an event calls. It:
 *   1. loads ACTIVE rules matching the event + scope,
 *   2. resolves each rule's recipients (resolve.ts),
 *   3. skips recipients already delivered (idempotency via AutomationEmailLog),
 *   4. builds one fragment per recipient and dispatches (grouped per person),
 *   5. logs each delivery for idempotency/observability.
 *
 * Like the audit helper, it NEVER throws into the host action: missing DB,
 * missing table (migration not yet applied) or transport errors are swallowed
 * and logged. No rules configured ⇒ nothing sent (fail-open, safe to wire now).
 */
import { prisma } from "@jumpflow/database";
import { isDatabaseConfigured } from "@/lib/db/config";
import {
  dispatchNotifications,
  type NotificationFragment,
  type ResolvedRecipient,
} from "./dispatch";
import { resolveRecipients, type ResolveContext } from "./resolve";

export type NotificationEventKey =
  | "HOURS_RELEASED"
  | "CLIENT_BILLING_SUMMARY"
  | "OVERTIME_ALERT"
  | "PROJECT_CREATED"
  | "INVOICING_OVERDUE"
  | "COMMERCIAL_CONTRACT_MISSING"
  | "OPERATION_CLOSED";

export type NotificationScopeKey = "GLOBAL" | "PROJECT" | "ALLOCATION";

export interface EmitNotificationInput {
  event: NotificationEventKey;
  /** Scope used to match rules (GLOBAL rules always match). */
  scope: { type: NotificationScopeKey; id?: string };
  /** Context for resolving dynamic recipients (project manager, client contact). */
  context: ResolveContext;
  /** Stable id making the delivery idempotent (e.g. projectId, closingId). */
  dedupeKey: string;
  /** Build the message for one recipient. Return null to skip that recipient. */
  buildFragment: (recipient: ResolvedRecipient) => NotificationFragment | null;
}

function referenceKey(
  event: string,
  dedupeKey: string,
  recipientKey: string,
): string {
  return `${event}:${dedupeKey}:${recipientKey}`;
}

export async function emitNotification(
  input: EmitNotificationInput,
): Promise<{ sent: number; skipped: number; failed: number }> {
  const empty = { sent: 0, skipped: 0, failed: 0 };
  if (!isDatabaseConfigured()) return empty;

  try {
    const rules = await prisma.notificationRule.findMany({
      where: { event: input.event, active: true },
      include: { recipients: true },
    });

    // GLOBAL rules always match; scoped rules must match scope type + id.
    const matching = rules.filter(
      (rule) =>
        rule.scope === "GLOBAL" ||
        (rule.scope === input.scope.type && rule.scopeId === input.scope.id),
    );
    if (matching.length === 0) return empty;

    // Resolve + dedupe recipients across all matching rules.
    const byKey = new Map<string, ResolvedRecipient>();
    for (const rule of matching) {
      const resolved = await resolveRecipients(rule.recipients, input.context);
      for (const r of resolved) if (!byKey.has(r.key)) byKey.set(r.key, r);
    }
    if (byKey.size === 0) return empty;

    // Idempotency: drop recipients already delivered (status SENT).
    const refByRecipientKey = new Map<string, string>();
    for (const key of byKey.keys()) {
      refByRecipientKey.set(
        key,
        referenceKey(input.event, input.dedupeKey, key),
      );
    }
    const existing = await prisma.automationEmailLog.findMany({
      where: {
        type: "NOTIFICATION",
        referenceKey: { in: Array.from(refByRecipientKey.values()) },
        status: "SENT",
      },
      select: { referenceKey: true },
    });
    const alreadySent = new Set(existing.map((e) => e.referenceKey));

    const fragments: NotificationFragment[] = [];
    let skipped = 0;
    for (const recipient of byKey.values()) {
      const ref = refByRecipientKey.get(recipient.key)!;
      if (alreadySent.has(ref)) {
        skipped += 1;
        continue;
      }
      const fragment = input.buildFragment(recipient);
      if (fragment) fragments.push(fragment);
      else skipped += 1;
    }
    if (fragments.length === 0) return { ...empty, skipped };

    const results = await dispatchNotifications(fragments);

    // Log each delivery for idempotency + observability.
    let sent = 0;
    let failed = 0;
    for (const result of results) {
      const ref = refByRecipientKey.get(result.recipientKey);
      if (!ref) continue;
      if (result.status === "SENT") sent += 1;
      else failed += 1;
      await prisma.automationEmailLog
        .upsert({
          where: { type_referenceKey: { type: "NOTIFICATION", referenceKey: ref } },
          create: {
            type: "NOTIFICATION",
            referenceKey: ref,
            recipient: result.recipientKey,
            status: result.status,
            error: result.error ?? null,
            meta: {
              event: input.event,
              channel: result.channel,
              messageId: result.messageId,
              fragments: result.fragments,
            },
          },
          update: {
            status: result.status,
            error: result.error ?? null,
            meta: {
              event: input.event,
              channel: result.channel,
              messageId: result.messageId,
              fragments: result.fragments,
            },
          },
        })
        .catch((e) => {
          console.error("[notification] failed to log delivery", { ref, error: e });
        });
    }

    return { sent, skipped, failed };
  } catch (error) {
    // Swallow: a notification must never break the business operation.
    console.error("[notification] emit failed", {
      event: input.event,
      dedupeKey: input.dedupeKey,
      error,
    });
    return empty;
  }
}
