/**
 * Shared timesheet types + pure helpers for the "Horas" module.
 *
 * Lives outside `mock-data` so the real (database-backed) mode never imports
 * mock modules. `lib/mock-data/timesheet.ts` re-exports everything from here,
 * keeping existing imports working for the demo mode.
 */

/**
 * Canonical activity catalog (Rodada 4.2, docs/horas-operacional-filtros.md
 * section 2), in the order shown in the entry form, default `WORKDAY`.
 * `TimeEntry.activityType` is a `String` column, so this catalog can evolve
 * without a migration; legacy values keep rendering via `DEPRECATED_ACTIVITY_LABELS`.
 */
export const ACTIVITY_TYPES = [
  "WORKDAY",
  "WAITING_PROJECT_START",
  "VACATION",
  "LEAVE",
  "ABSENCE",
  "DAY_OFF",
  "PAID_ABSENCE",
  "ON_CALL",
] as const;

export type ActivityType = (typeof ACTIVITY_TYPES)[number];

export const activityLabels: Record<ActivityType, string> = {
  WORKDAY: "Dia Útil",
  WAITING_PROJECT_START: "Aguardando início no projeto",
  VACATION: "Férias",
  LEAVE: "Licença",
  ABSENCE: "Ausência / Falta",
  DAY_OFF: "Folga",
  PAID_ABSENCE: "Ausência Remunerada",
  ON_CALL: "Sobreaviso",
};

/**
 * Labels for legacy activity values that predate the 4.2 catalog. They are NOT
 * in `ACTIVITY_TYPES` (so the form/filters never offer them), but existing
 * entries keep rendering a readable label instead of a raw code.
 */
export const DEPRECATED_ACTIVITY_LABELS: Record<string, string> = {
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

/**
 * Single source of truth for activity display labels. Resolves the canonical
 * catalog first, then legacy values, and finally falls back to the raw value so
 * an unknown code is shown as-is (never coerced to a wrong label). Used by the
 * Horas grid, the reports layer and the approval queue.
 */
export function activityLabelOf(value: string): string {
  return (
    (activityLabels as Record<string, string>)[value] ??
    DEPRECATED_ACTIVITY_LABELS[value] ??
    value
  );
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

/** Per-day relógio de ponto detail, used to pre-fill the edit form. */
export interface DayClock {
  startTime: string | null;
  endTime: string | null;
  breakStart: string | null;
  breakEnd: string | null;
}

export interface TimeEntryRow {
  id: string;
  projectId: string;
  projectName: string;
  clientName: string;
  /**
   * Activity code. Typed as `string` (not `ActivityType`) so legacy/unknown
   * values read from the database flow through without coercion; the UI renders
   * them via `activityLabelOf`. The entry form only produces canonical values.
   */
  activity: string;
  billable: boolean;
  status: TimeEntryStatus;
  /**
   * Fator de remuneração do lançamento (melhoria #2). 1.00 para atividades
   * normais; um fator fracionário para ON_CALL. As linhas são agrupadas por
   * projeto+atividade+status, então o fator é coerente por linha. Opcional para
   * compatibilidade com a grade demo (assume 1.00 quando ausente).
   */
  multiplier?: number;
  /** Optional note about the work logged on this row. */
  description?: string;
  /** Hours per weekday, aligned with `weekDays` (length 7, Mon→Sun). */
  hours: number[];
  /**
   * Database `TimeEntry` ids per weekday (aligned with `hours`), present only
   * in db mode. `null` means no entry exists for that day on this row.
   */
  entryIds?: (string | null)[];
  /**
   * Per-day relógio de ponto detail (aligned with `hours`). Present when the
   * entry was logged with clock times; `null` for days without an entry or for
   * legacy entries with no recorded times.
   */
  clock?: (DayClock | null)[];
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
      clock: r.clock
        ? r.clock.map((cell) => (cell ? { ...cell } : null))
        : undefined,
    })),
  };
}

/**
 * A row is editable by the consultant while in DRAFT, REJECTED or SUBMITTED.
 * SUBMITTED stays editable so a consultant can fix a still-pending entry; the
 * save re-submits it for approval (a new submittedAt resets the auto-approval
 * delay). APPROVED and CLOSED are terminal/locked and never editable here.
 */
export function isRowEditable(row: TimeEntryRow): boolean {
  return (
    row.status === "DRAFT" ||
    row.status === "REJECTED" ||
    row.status === "SUBMITTED"
  );
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
