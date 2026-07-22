/**
 * Pure aggregation for the "horas realizadas por consultor" worksheet attached
 * to the client billing e-mail (P4). Kept I/O-free so it can be unit-tested
 * without a database or spreadsheet dependency: the server action loads the
 * APPROVED TimeEntry rows for the project/competence and hands them here; the
 * `.xlsx` serialization (lib/export/xlsx) is a separate concern.
 *
 * The caller is responsible for RBAC and for filtering to the right project,
 * competence and status — this module only groups and totals what it is handed.
 */

export interface ProjectHoursEntry {
  consultantId: string;
  consultantName: string;
  /** Realized hours for a single TimeEntry (already a number, not Decimal). */
  hours: number;
}

export interface ProjectHoursSheetRow {
  consultant: string;
  /** Sum of realized hours for the consultant across the competence. */
  totalHours: number;
  /** Number of TimeEntry rows that contributed to the total. */
  entries: number;
}

/**
 * Group realized hours by consultant and total them, one row per consultant.
 * Rows are sorted by consultant name (pt-BR, case-insensitive) for a stable,
 * human-friendly sheet. Negative/NaN hours are coerced to 0 so a corrupt row
 * never poisons a client-facing total.
 */
export function buildProjectHoursSheetRows(
  entries: ReadonlyArray<ProjectHoursEntry>,
): ProjectHoursSheetRow[] {
  const byConsultant = new Map<string, ProjectHoursSheetRow>();
  for (const entry of entries) {
    const hours =
      Number.isFinite(entry.hours) && entry.hours > 0 ? entry.hours : 0;
    const existing = byConsultant.get(entry.consultantId);
    if (existing) {
      existing.totalHours = round2(existing.totalHours + hours);
      existing.entries += 1;
    } else {
      byConsultant.set(entry.consultantId, {
        consultant: entry.consultantName,
        totalHours: round2(hours),
        entries: 1,
      });
    }
  }
  return [...byConsultant.values()].sort((a, b) =>
    a.consultant.localeCompare(b.consultant, "pt-BR", { sensitivity: "base" }),
  );
}

/** Total realized hours across all consultants (footer/summary line). */
export function sumProjectHours(
  rows: ReadonlyArray<ProjectHoursSheetRow>,
): number {
  return round2(rows.reduce((total, row) => total + row.totalHours, 0));
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}
