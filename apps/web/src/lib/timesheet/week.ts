import type { WeekDay } from "./types";

/**
 * Pure UTC week helpers for the Horas module.
 *
 * Domain conventions (docs/horas-persistencia.md):
 * - A week runs Monday..Sunday. `weekStart` is Monday 00:00 UTC.
 * - Every timesheet date is date-only, normalized to MIDNIGHT UTC — the
 *   auto-approval engine groups entries by UTC day, so any drift here would
 *   silently break daily totals.
 *
 * No server-only imports: safe for client components and unit tests.
 */

const DAY_MS = 24 * 60 * 60 * 1000;

const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

/** Short pt-BR weekday labels, Monday-first. */
const WEEKDAY_LABELS = ["Seg", "Ter", "Qua", "Qui", "Sex", "Sáb", "Dom"];

/** Short pt-BR month names used in week labels. */
const MONTH_SHORT = [
  "jan",
  "fev",
  "mar",
  "abr",
  "mai",
  "jun",
  "jul",
  "ago",
  "set",
  "out",
  "nov",
  "dez",
];

/**
 * Parse a strict `yyyy-mm-dd` string into a Date at midnight UTC.
 * Returns null for malformed strings or impossible dates (e.g. 2026-02-30).
 */
export function parseIsoDateUtc(iso: string): Date | null {
  if (!ISO_DATE_RE.test(iso)) return null;
  const [year, month, day] = iso.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  if (
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== month - 1 ||
    date.getUTCDate() !== day
  ) {
    return null;
  }
  return date;
}

/** Format a Date as `yyyy-mm-dd` using its UTC fields. */
export function toIsoDate(date: Date): string {
  const y = date.getUTCFullYear();
  const m = String(date.getUTCMonth() + 1).padStart(2, "0");
  const d = String(date.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

/** Normalize any Date to midnight UTC of the same UTC day. */
export function startOfUtcDay(date: Date): Date {
  return new Date(
    Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()),
  );
}

/** Add whole days, staying at midnight UTC (input is normalized first). */
export function addDays(date: Date, days: number): Date {
  return new Date(startOfUtcDay(date).getTime() + days * DAY_MS);
}

/** Monday 00:00 UTC of the week containing `date`. */
export function weekStartOf(date: Date): Date {
  const day = startOfUtcDay(date);
  // getUTCDay(): 0 = Sunday .. 6 = Saturday; Monday-first offset.
  const offset = (day.getUTCDay() + 6) % 7;
  return addDays(day, -offset);
}

/** ISO-8601 week number (UTC), e.g. 2026-06-08 -> 24. */
export function isoWeekNumber(date: Date): number {
  const day = startOfUtcDay(date);
  // Thursday of the same ISO week determines the ISO year.
  const thursday = addDays(day, 3 - ((day.getUTCDay() + 6) % 7));
  const firstJan = new Date(Date.UTC(thursday.getUTCFullYear(), 0, 1));
  return Math.ceil(((thursday.getTime() - firstJan.getTime()) / DAY_MS + 1) / 7);
}

/**
 * Human label for the week, e.g. "Semana 24 · 08–14 jun 2026".
 * Cross-month weeks include both months: "Semana 27 · 29 jun–05 jul 2026".
 */
export function weekLabel(weekStart: Date): string {
  const start = weekStartOf(weekStart);
  const end = addDays(start, 6);
  const week = isoWeekNumber(start);
  const dd = (d: Date) => String(d.getUTCDate()).padStart(2, "0");
  const mon = (d: Date) => MONTH_SHORT[d.getUTCMonth()];

  const range =
    start.getUTCMonth() === end.getUTCMonth()
      ? `${dd(start)}–${dd(end)} ${mon(end)}`
      : `${dd(start)} ${mon(start)}–${dd(end)} ${mon(end)}`;

  return `Semana ${week} · ${range} ${end.getUTCFullYear()}`;
}

/** The 7 `WeekDay` cells (Mon→Sun) for the week starting at `weekStart`. */
export function buildWeekDays(weekStart: Date): WeekDay[] {
  const start = weekStartOf(weekStart);
  return WEEKDAY_LABELS.map((label, index) => ({
    label,
    date: toIsoDate(addDays(start, index)),
    weekend: index >= 5,
  }));
}

/**
 * Resolve the `?semana=` query param into a week start (Monday 00:00 UTC).
 * Invalid/absent values fall back to the week containing `today`; any valid
 * date snaps to its own Monday, so links may point at any day of the week.
 */
export function parseWeekParam(
  param: string | string[] | undefined,
  today: Date = new Date(),
): Date {
  const raw = Array.isArray(param) ? param[0] : param;
  const parsed = raw ? parseIsoDateUtc(raw) : null;
  return weekStartOf(parsed ?? today);
}
