import { prisma, Prisma } from "@jumpflow/database";

/**
 * In-app notification center (item 3) persistence.
 *
 * The per-user inbox behind the top-bar bell. Notifications are created in
 * parallel with EMAIL/TEAMS deliveries whenever a resolved recipient maps to a
 * real platform user (see lib/automation/notifications/in-app.ts). Every read
 * here is scoped by `userId` server-side: a user only ever sees/mutates its own
 * notifications. All functions assume a database is configured — callers must
 * guard with `isDatabaseConfigured()`.
 */

/** The NotificationEvent enum value, sourced from the generated Prisma input. */
export type NotificationEventValue = NonNullable<
  Prisma.AppNotificationCreateManyInput["event"]
>;

/** Serializable view sent to the client (dates as ISO strings). */
export interface NotificationView {
  id: string;
  event: string;
  title: string;
  body: string | null;
  href: string | null;
  read: boolean;
  createdAt: string;
}

export interface CreateInAppNotification {
  userId: string;
  event: NotificationEventValue;
  title: string;
  body?: string | null;
  href?: string | null;
}

/** Recent notifications for a user, newest first. `limit` clamped to [1, 50]. */
export async function listUserNotifications(
  userId: string,
  opts: { limit?: number; unreadOnly?: boolean } = {},
): Promise<NotificationView[]> {
  const rows = await prisma.appNotification.findMany({
    where: { userId, ...(opts.unreadOnly ? { readAt: null } : {}) },
    orderBy: { createdAt: "desc" },
    take: Math.min(Math.max(1, opts.limit ?? 20), 50),
  });
  return rows.map((n) => ({
    id: n.id,
    event: n.event,
    title: n.title,
    body: n.body,
    href: n.href,
    read: n.readAt !== null,
    createdAt: n.createdAt.toISOString(),
  }));
}

/** Count of unread notifications — the source of the bell badge. */
export async function countUnreadNotifications(userId: string): Promise<number> {
  return prisma.appNotification.count({ where: { userId, readAt: null } });
}

/**
 * Mark a single notification as read. Scoped by `userId` so a hand-crafted id
 * cannot mark another user's notification. Idempotent (already-read ⇒ 0 rows).
 * Returns the number of rows updated.
 */
export async function markNotificationRead(
  userId: string,
  id: string,
): Promise<number> {
  const res = await prisma.appNotification.updateMany({
    where: { id, userId, readAt: null },
    data: { readAt: new Date() },
  });
  return res.count;
}

/** Mark every unread notification of the user as read. Returns rows updated. */
export async function markAllNotificationsRead(userId: string): Promise<number> {
  const res = await prisma.appNotification.updateMany({
    where: { userId, readAt: null },
    data: { readAt: new Date() },
  });
  return res.count;
}

/**
 * Bulk-create in-app notifications. Best-effort by contract of the caller: the
 * notification engine wraps this so a failure never breaks the business
 * operation or the email/Teams delivery. Titles are capped defensively.
 */
export async function createInAppNotifications(
  rows: CreateInAppNotification[],
): Promise<number> {
  if (rows.length === 0) return 0;
  const res = await prisma.appNotification.createMany({
    data: rows.map((r) => ({
      userId: r.userId,
      event: r.event,
      title: r.title.slice(0, 300),
      body: r.body ? r.body.slice(0, 2000) : null,
      href: r.href ?? null,
    })),
  });
  return res.count;
}
