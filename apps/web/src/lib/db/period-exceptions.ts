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
