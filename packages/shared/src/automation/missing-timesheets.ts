/**
 * Pure helpers for the "consultants without time entries" report.
 * No I/O — CSV string building and the idempotency reference key only.
 */

/** One row of the missing-timesheet report. */
export interface MissingTimesheetRow {
  consultantId: string;
  consultantName: string;
  consultantEmail: string;
  area: string | null;
  seniority: string;
}

/** Stable CSV column order. Keep in sync with {@link MISSING_TIMESHEET_HEADERS}. */
export const MISSING_TIMESHEET_HEADERS = [
  "periodStart",
  "periodEnd",
  "consultantId",
  "consultantName",
  "consultantEmail",
  "area",
  "seniority",
  "generatedAt",
] as const;

function isoDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

/** Quote a CSV field per RFC 4180 (always quoted for stability/safety). */
function csvField(value: string): string {
  return `"${value.replace(/"/g, '""')}"`;
}

/**
 * Build the report CSV. The header row is always present (even with zero rows)
 * so downstream tooling has a stable shape. A UTF-8 BOM is prepended so Excel
 * (pt-BR) opens accents correctly.
 */
export function buildMissingTimesheetCsv(
  rows: ReadonlyArray<MissingTimesheetRow>,
  period: { start: Date; end: Date; generatedAt: Date },
): string {
  const start = isoDate(period.start);
  const end = isoDate(period.end);
  const generatedAt = period.generatedAt.toISOString();

  const lines: string[] = [MISSING_TIMESHEET_HEADERS.join(",")];
  for (const row of rows) {
    lines.push(
      [
        csvField(start),
        csvField(end),
        csvField(row.consultantId),
        csvField(row.consultantName),
        csvField(row.consultantEmail),
        csvField(row.area ?? ""),
        csvField(row.seniority),
        csvField(generatedAt),
      ].join(","),
    );
  }
  // \r\n line endings for maximum spreadsheet compatibility.
  return "﻿" + lines.join("\r\n") + "\r\n";
}

/**
 * Idempotency key for a report period. Two runs for the same window produce the
 * same key, so {@link AutomationEmailLog} dedupes the send.
 */
export function missingTimesheetReferenceKey(start: Date, end: Date): string {
  return `${isoDate(start)}_${isoDate(end)}`;
}
