/**
 * Overdue invoicing reminder (Onda 5 — item 5.2).
 *
 * Finds revenue closings that are CLOSED but not yet INVOICED (faturamento não
 * realizado) and emits INVOICING_OVERDUE through the notification engine to the
 * configured recipients (Financeiro/Comercial). Recurring: dedupeKey is the run
 * date, so each scheduled run sends once (a nag until the closing is invoiced).
 */
import { prisma } from "@jumpflow/database";
import {
  buildFaturamentoPendenteEmail,
  type FaturamentoPendenteLine,
} from "@/lib/automation/email/templates";
import { isDatabaseConfigured } from "@/lib/db/config";
import { formatMonth } from "@/lib/format";
import { emitNotification } from "./notifications/emit";

const num = (v: unknown): number => Number(v ?? 0);

/** Whole days between two dates (>= 0). Pure. */
export function overdueDays(closedAt: Date | null, now: Date): number {
  if (!closedAt) return 0;
  const ms = now.getTime() - closedAt.getTime();
  return Math.max(0, Math.floor(ms / 86_400_000));
}

export interface OverdueClosing {
  projectName: string | null;
  clientName: string;
  month: number;
  year: number;
  amount: number;
  closedAt: Date | null;
}

/** Map closings to email lines, sorted by days open desc. Pure. */
export function buildOverdueLines(
  closings: OverdueClosing[],
  now: Date,
): FaturamentoPendenteLine[] {
  return closings
    .map((c) => ({
      projectName: c.projectName ?? "—",
      clientName: c.clientName,
      competenceLabel: formatMonth(c.month, c.year),
      amount: c.amount,
      daysOpen: overdueDays(c.closedAt, now),
    }))
    .sort((a, b) => b.daysOpen - a.daysOpen);
}

export interface RunOverdueInvoicingResult {
  closings: number;
  sent: number;
  skipped: number;
  failed: number;
}

export async function runOverdueInvoicingReminder(input: {
  now: Date;
  appUrl?: string;
}): Promise<RunOverdueInvoicingResult> {
  const empty = { closings: 0, sent: 0, skipped: 0, failed: 0 };
  if (!isDatabaseConfigured()) return empty;

  const rows = await prisma.revenueClosing.findMany({
    where: { status: "CLOSED" },
    select: {
      month: true,
      year: true,
      totalAmount: true,
      closedAt: true,
      project: { select: { name: true } },
      client: { select: { name: true } },
    },
  });
  if (rows.length === 0) return empty;

  const lines = buildOverdueLines(
    rows.map((r) => ({
      projectName: r.project?.name ?? null,
      clientName: r.client?.name ?? "—",
      month: r.month,
      year: r.year,
      amount: num(r.totalAmount),
      closedAt: r.closedAt,
    })),
    input.now,
  );

  const dedupeKey = input.now.toISOString().slice(0, 10); // one nag per run-day

  const result = await emitNotification({
    event: "INVOICING_OVERDUE",
    scope: { type: "GLOBAL" },
    context: {},
    dedupeKey,
    buildFragment: (recipient) => {
      const built = buildFaturamentoPendenteEmail({
        recipientName: recipient.name ?? "equipe",
        lines,
        appUrl: input.appUrl,
      });
      return {
        recipient,
        title: built.subject,
        prebuilt: built,
        teamsText: `Faturamento pendente: ${lines.length} fechamento(s).`,
      };
    },
  });

  return { closings: lines.length, ...result };
}
