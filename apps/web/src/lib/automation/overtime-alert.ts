/**
 * Overtime alert (Onda 3 — item 3.3).
 *
 * Aggregates recorded overtime (ConsultantHourBankEntry, kind OVERTIME) for a
 * competence month, splits it by contract type (CLT/CLT_FLEX vs PJ) and emits
 * an OVERTIME_ALERT through the notification engine. Recipients/channel come
 * from NotificationRule (configure at /app/admin/notificacoes).
 *
 * The aggregation is pure and unit-tested; the runner is best-effort and never
 * throws (emit swallows). Idempotent per competence (dedupeKey = "YYYY-M").
 */
import { prisma } from "@jumpflow/database";
import { isDatabaseConfigured } from "@/lib/db/config";
import { formatMonth } from "@/lib/format";
import { buildAlertaHoraExtraEmail, type HoraExtraAlertLine } from "./email/templates";
import { emitNotification } from "./notifications/emit";

export type OvertimeContractType = "CLT" | "PJ" | "CLT_FLEX";

export interface OvertimeEntryRow {
  consultantId: string;
  consultantName: string;
  contractType: OvertimeContractType;
  hours: number;
}

/**
 * Sum overtime per consultant and return one line per consultant with overtime,
 * sorted by hours desc. Pure — no I/O.
 */
export function aggregateOvertimeLines(
  rows: OvertimeEntryRow[],
): HoraExtraAlertLine[] {
  const byConsultant = new Map<
    string,
    { name: string; contractType: OvertimeContractType; hours: number }
  >();
  for (const row of rows) {
    if (row.hours <= 0) continue;
    const entry =
      byConsultant.get(row.consultantId) ?? {
        name: row.consultantName,
        contractType: row.contractType,
        hours: 0,
      };
    entry.hours += row.hours;
    byConsultant.set(row.consultantId, entry);
  }
  return Array.from(byConsultant.values())
    .filter((e) => e.hours > 0)
    .sort((a, b) => b.hours - a.hours)
    .map((e) => ({
      consultantName: e.name,
      contractType: e.contractType,
      overtimeHours: e.hours,
    }));
}

export interface RunOvertimeAlertInput {
  /** 1-based month. */
  month: number;
  year: number;
}

export interface RunOvertimeAlertResult {
  competence: string;
  consultants: number;
  sent: number;
  skipped: number;
  failed: number;
}

export async function runOvertimeAlert(
  input: RunOvertimeAlertInput,
): Promise<RunOvertimeAlertResult> {
  const competence = formatMonth(input.month, input.year);
  const empty: RunOvertimeAlertResult = {
    competence,
    consultants: 0,
    sent: 0,
    skipped: 0,
    failed: 0,
  };
  if (!isDatabaseConfigured()) return empty;

  const periodStart = new Date(Date.UTC(input.year, input.month - 1, 1));
  const periodEnd = new Date(Date.UTC(input.year, input.month, 1));

  const entries = await prisma.consultantHourBankEntry.findMany({
    where: {
      kind: "OVERTIME",
      occurredAt: { gte: periodStart, lt: periodEnd },
    },
    select: {
      consultantId: true,
      hours: true,
      consultant: { select: { name: true, contractType: true } },
    },
  });

  const rows: OvertimeEntryRow[] = entries.map((e) => ({
    consultantId: e.consultantId,
    consultantName: e.consultant.name,
    // contractType is nullable on Consultant; default to CLT for grouping.
    contractType: (e.consultant.contractType as OvertimeContractType) ?? "CLT",
    hours: Number(e.hours),
  }));

  const lines = aggregateOvertimeLines(rows);
  if (lines.length === 0) return empty;

  const result = await emitNotification({
    event: "OVERTIME_ALERT",
    scope: { type: "GLOBAL" },
    context: {},
    dedupeKey: `${input.year}-${input.month}`,
    buildFragment: (recipient) => {
      const built = buildAlertaHoraExtraEmail({
        recipientName: recipient.name ?? "equipe",
        competenceLabel: competence,
        lines,
      });
      return {
        recipient,
        title: built.subject,
        prebuilt: built,
        teamsText: `Alerta de hora extra — ${competence}: ${lines.length} consultor(es).`,
      };
    },
  });

  return { competence, consultants: lines.length, ...result };
}
