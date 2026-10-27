/**
 * Data layer dos templates de e-mail editáveis (/app/admin/templates-email).
 * Leituras/escritas finas; autorização + auditoria ficam nas server actions.
 */
import { prisma } from "@jumpflow/database";
import type { NotificationEventName } from "@/lib/automation/email/template-registry";

export interface EmailTemplateRow {
  id: string;
  event: NotificationEventName;
  subject: string;
  body: string;
  active: boolean;
  updatedByUserId: string | null;
  updatedByName: string | null;
  updatedAt: string;
}

export async function listEmailTemplates(): Promise<EmailTemplateRow[]> {
  const rows = await prisma.emailTemplate.findMany({ orderBy: { event: "asc" } });
  const userIds = [
    ...new Set(rows.map((r) => r.updatedByUserId).filter((id): id is string => Boolean(id))),
  ];
  const users = userIds.length
    ? await prisma.user.findMany({
        where: { id: { in: userIds } },
        select: { id: true, name: true },
      })
    : [];
  const names = new Map(users.map((u) => [u.id, u.name]));
  return rows.map((r) => ({
    id: r.id,
    event: r.event as NotificationEventName,
    subject: r.subject,
    body: r.body,
    active: r.active,
    updatedByUserId: r.updatedByUserId,
    updatedByName: r.updatedByUserId ? (names.get(r.updatedByUserId) ?? null) : null,
    updatedAt: r.updatedAt.toISOString(),
  }));
}

export async function getEmailTemplate(event: NotificationEventName) {
  return prisma.emailTemplate.findUnique({ where: { event } });
}

export async function upsertEmailTemplate(input: {
  event: NotificationEventName;
  subject: string;
  body: string;
  active: boolean;
  updatedByUserId: string | null;
}) {
  return prisma.emailTemplate.upsert({
    where: { event: input.event },
    create: {
      event: input.event,
      subject: input.subject,
      body: input.body,
      active: input.active,
      updatedByUserId: input.updatedByUserId,
    },
    update: {
      subject: input.subject,
      body: input.body,
      active: input.active,
      updatedByUserId: input.updatedByUserId,
    },
  });
}

export async function deleteEmailTemplate(event: NotificationEventName) {
  return prisma.emailTemplate.deleteMany({ where: { event } });
}
