/**
 * Bridges transactional emails (invite, payment forecast, pre-invoice, NFS-e,
 * the weekly missing-timesheet report) to the NotificationRule engine WITHOUT
 * changing where they render or how they dedupe.
 *
 * Each of those emails already builds + sends its own branded message and keeps
 * its own idempotency guard (AutomationEmailLog). This helper only answers
 * "given the admin rule for this event, who should receive it — and should it
 * go out at all?", so the events show up and stay controllable in
 * /app/admin/notificacoes without moving fiscal/auth idempotency around.
 *
 * Policy:
 *  - no rule at all  → fall back to the natural target(s); never silently drop
 *    a critical fiscal/auth email just because no rule row exists;
 *  - rule inactive   → skip (the admin turned it off);
 *  - rule active     → resolve its recipients (ROLE / STATIC / CLIENT_CONTACT /
 *    PROJECT_MANAGER / EVENT_TARGET). EVENT_TARGET expands to the provided
 *    targets (the invitee / consultant / report list).
 */
import { prisma } from "@jumpflow/database";
import { isDatabaseConfigured } from "@/lib/db/config";
import { resolveRecipients, type ResolveContext } from "./resolve";

export interface EventDelivery {
  /** A rule exists for the event but is turned off — the caller must not send. */
  skip: boolean;
  /** Deduplicated email addresses to send to. */
  emails: string[];
}

export async function resolveEventDelivery(
  event: string,
  opts: { context?: ResolveContext; targets?: ResolveContext["targets"] } = {},
): Promise<EventDelivery> {
  const targets = opts.targets ?? [];
  const fallback = [
    ...new Set(targets.map((t) => t.email).filter((e): e is string => Boolean(e))),
  ];

  if (!isDatabaseConfigured()) return { skip: false, emails: fallback };

  // Best-effort: any failure (missing table, partial mock) falls back to the
  // natural target so a critical email is never dropped by a rule lookup.
  const fetchRule = () =>
    prisma.notificationRule.findFirst({
      // `event` is a validated NotificationEvent string; cast to satisfy the
      // generated enum type without coupling this bridge to it.
      where: { event: event as never, channel: "EMAIL" },
      include: { recipients: true },
      orderBy: { createdAt: "asc" },
    });
  let rule: Awaited<ReturnType<typeof fetchRule>> = null;
  try {
    rule = await fetchRule();
  } catch {
    rule = null;
  }

  if (!rule) return { skip: false, emails: fallback };
  if (!rule.active) return { skip: true, emails: [] };

  const resolved = await resolveRecipients(
    rule.recipients
      .filter((r) => r.channel === "EMAIL")
      .map((r) => ({
        type: r.type,
        channel: r.channel,
        address: r.address,
        name: r.name,
      })),
    { ...(opts.context ?? {}), targets },
  );
  const emails = resolved
    .filter((r) => r.channel === "EMAIL")
    .map((r) => r.address);
  return { skip: false, emails: emails.length > 0 ? emails : fallback };
}
