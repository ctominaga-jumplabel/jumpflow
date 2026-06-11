import type {
  ConsolidatedClient,
  ExpensesReportRow,
  HoursReportRow,
} from "@/lib/reports/types";

/**
 * Pure CSV builders for the Relatorios module (docs section 6). No I/O — safe
 * to unit test. Same contract as `buildMissingTimesheetCsv`: UTF-8 BOM, a
 * stable header always present (even with zero rows), `\r\n` line endings and
 * a trailing newline so spreadsheet tools see a consistent shape.
 */

const BOM = "﻿";
const EOL = "\r\n";

/**
 * Quote a CSV field per RFC 4180: always wrapped in double quotes, inner `"`
 * doubled. Covers commas, quotes and embedded newlines.
 */
export function csvField(value: string): string {
  return `"${value.replace(/"/g, '""')}"`;
}

/**
 * Anti CSV-injection guard for FREE TEXT cells (descriptions, comments, names).
 * A leading `=`, `+`, `-`, `@`, TAB or CR makes a spreadsheet treat the cell as
 * a formula; prefix an apostrophe so it stays inert. Applied BEFORE `csvField`.
 * Numbers/dates formatted by the builder never pass through here.
 */
export function sanitizeText(value: string): string {
  if (value.length === 0) return value;
  const first = value[0];
  if (
    first === "=" ||
    first === "+" ||
    first === "-" ||
    first === "@" ||
    first === "\t" ||
    first === "\r"
  ) {
    return `'${value}`;
  }
  return value;
}

/** Free-text cell: sanitize then quote. */
function text(value: string | undefined | null): string {
  return csvField(sanitizeText(value ?? ""));
}

/** Numeric cell with a dot decimal separator and fixed places. */
function num(value: number, places: number): string {
  return csvField(value.toFixed(places));
}

/** Money cell (2 places) or empty when null/undefined. */
function money(value: number | null | undefined): string {
  if (value === null || value === undefined) return csvField("");
  return num(value, 2);
}

/** Hours cell with up to 2 decimals (e.g. "12.5"). */
function hours(value: number): string {
  // toFixed(2) then strip trailing zeros to honor "ate 2 casas".
  const fixed = value.toFixed(2);
  const trimmed = fixed.replace(/\.?0+$/, "");
  return csvField(trimmed.length === 0 ? "0" : trimmed);
}

/** Boolean as pt-BR Sim/Nao (coherent with the screen). */
function bool(value: boolean): string {
  return csvField(value ? "Sim" : "Não");
}

/** ISO date-only / datetime cell (already a safe machine string). */
function iso(value: string | undefined | null): string {
  return csvField(value ?? "");
}

function joinLines(lines: string[]): string {
  return BOM + lines.join(EOL) + EOL;
}

export interface HoursCsvOptions {
  /** When false, monetary hour columns are omitted entirely. */
  includeFinancials: boolean;
  /** Resolve a status label (pt-BR). */
  statusLabel: (status: string) => string;
}

const HOURS_HEADERS_BASE = [
  "date",
  "weekLabel",
  "consultantName",
  "clientName",
  "projectName",
  "activity",
  "hours",
  "billable",
  "status",
  "submittedAt",
  "decidedAt",
] as const;

const HOURS_HEADERS_FINANCIAL = ["billingRate", "billedAmount"] as const;

/** Build the Hours report CSV. Monetary columns appear only when allowed. */
export function buildHoursCsv(
  rows: ReadonlyArray<HoursReportRow>,
  opts: HoursCsvOptions,
): string {
  const headers = opts.includeFinancials
    ? [...HOURS_HEADERS_BASE, ...HOURS_HEADERS_FINANCIAL]
    : [...HOURS_HEADERS_BASE];
  const lines: string[] = [headers.map((h) => csvField(h)).join(",")];

  for (const row of rows) {
    const cells = [
      iso(row.date),
      text(row.weekLabel),
      text(row.consultantName),
      text(row.clientName),
      text(row.projectName),
      text(row.activity),
      hours(row.hours),
      bool(row.billable),
      text(opts.statusLabel(row.status)),
      iso(row.submittedAt),
      iso(row.decidedAt),
    ];
    if (opts.includeFinancials) {
      cells.push(money(row.billingRate), money(row.billedAmount));
    }
    lines.push(cells.join(","));
  }
  return joinLines(lines);
}

export interface ExpensesCsvOptions {
  statusLabel: (status: string) => string;
}

const EXPENSES_HEADERS = [
  "date",
  "consultantName",
  "clientName",
  "projectName",
  "description",
  "invoiceNumber",
  "amount",
  "status",
  "stage",
  "hasReceipt",
  "lastDecision",
  "submittedAt",
] as const;

/** Build the Expenses report CSV. Never includes receipt storage fields. */
export function buildExpensesCsv(
  rows: ReadonlyArray<ExpensesReportRow>,
  opts: ExpensesCsvOptions,
): string {
  const lines: string[] = [
    EXPENSES_HEADERS.map((h) => csvField(h)).join(","),
  ];
  for (const row of rows) {
    lines.push(
      [
        iso(row.date),
        text(row.consultantName),
        text(row.clientName),
        text(row.projectName),
        text(row.description),
        text(row.invoiceNumber),
        money(row.amount),
        text(opts.statusLabel(row.status)),
        text(row.stage),
        bool(row.hasReceipt),
        text(row.lastDecision),
        iso(row.submittedAt),
      ].join(","),
    );
  }
  return joinLines(lines);
}

export interface ConsolidatedCsvOptions {
  includeFinancials: boolean;
}

const CONSOLIDATED_HEADERS_BASE = [
  "clientName",
  "projectName",
  "approvedHours",
  "pendingHours",
  "expenseApproved",
  "expenseScheduled",
  "expensePaid",
  "expenseEntering",
  "expensePending",
] as const;

/**
 * Build the Consolidated CSV: one row per (client, project), with the entering
 * vs pending split kept explicit. `billedAmount` appears only when allowed and
 * is inserted right after `pendingHours`.
 */
export function buildConsolidatedCsv(
  groups: ReadonlyArray<ConsolidatedClient>,
  opts: ConsolidatedCsvOptions,
): string {
  const headers: string[] = opts.includeFinancials
    ? [
        "clientName",
        "projectName",
        "approvedHours",
        "pendingHours",
        "billedAmount",
        "expenseApproved",
        "expenseScheduled",
        "expensePaid",
        "expenseEntering",
        "expensePending",
      ]
    : [...CONSOLIDATED_HEADERS_BASE];
  const lines: string[] = [headers.map((h) => csvField(h)).join(",")];

  for (const client of groups) {
    for (const project of client.projects) {
      const cells = [
        text(client.clientName),
        text(project.projectName),
        hours(project.approvedHours),
        hours(project.pendingHours),
      ];
      if (opts.includeFinancials) {
        cells.push(money(project.billedAmount));
      }
      cells.push(
        money(project.expenseApproved),
        money(project.expenseScheduled),
        money(project.expensePaid),
        money(project.expenseEntering),
        money(project.expensePending),
      );
      lines.push(cells.join(","));
    }
  }
  return joinLines(lines);
}
