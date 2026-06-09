/**
 * Pure helpers for the weekly "absence of time entry per project" report.
 * No I/O — recipient parsing, per-project classification, CSV string building
 * and the idempotency reference key only.
 */

/** Basic email shape check — server-side validation, not RFC-perfect. */
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * Parse a comma-separated recipients string into a normalized, de-duplicated
 * list of valid emails. Trims, lowercases, drops blanks/invalids, preserves
 * first-seen order. Returns [] for null/empty/garbage input. Shared by the DB
 * config value and the AUTOMATION_REPORT_EMAIL env fallback.
 */
export function parseRecipients(raw: string | null | undefined): string[] {
  if (!raw) return [];
  const seen = new Set<string>();
  const out: string[] = [];
  for (const part of raw.split(",")) {
    const email = part.trim().toLowerCase();
    if (!email || !EMAIL_RE.test(email) || seen.has(email)) continue;
    seen.add(email);
    out.push(email);
  }
  return out;
}

/** Per-(consultant,project) absence classification. */
export type MissingTimesheetStatus =
  | "SEM_LANCAMENTO_NO_PROJETO"
  | "RASCUNHO_NAO_ENVIADO_NO_PROJETO";

/** Statuses that count as an effective (validly submitted) time entry. */
const EFFECTIVE_SUBMISSION = new Set(["SUBMITTED", "APPROVED", "CLOSED"]);

/** One allocation the consultant has in the reported period (already filtered
 *  by the caller to ACTIVE consultant, ACTIVE/PLANNED allocation intersecting
 *  the period, and ACTIVE/PAUSED project). */
export interface AllocationInput {
  consultantId: string;
  consultantName: string;
  consultantEmail: string;
  area: string | null;
  seniority: string;
  projectId: string;
  projectName: string;
}

/** One time entry of an involved consultant within the period. */
export interface TimeEntryInput {
  consultantId: string;
  projectId: string;
  status: string; // TimeEntryStatus
}

/** One output row: a consultant who is non-compliant for an allocated project. */
export interface MissingTimesheetRow {
  consultantId: string;
  consultantName: string;
  consultantEmail: string;
  area: string | null;
  seniority: string;
  projectId: string;
  projectName: string;
  status: MissingTimesheetStatus;
  /** Consultant has an effective submission in a DIFFERENT project this period. */
  loggedInOtherProject: boolean;
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
  "projectId",
  "projectName",
  "status",
  "loggedInOtherProject",
  "generatedAt",
] as const;

function isoDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

/** Quote a CSV field per RFC 4180 (always quoted for stability/safety). */
function csvField(value: string): string {
  return `"${value.replace(/"/g, '""')}"`;
}

/** Composite key for a (consultant, project) pair. */
function pairKey(consultantId: string, projectId: string): string {
  return `${consultantId}|${projectId}`;
}

/**
 * Pure classification of weekly absence per allocated project.
 *
 * For each distinct (consultant, allocated project) — multiple allocations to
 * the same project collapse into one row:
 *  - compliant (>=1 effective submission on that project) -> NOT reported;
 *  - has entries but none effective (drafts and/or rejected) ->
 *    RASCUNHO_NAO_ENVIADO_NO_PROJETO;
 *  - no entries at all -> SEM_LANCAMENTO_NO_PROJETO.
 * `loggedInOtherProject` is true when the consultant has an effective
 * submission on any other project in the same period.
 * Output sorted by consultantName, then projectName (stable report).
 */
export function buildMissingTimesheetRows(
  allocations: ReadonlyArray<AllocationInput>,
  entries: ReadonlyArray<TimeEntryInput>,
): MissingTimesheetRow[] {
  // Index entries by consultant/project.
  const effectiveByConsultantProject = new Set<string>();
  const anyByConsultantProject = new Set<string>();
  const effectiveProjectsByConsultant = new Map<string, Set<string>>();

  for (const entry of entries) {
    const key = pairKey(entry.consultantId, entry.projectId);
    anyByConsultantProject.add(key);
    if (EFFECTIVE_SUBMISSION.has(entry.status)) {
      effectiveByConsultantProject.add(key);
      let projects = effectiveProjectsByConsultant.get(entry.consultantId);
      if (!projects) {
        projects = new Set<string>();
        effectiveProjectsByConsultant.set(entry.consultantId, projects);
      }
      projects.add(entry.projectId);
    }
  }

  // Dedupe allocations by (consultant, project); first occurrence wins.
  const uniqueAllocations = new Map<string, AllocationInput>();
  for (const allocation of allocations) {
    const key = pairKey(allocation.consultantId, allocation.projectId);
    if (!uniqueAllocations.has(key)) {
      uniqueAllocations.set(key, allocation);
    }
  }

  const rows: MissingTimesheetRow[] = [];
  for (const allocation of uniqueAllocations.values()) {
    const key = pairKey(allocation.consultantId, allocation.projectId);
    // Compliant on this project — not reported.
    if (effectiveByConsultantProject.has(key)) continue;

    const status: MissingTimesheetStatus = anyByConsultantProject.has(key)
      ? "RASCUNHO_NAO_ENVIADO_NO_PROJETO"
      : "SEM_LANCAMENTO_NO_PROJETO";

    const effectiveProjects =
      effectiveProjectsByConsultant.get(allocation.consultantId) ??
      new Set<string>();
    let loggedInOtherProject = false;
    for (const projectId of effectiveProjects) {
      if (projectId !== allocation.projectId) {
        loggedInOtherProject = true;
        break;
      }
    }

    rows.push({
      consultantId: allocation.consultantId,
      consultantName: allocation.consultantName,
      consultantEmail: allocation.consultantEmail,
      area: allocation.area,
      seniority: allocation.seniority,
      projectId: allocation.projectId,
      projectName: allocation.projectName,
      status,
      loggedInOtherProject,
    });
  }

  rows.sort(
    (a, b) =>
      a.consultantName.localeCompare(b.consultantName) ||
      a.projectName.localeCompare(b.projectName),
  );
  return rows;
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
        csvField(row.projectId),
        csvField(row.projectName),
        csvField(row.status),
        csvField(row.loggedInOtherProject ? "true" : "false"),
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
