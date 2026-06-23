/**
 * Business-event → notification orchestration (Onda 2).
 *
 * Each function gathers the data for one event and calls `emitNotification`.
 * They are best-effort and never throw (emit swallows): safe to call as a
 * post-commit side effect from server actions. When no NotificationRule is
 * configured for the event, nothing is sent.
 */
import { prisma } from "@jumpflow/database";
import {
  buildApuracaoClienteEmail,
  buildLiberacaoEmail,
  buildProjetoCriadoEmail,
  type ApuracaoClienteLine,
} from "@/lib/automation/email/templates";
import { isDatabaseConfigured } from "@/lib/db/config";
import { formatMonth } from "@/lib/format";
import { emitNotification } from "./emit";

const decimal = (v: unknown): number => Number(v ?? 0);

// ---------------------------------------------------------------------------
// PROJECT_CREATED (2.4) — notify Financeiro + comercial on new project.
// ---------------------------------------------------------------------------
export async function notifyProjectCreated(
  projectId: string,
  options?: { hasCommercialContract?: boolean },
): Promise<void> {
  if (!isDatabaseConfigured()) return;
  const project = await prisma.project
    .findUnique({
      where: { id: projectId },
      select: {
        name: true,
        clientId: true,
        client: { select: { name: true } },
        managerUserId: true,
      },
    })
    .catch(() => null);
  if (!project) return;

  const manager = project.managerUserId
    ? await prisma.user
        .findUnique({
          where: { id: project.managerUserId },
          select: { name: true },
        })
        .catch(() => null)
    : null;

  await emitNotification({
    event: "PROJECT_CREATED",
    scope: { type: "GLOBAL" },
    context: { projectId, clientId: project.clientId },
    dedupeKey: projectId,
    buildFragment: (recipient) => {
      const built = buildProjetoCriadoEmail({
        recipientName: recipient.name ?? "equipe",
        projectName: project.name,
        clientName: project.client?.name ?? "—",
        managerName: manager?.name ?? undefined,
        // Contract entity arrives in Onda 5; until then assume present to avoid
        // a misleading "sem contrato" warning on every project.
        hasCommercialContract: options?.hasCommercialContract ?? true,
      });
      return {
        recipient,
        title: built.subject,
        prebuilt: built,
        teamsText: `Novo projeto: ${project.name} (${project.client?.name ?? "—"})`,
      };
    },
  });
}

// ---------------------------------------------------------------------------
// HOURS_RELEASED (2.1) — notify on revenue closing CLOSE (liberação).
// ---------------------------------------------------------------------------
export async function notifyHoursReleased(closingId: string): Promise<void> {
  if (!isDatabaseConfigured()) return;
  const closing = await prisma.revenueClosing
    .findUnique({
      where: { id: closingId },
      select: {
        projectId: true,
        clientId: true,
        month: true,
        year: true,
        totalHours: true,
        project: { select: { name: true } },
        client: { select: { name: true } },
        lines: {
          select: { timeEntry: { select: { consultantId: true } } },
        },
      },
    })
    .catch(() => null);
  if (!closing?.projectId) return; // scope PROJECT needs a project

  const consultants = new Set(
    closing.lines
      .map((l) => l.timeEntry?.consultantId)
      .filter((id): id is string => Boolean(id)),
  );
  const periodLabel = formatMonth(closing.month, closing.year);

  await emitNotification({
    event: "HOURS_RELEASED",
    scope: { type: "PROJECT", id: closing.projectId },
    context: { projectId: closing.projectId, clientId: closing.clientId },
    dedupeKey: closingId,
    buildFragment: (recipient) => {
      const built = buildLiberacaoEmail({
        recipientName: recipient.name ?? "equipe",
        projectName: closing.project?.name ?? "Projeto",
        clientName: closing.client?.name ?? "—",
        periodLabel,
        totalHours: decimal(closing.totalHours),
        consultantsCount: consultants.size,
      });
      return {
        recipient,
        title: built.subject,
        prebuilt: built,
        teamsText: `Horas liberadas: ${closing.project?.name ?? "Projeto"} (${periodLabel})`,
      };
    },
  });
}

// ---------------------------------------------------------------------------
// CLIENT_BILLING_SUMMARY (2.2) — apuração por consultor ao cliente.
// ---------------------------------------------------------------------------
export async function notifyClientBillingSummary(
  closingId: string,
  options?: { showValues?: boolean },
): Promise<void> {
  if (!isDatabaseConfigured()) return;
  const closing = await prisma.revenueClosing
    .findUnique({
      where: { id: closingId },
      select: {
        projectId: true,
        clientId: true,
        month: true,
        year: true,
        project: { select: { name: true } },
        client: { select: { name: true } },
        lines: {
          select: {
            hours: true,
            amount: true,
            timeEntry: {
              select: {
                consultantId: true,
                consultant: { select: { name: true } },
              },
            },
          },
        },
      },
    })
    .catch(() => null);
  if (!closing) return;

  // Aggregate hours + amount per consultant.
  const perConsultant = new Map<
    string,
    { name: string; hours: number; amount: number }
  >();
  for (const line of closing.lines) {
    const c = line.timeEntry?.consultant;
    const id = line.timeEntry?.consultantId;
    if (!c || !id) continue;
    const entry = perConsultant.get(id) ?? { name: c.name, hours: 0, amount: 0 };
    entry.hours += decimal(line.hours);
    entry.amount += decimal(line.amount);
    perConsultant.set(id, entry);
  }
  const lines: ApuracaoClienteLine[] = Array.from(perConsultant.values()).map(
    (c) => ({ consultantName: c.name, hours: c.hours, amount: c.amount }),
  );
  if (lines.length === 0) return;

  const totalHours = lines.reduce((s, l) => s + l.hours, 0);
  const totalAmount = lines.reduce((s, l) => s + (l.amount ?? 0), 0);
  const competenceLabel = formatMonth(closing.month, closing.year);

  await emitNotification({
    event: "CLIENT_BILLING_SUMMARY",
    scope: { type: "PROJECT", id: closing.projectId ?? undefined },
    context: { projectId: closing.projectId ?? undefined, clientId: closing.clientId },
    dedupeKey: closingId,
    buildFragment: (recipient) => {
      const built = buildApuracaoClienteEmail({
        clientContactName: recipient.name ?? "cliente",
        clientName: closing.client?.name ?? "—",
        projectName: closing.project?.name ?? "Projeto",
        competenceLabel,
        lines,
        totalHours,
        totalAmount,
        showValues: options?.showValues ?? true,
      });
      return { recipient, title: built.subject, prebuilt: built };
    },
  });
}
