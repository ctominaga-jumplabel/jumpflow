/**
 * Data layer for notification rules (admin CRUD at /app/admin/notificacoes).
 *
 * Rules drive the notification engine (lib/automation/notifications): for an
 * event + scope they define channel, grouping and recipients. Reads/writes are
 * thin; authorization + audit live in the server actions.
 */
import { prisma } from "@jumpflow/database";

export type NotificationEventKey =
  | "HOURS_RELEASED"
  | "CLIENT_BILLING_SUMMARY"
  | "OVERTIME_ALERT"
  | "PROJECT_CREATED"
  | "INVOICING_OVERDUE"
  | "COMMERCIAL_CONTRACT_MISSING";

export type NotificationScopeKey = "GLOBAL" | "PROJECT" | "ALLOCATION";
export type NotificationChannelKey = "EMAIL" | "TEAMS";
export type NotificationRecipientTypeKey =
  | "STATIC"
  | "ROLE"
  | "PROJECT_MANAGER"
  | "CLIENT_CONTACT";

export interface NotificationRecipientView {
  id: string;
  type: NotificationRecipientTypeKey;
  channel: NotificationChannelKey;
  address: string | null;
  name: string | null;
}

export interface NotificationRuleView {
  id: string;
  event: NotificationEventKey;
  scope: NotificationScopeKey;
  scopeId: string | null;
  channel: NotificationChannelKey;
  groupByRecipient: boolean;
  active: boolean;
  recipients: NotificationRecipientView[];
}

export async function listNotificationRules(): Promise<NotificationRuleView[]> {
  const rules = await prisma.notificationRule.findMany({
    orderBy: [{ event: "asc" }, { createdAt: "asc" }],
    include: { recipients: { orderBy: { createdAt: "asc" } } },
  });
  return rules.map((r) => ({
    id: r.id,
    event: r.event as NotificationEventKey,
    scope: r.scope as NotificationScopeKey,
    scopeId: r.scopeId,
    channel: r.channel as NotificationChannelKey,
    groupByRecipient: r.groupByRecipient,
    active: r.active,
    recipients: r.recipients.map((rec) => ({
      id: rec.id,
      type: rec.type as NotificationRecipientTypeKey,
      channel: rec.channel as NotificationChannelKey,
      address: rec.address,
      name: rec.name,
    })),
  }));
}

export interface CreateRuleInput {
  event: NotificationEventKey;
  scope: NotificationScopeKey;
  scopeId?: string | null;
  channel: NotificationChannelKey;
  groupByRecipient: boolean;
}

export async function createNotificationRule(
  input: CreateRuleInput,
): Promise<{ id: string }> {
  const created = await prisma.notificationRule.create({
    data: {
      event: input.event,
      scope: input.scope,
      scopeId: input.scope === "GLOBAL" ? null : (input.scopeId ?? null),
      channel: input.channel,
      groupByRecipient: input.groupByRecipient,
    },
    select: { id: true },
  });
  return created;
}

export async function setNotificationRuleActive(
  id: string,
  active: boolean,
): Promise<void> {
  await prisma.notificationRule.update({ where: { id }, data: { active } });
}

export async function deleteNotificationRule(id: string): Promise<void> {
  await prisma.notificationRule.delete({ where: { id } });
}

export interface AddRecipientInput {
  ruleId: string;
  type: NotificationRecipientTypeKey;
  channel: NotificationChannelKey;
  address?: string | null;
  name?: string | null;
}

export async function addNotificationRecipient(
  input: AddRecipientInput,
): Promise<{ id: string }> {
  const created = await prisma.notificationRecipient.create({
    data: {
      ruleId: input.ruleId,
      type: input.type,
      channel: input.channel,
      // Dynamic types (PROJECT_MANAGER / CLIENT_CONTACT) carry no literal address.
      address:
        input.type === "STATIC" || input.type === "ROLE"
          ? (input.address?.trim() || null)
          : null,
      name: input.name?.trim() || null,
    },
    select: { id: true },
  });
  return created;
}

export async function removeNotificationRecipient(id: string): Promise<void> {
  await prisma.notificationRecipient.delete({ where: { id } });
}

/** Active projects for the PROJECT scope selector. */
export async function listProjectsForScope(): Promise<
  Array<{ id: string; name: string }>
> {
  return prisma.project.findMany({
    where: { status: { in: ["ACTIVE", "PROPOSAL", "PAUSED"] } },
    select: { id: true, name: true },
    orderBy: { name: "asc" },
  });
}
