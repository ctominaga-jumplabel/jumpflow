/**
 * Recipient resolution for the notification engine.
 *
 * Turns a NotificationRule's recipients (STATIC / ROLE / PROJECT_MANAGER /
 * CLIENT_CONTACT / EVENT_TARGET) into concrete `ResolvedRecipient`s with real
 * addresses. CLIENT_CONTACT resolves to the client's `billingEmails` (cobrança),
 * falling back to `contactEmail` when the list is empty. Dynamic types need a
 * context (project/client) supplied by the emitting event.
 *
 * All DB reads are best-effort: a missing manager or contact simply yields no
 * recipient for that entry — the engine never throws here (see emit.ts).
 */
import { prisma } from "@jumpflow/database";
import type { RoleName } from "@/lib/auth/roles";
import { isDatabaseConfigured } from "@/lib/db/config";
import type { NotificationChannel, ResolvedRecipient } from "./dispatch";

export interface ResolveContext {
  projectId?: string;
  clientId?: string;
  /**
   * Addresses inherent to the emitting event (the invitee, the consultant, the
   * report recipient list). Consumed by the EVENT_TARGET recipient type, whose
   * "who" is decided by the action, not by a role/contact lookup.
   */
  targets?: Array<{ email: string; name?: string | null }>;
}

interface RecipientRow {
  type: "STATIC" | "ROLE" | "PROJECT_MANAGER" | "CLIENT_CONTACT" | "EVENT_TARGET";
  channel: NotificationChannel;
  address: string | null;
  name: string | null;
}

function emailRecipient(
  address: string,
  name?: string | null,
): ResolvedRecipient {
  return { key: address.toLowerCase(), channel: "EMAIL", address, name: name ?? undefined };
}

async function resolveRole(roleName: string): Promise<ResolvedRecipient[]> {
  const users = await prisma.user.findMany({
    where: {
      status: "ACTIVE",
      roles: { some: { role: { name: roleName as RoleName } } },
    },
    select: { name: true, email: true },
  });
  return users.map((u) => emailRecipient(u.email, u.name));
}

async function resolveProjectManager(
  projectId?: string,
): Promise<ResolvedRecipient[]> {
  if (!projectId) return [];
  const project = await prisma.project.findUnique({
    where: { id: projectId },
    select: { managerUserId: true },
  });
  if (!project?.managerUserId) return [];
  const manager = await prisma.user.findUnique({
    where: { id: project.managerUserId },
    select: { name: true, email: true },
  });
  return manager ? [emailRecipient(manager.email, manager.name)] : [];
}

async function resolveClientContact(
  context: ResolveContext,
): Promise<ResolvedRecipient[]> {
  let clientId = context.clientId;
  if (!clientId && context.projectId) {
    const project = await prisma.project.findUnique({
      where: { id: context.projectId },
      select: { clientId: true },
    });
    clientId = project?.clientId;
  }
  if (!clientId) return [];
  const client = await prisma.client.findUnique({
    where: { id: clientId },
    select: { name: true, contactEmail: true, billingEmails: true },
  });
  if (!client) return [];
  // Cobrança ao cliente (P4): a lista `billingEmails` é a fonte de verdade dos
  // destinatários de cobrança; `contactEmail` é apenas o fallback quando ela
  // está vazia. Mantém CLIENT_CONTACT coerente com o caminho de fallback da
  // pré-fatura (resolveBillingRecipients), evitando a armadilha de uma regra
  // CLIENT_CONTACT descartar silenciosamente os e-mails de cobrança.
  const emails =
    client.billingEmails.length > 0
      ? client.billingEmails
      : client.contactEmail
        ? [client.contactEmail]
        : [];
  return emails.map((email) => emailRecipient(email, client.name));
}

/**
 * Resolve one rule's recipients. Deduplicates by recipient key so the same
 * person targeted by two entries (e.g. ROLE FINANCE + a STATIC email) is only
 * notified once.
 */
export async function resolveRecipients(
  recipients: RecipientRow[],
  context: ResolveContext,
): Promise<ResolvedRecipient[]> {
  if (!isDatabaseConfigured()) return [];
  const resolved: ResolvedRecipient[] = [];

  for (const r of recipients) {
    switch (r.type) {
      case "STATIC":
        if (r.address) {
          resolved.push({
            key:
              r.channel === "TEAMS"
                ? `teams:${r.address}`
                : r.address.toLowerCase(),
            channel: r.channel,
            address: r.address,
            name: r.name ?? undefined,
          });
        }
        break;
      case "ROLE":
        if (r.address) resolved.push(...(await resolveRole(r.address)));
        break;
      case "PROJECT_MANAGER":
        resolved.push(...(await resolveProjectManager(context.projectId)));
        break;
      case "CLIENT_CONTACT":
        resolved.push(...(await resolveClientContact(context)));
        break;
      case "EVENT_TARGET":
        for (const t of context.targets ?? []) {
          if (t.email) resolved.push(emailRecipient(t.email, t.name));
        }
        break;
    }
  }

  const seen = new Set<string>();
  return resolved.filter((r) => {
    if (seen.has(r.key)) return false;
    seen.add(r.key);
    return true;
  });
}
