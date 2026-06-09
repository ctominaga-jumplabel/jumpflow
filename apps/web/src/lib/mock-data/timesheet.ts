/**
 * Mocked weekly timesheet for the MVP "Horas" module.
 *
 * NOTE: not connected to the database yet. Shapes mirror `TimesheetPeriod` /
 * `TimeEntry` in docs/modelo-dados.md (weekly period, one row per
 * project+activity, hours per weekday). Swap for Prisma queries later.
 */

export type TimeEntryStatus = "DRAFT" | "SUBMITTED" | "APPROVED" | "REJECTED";

export type ActivityType =
  | "DEVELOPMENT"
  | "MEETING"
  | "DISCOVERY"
  | "SUPPORT"
  | "DOCS";

export const activityLabels: Record<ActivityType, string> = {
  DEVELOPMENT: "Desenvolvimento",
  MEETING: "Reunião",
  DISCOVERY: "Discovery",
  SUPPORT: "Suporte",
  DOCS: "Documentação",
};

export const timeEntryStatusLabels: Record<TimeEntryStatus, string> = {
  DRAFT: "Rascunho",
  SUBMITTED: "Enviado",
  APPROVED: "Aprovado",
  REJECTED: "Reprovado",
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
  /** Hours per weekday, aligned with `weekDays` (length 7, Mon→Sun). */
  hours: number[];
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

/** Current mocked week (Mon 2026-06-08 → Sun 2026-06-14). */
export const currentWeek: TimesheetWeek = {
  label: "Semana 24 · 08–14 jun 2026",
  startDate: "2026-06-08",
  endDate: "2026-06-14",
  status: "DRAFT",
  days: [
    { label: "Seg", date: "2026-06-08", weekend: false },
    { label: "Ter", date: "2026-06-09", weekend: false },
    { label: "Qua", date: "2026-06-10", weekend: false },
    { label: "Qui", date: "2026-06-11", weekend: false },
    { label: "Sex", date: "2026-06-12", weekend: false },
    { label: "Sáb", date: "2026-06-13", weekend: true },
    { label: "Dom", date: "2026-06-14", weekend: true },
  ],
  rows: [
    {
      id: "te-1",
      projectId: "prj-atlas",
      projectName: "Atlas",
      clientName: "Vix Energia",
      activity: "DEVELOPMENT",
      billable: true,
      status: "SUBMITTED",
      hours: [6, 6, 0, 0, 0, 0, 0],
    },
    {
      id: "te-2",
      projectId: "prj-atlas",
      projectName: "Atlas",
      clientName: "Vix Energia",
      activity: "MEETING",
      billable: true,
      status: "DRAFT",
      hours: [2, 1, 0, 0, 0, 0, 0],
    },
    {
      id: "te-3",
      projectId: "prj-orion",
      projectName: "Órion",
      clientName: "Banco Sul",
      activity: "DEVELOPMENT",
      billable: true,
      status: "DRAFT",
      hours: [0, 1, 0, 0, 0, 0, 0],
    },
    {
      id: "te-4",
      projectId: "prj-vega",
      projectName: "Vega",
      clientName: "Loja Norte",
      activity: "DOCS",
      billable: false,
      status: "REJECTED",
      hours: [0, 0, 0, 0, 0, 0, 0],
    },
  ],
};

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

/** Count of rows by status, for the week summary chips. */
export function statusCounts(
  week: TimesheetWeek,
): Record<TimeEntryStatus, number> {
  const counts: Record<TimeEntryStatus, number> = {
    DRAFT: 0,
    SUBMITTED: 0,
    APPROVED: 0,
    REJECTED: 0,
  };
  for (const row of week.rows) counts[row.status] += 1;
  return counts;
}
