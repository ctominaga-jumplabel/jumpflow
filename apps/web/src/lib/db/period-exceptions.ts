/**
 * Exceptions for a competence month — surfaced in the liberação/financeiro
 * review (Onda 3 item 3.4): on-call (sobreaviso) and overtime (hora extra), so
 * the reviewer sees what falls outside the regular hours before closing.
 */
import { prisma } from "@jumpflow/database";
import { toIsoDate } from "@/lib/timesheet/week";
import { onCallEffectiveHours, type OnCallStatus } from "./oncall";

const num = (v: unknown): number => Number(v ?? 0);

export interface PeriodOnCallException {
  id: string;
  date: string;
  consultantName: string;
  projectName: string | null;
  hours: number;
  multiplier: number;
  effectiveHours: number;
  status: OnCallStatus;
  hasAttachment: boolean;
}

export interface PeriodOvertimeException {
  id: string;
  date: string;
  consultantName: string;
  contractType: "CLT" | "PJ" | "CLT_FLEX" | null;
  hours: number;
  note: string | null;
}

export interface PeriodExceptions {
  onCall: PeriodOnCallException[];
  overtime: PeriodOvertimeException[];
}

/**
 * One time-entry that falls outside a regular billable workday and therefore
 * deserves a look before the revenue closing is released. Surfaced per project
 * in the "Contas a Receber" tab (P5).
 */
export interface RevenueExceptionEntry {
  id: string;
  projectId: string;
  date: string;
  consultantName: string;
  activityType: string;
  hours: number;
  /** Whether the entry carries an attachment (justificativa/comprovante). */
  hasAttachment: boolean;
}

export type RevenueExceptionsByProject = Record<string, RevenueExceptionEntry[]>;

/**
 * Pure rule for what counts as a revenue-side exception on an approved time
 * entry: anything that is NOT a plain "Dia Útil" (activityType !== "WORKDAY"),
 * OR any entry that carries an attachment. Exported for unit tests.
 */
export function isRevenueExceptionEntry(input: {
  activityType: string;
  hasAttachment: boolean;
}): boolean {
  return input.activityType !== "WORKDAY" || input.hasAttachment;
}

/**
 * Approved time entries in the competence month that qualify as exceptions
 * (see `isRevenueExceptionEntry`), grouped by projectId so the closing table
 * can render a per-line "Exceções" indicator + drill-down. Only APPROVED
 * entries are considered: those are the ones that feed (or are expected to
 * feed) the revenue closing.
 */
export async function listRevenueExceptionsByProject(input: {
  month: number;
  year: number;
}): Promise<RevenueExceptionsByProject> {
  const start = new Date(Date.UTC(input.year, input.month - 1, 1));
  const end = new Date(Date.UTC(input.year, input.month, 1));

  const rows = await prisma.timeEntry.findMany({
    where: {
      status: "APPROVED",
      date: { gte: start, lt: end },
      // Must mirror `isRevenueExceptionEntry` (the pure, unit-tested rule):
      // activityType != WORKDAY OR has an attachment. `activityType` is a
      // non-null String @default("WORKDAY"), so `not: "WORKDAY"` is safe (no
      // NULL trap). Keep both in sync if the exception rule ever changes.
      OR: [{ activityType: { not: "WORKDAY" } }, { attachment: { isNot: null } }],
    },
    orderBy: [{ projectId: "asc" }, { date: "asc" }],
    select: {
      id: true,
      projectId: true,
      date: true,
      hours: true,
      activityType: true,
      consultant: { select: { name: true } },
      attachment: { select: { id: true } },
    },
  });

  const byProject: RevenueExceptionsByProject = {};
  for (const row of rows) {
    const entry: RevenueExceptionEntry = {
      id: row.id,
      projectId: row.projectId,
      date: toIsoDate(row.date),
      consultantName: row.consultant.name,
      activityType: row.activityType,
      hours: num(row.hours),
      hasAttachment: row.attachment != null,
    };
    (byProject[row.projectId] ??= []).push(entry);
  }
  return byProject;
}

export async function listPeriodExceptions(input: {
  month: number;
  year: number;
}): Promise<PeriodExceptions> {
  const start = new Date(Date.UTC(input.year, input.month - 1, 1));
  const end = new Date(Date.UTC(input.year, input.month, 1));

  const [onCallRows, overtimeRows] = await Promise.all([
    prisma.onCallEntry.findMany({
      where: { date: { gte: start, lt: end } },
      orderBy: { date: "asc" },
      select: {
        id: true,
        date: true,
        hours: true,
        multiplier: true,
        status: true,
        consultant: { select: { name: true } },
        project: { select: { name: true } },
        attachment: { select: { id: true } },
      },
    }),
    prisma.consultantHourBankEntry.findMany({
      where: { kind: "OVERTIME", occurredAt: { gte: start, lt: end } },
      orderBy: { occurredAt: "asc" },
      select: {
        id: true,
        occurredAt: true,
        hours: true,
        note: true,
        consultant: { select: { name: true, contractType: true } },
      },
    }),
  ]);

  return {
    onCall: onCallRows.map((r) => {
      const hours = num(r.hours);
      const multiplier = num(r.multiplier);
      return {
        id: r.id,
        date: toIsoDate(r.date),
        consultantName: r.consultant.name,
        projectName: r.project?.name ?? null,
        hours,
        multiplier,
        effectiveHours: onCallEffectiveHours(hours, multiplier),
        status: r.status as OnCallStatus,
        hasAttachment: r.attachment != null,
      };
    }),
    overtime: overtimeRows.map((r) => ({
      id: r.id,
      date: toIsoDate(r.occurredAt),
      consultantName: r.consultant.name,
      contractType:
        (r.consultant.contractType as PeriodOvertimeException["contractType"]) ??
        null,
      hours: num(r.hours),
      note: r.note,
    })),
  };
}
