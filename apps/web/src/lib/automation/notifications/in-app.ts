/**
 * In-app notification persistence hook for the notification engine (item 3).
 *
 * Called from `emit.ts` right after dispatch. For every EMAIL fragment whose
 * recipient address matches an ACTIVE platform user, it creates a matching
 * in-app notification (the per-user inbox behind the top-bar bell). External
 * recipients (client contacts, static addresses without a user) simply match no
 * user and are skipped. Teams webhooks have no user and are ignored.
 *
 * Best-effort: never throws into `emit` (which already swallows), so a missing
 * table (migration not yet applied) or any DB error is logged and ignored — the
 * email/Teams delivery and the business operation are unaffected.
 */
import { prisma } from "@jumpflow/database";
import {
  createInAppNotifications,
  type CreateInAppNotification,
  type NotificationEventValue,
} from "@/lib/db/notifications";
import type { NotificationFragment } from "./dispatch";

/**
 * Default deep-link per event, so a notification click lands on the relevant
 * screen. Falls back to the app home for anything unmapped.
 */
const EVENT_HREF: Record<string, string> = {
  HOURS_RELEASED: "/app/financeiro",
  CLIENT_BILLING_SUMMARY: "/app/financeiro",
  OVERTIME_ALERT: "/app/horas",
  PROJECT_CREATED: "/app/projetos",
  INVOICING_OVERDUE: "/app/financeiro",
  COMMERCIAL_CONTRACT_MISSING: "/app/comercial",
  OPERATION_CLOSED: "/app/operacao/fechamento",
  FEED_POST_REPLIED: "/app/feed",
  FEED_CONTENT_REACTED: "/app/feed",
  FEED_MENTIONED: "/app/feed",
  HOLIDAY_UPCOMING: "/app/ausencias",
  MISSING_TIMESHEET_REPORT: "/app/aprovacoes",
  ACCESS_INVITE: "/app",
  PRE_INVOICE_ISSUED: "/app/financeiro",
  NFSE_ISSUED: "/app/financeiro",
  PAYMENT_FORECAST: "/app/pagamentos",
};

/** Short text body for a fragment: the prebuilt plain text, else block text. */
function fragmentBody(fragment: NotificationFragment): string | null {
  if (fragment.prebuilt?.text) return fragment.prebuilt.text.trim() || null;
  if (fragment.blocks && fragment.blocks.length > 0) {
    const text = fragment.blocks
      .map((b) => b.text ?? "")
      .join("\n")
      .trim();
    return text || null;
  }
  return null;
}

export async function persistInAppNotifications(
  fragments: NotificationFragment[],
  event: string,
): Promise<void> {
  try {
    // Only EMAIL recipients can map to a user; the address is the natural key.
    const byAddress = new Map<string, NotificationFragment>();
    for (const fragment of fragments) {
      if (fragment.recipient.channel !== "EMAIL") continue;
      const email = fragment.recipient.address.trim().toLowerCase();
      if (email && !byAddress.has(email)) byAddress.set(email, fragment);
    }
    if (byAddress.size === 0) return;

    const users = await prisma.user.findMany({
      where: { status: "ACTIVE", email: { in: Array.from(byAddress.keys()) } },
      select: { id: true, email: true },
    });
    if (users.length === 0) return;

    const href = EVENT_HREF[event] ?? "/app";
    const rows: CreateInAppNotification[] = [];
    for (const user of users) {
      const fragment = byAddress.get(user.email.trim().toLowerCase());
      if (!fragment) continue;
      rows.push({
        userId: user.id,
        event: event as NotificationEventValue,
        title: fragment.title,
        body: fragmentBody(fragment),
        href,
      });
    }

    await createInAppNotifications(rows);
  } catch (error) {
    console.error("[notification] in-app persistence failed", { event, error });
  }
}
