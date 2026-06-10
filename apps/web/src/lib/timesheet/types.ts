/**
 * Shared timesheet types + pure helpers for the "Horas" module.
 *
 * Lives outside `mock-data` so the real (database-backed) mode never imports
 * mock modules. `lib/mock-data/timesheet.ts` re-exports everything from here,
 * keeping existing imports working for the demo mode.
 */

export const ACTIVITY_TYPES = [
  "DEVELOPMENT",
  "MEETING",
  "DISCOVERY",
  "SUPPORT",
  "DOCS",
] as const;

export type ActivityType = (typeof ACTIVITY_TYPES)[number];

export const activityLabels: Record<ActivityType, string> = {
  DEVELOPMENT: "Desenvolvimento",
  MEETING: "Reunião",
  DISCOVERY: "Discovery",
  SUPPORT: "Suporte",
  DOCS: "Documentação",
};

/** Activity options, in the order shown in the entry form. */
export const activityOrder: ActivityType[] = [...ACTIVITY_TYPES];

export function isActivityType(value: string): value is ActivityType {
  return (ACTIVITY_TYPES as readonly string[]).includes(value);
}

/** Mirrors `TimeEntryStatus` in the Prisma schema (CLOSED is terminal). */
export type TimeEntryStatus =
  | "DRAFT"
  | "SUBMITTED"
  | "APPROVED"
  | "REJECTED"
  | "CLOSED";

export const timeEntryStatusLabels: Record<TimeEntryStatus, string> = {
  DRAFT: "Rascunho",
  SUBMITTED: "Enviado",
  APPROVED: "Aprovado",
  REJECTED: "Reprovado",
  CLOSED: "Fechado",
};

export interface WeekDay {
  /** Short weekday label, e.g. "Seg". */
  label: string;
  /** ISO date yyyy-mm-dd. */
  date: string;
  weekend: boolean;
}

export interface TimeEntryRow {
  id: string;
  projectId: string;
  projectName: string;
  clientName: string;
  activity: ActivityType;
  billable: boolean;
  status: TimeEntryStatus;
  /** Optional note about the work logged on this row. */
  description?: string;
  /** Hours per weekday, aligned with `weekDays` (length 7, Mon→Sun). */
  hours: number[];
  /**
   * Database `TimeEntry` ids per weekday (aligned with `hours`), present only
   * in db mode. `null` means no entry exists for that day on this row.
   */
  entryIds?: (string | null)[];
}

export interface TimesheetWeek {
  /** Human label for the period, e.g. "Semana 24 · 08–14 jun". */
  label: string;
  startDate: string;
  endDate: string;
  /** Overall period status, derived from the rows. */
  status: TimeEntryStatus;
  days: WeekDay[];
  rows: TimeEntryRow[];
}

/** Deep clone a week so local edits never mutate the shared mock. */
export function cloneWeek(week: TimesheetWeek): TimesheetWeek {
  return {
    ...week,
    days: week.days.map((d) => ({ ...d })),
    rows: week.rows.map((r) => ({
      ...r,
      hours: [...r.hours],
      entryIds: r.entryIds ? [...r.entryIds] : undefined,
    })),
  };
}

/** A row is editable by the consultant only while in DRAFT or REJECTED. */
export function isRowEditable(row: TimeEntryRow): boolean {
  return row.status === "DRAFT" || row.status === "REJECTED";
}

/** Whether a row may be carried over when copying the previous week. */
export function isRowCopyable(row: TimeEntryRow): boolean {
  // Skip rejected rows and empty rows (copying a zero-hour line just clutters
  // the new week).
  return row.status !== "REJECTED" && rowTotal(row) > 0;
}

/** Derive the overall period status from its rows (worst-case wins). */
export function deriveWeekStatus(week: TimesheetWeek): TimeEntryStatus {
  if (week.rows.length === 0) return "DRAFT";
  if (week.rows.some((r) => r.status === "REJECTED")) return "REJECTED";
  if (week.rows.some((r) => r.status === "DRAFT")) return "DRAFT";
  if (week.rows.some((r) => r.status === "SUBMITTED")) return "SUBMITTED";
  return "APPROVED";
}

/** Total hours logged in a single row across the week. */
export function rowTotal(row: TimeEntryRow): number {
  return row.hours.reduce((sum, h) => sum + h, 0);
}

/** Total hours logged across all rows for a given weekday index (0–6). */
export function dayTotal(week: TimesheetWeek, dayIndex: number): number {
  return week.rows.reduce((sum, row) => sum + (row.hours[dayIndex] ?? 0), 0);
}

/** Grand total of hours logged in the week. */
export function weekTotal(week: TimesheetWeek): number {
  return week.rows.reduce((sum, row) => sum + rowTotal(row), 0);
}

/**
 * Error/result contract of the server actions. The canonical definition moved
 * to `lib/actions/result.ts` (shared with Despesas); re-exported here so
 * existing Horas imports keep working.
 */
export type { ActionResult, ErrorCode } from "@/lib/actions/result";

/** Count of rows by status, for the week summary chips. */
export function statusCounts(
  week: TimesheetWeek,
): Record<TimeEntryStatus, number> {
  const counts: Record<TimeEntryStatus, number> = {
    DRAFT: 0,
    SUBMITTED: 0,
    APPROVED: 0,
    REJECTED: 0,
    CLOSED: 0,
  };
  for (const row of week.rows) counts[row.status] += 1;
  return counts;
}
