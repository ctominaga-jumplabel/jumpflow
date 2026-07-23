/**
 * Pure logic for the Operational Closing (Fechamento Operacional para o DP).
 *
 * No server-only imports (no Prisma), so this is safe on the edge and trivially
 * unit-testable. The DB reads/aggregation live in `lib/db/operation-closing.ts`;
 * the server actions in `app/app/operacao/fechamento/actions.ts`.
 *
 * The operational closing is a SEPARATE axis from the financial RevenueClosing:
 * it signals to the Departamento Pessoal (DP) that every allocated consultant
 * has logged AND had their month's hours APPROVED, so payroll/payment can start.
 * Decision (idealization): closing is BLOCKED until everyone is APPROVED; any
 * consultant still pending raises an alert and keeps the project unclosable.
 */

/** Operational status of a project's month. Only two states; reopening → OPEN. */
export type OperationClosingStatus = "OPEN" | "CLOSED";

/**
 * Readiness of a single allocated consultant for the month. Mirrors the
 * timesheet `derivePeriodStatus` priority but framed for the DP closing.
 */
export type ConsultantReadinessState =
  | "APPROVED" // todas as horas aprovadas (ou ja fechadas) — pronto
  | "PENDING_REVIEW" // ha horas enviadas aguardando aprovacao
  | "DRAFT" // ha horas em rascunho / ainda nao enviadas
  | "REJECTED" // ha horas rejeitadas que precisam de correcao
  | "NO_ENTRIES"; // alocado no mes, mas sem nenhuma hora lancada

export const consultantReadinessLabels: Record<
  ConsultantReadinessState,
  string
> = {
  APPROVED: "Aprovado",
  PENDING_REVIEW: "Aguardando aprovação",
  DRAFT: "Em rascunho",
  REJECTED: "Rejeitado",
  NO_ENTRIES: "Sem lançamento",
};

/** Only APPROVED is "done"; every other state blocks the closing. */
export function isReadyState(state: ConsultantReadinessState): boolean {
  return state === "APPROVED";
}

/**
 * Classify one consultant's month from the statuses of their time entries in
 * the project. Pure (no I/O). Priority matches the timesheet period derivation:
 * REJECTED > DRAFT/empty > SUBMITTED > APPROVED, so a single pending entry keeps
 * the consultant out of the "ready" set.
 */
export function classifyConsultantReadiness(
  entryStatuses: readonly string[],
): ConsultantReadinessState {
  if (entryStatuses.length === 0) return "NO_ENTRIES";
  if (entryStatuses.includes("REJECTED")) return "REJECTED";
  if (entryStatuses.includes("DRAFT")) return "DRAFT";
  if (entryStatuses.includes("SUBMITTED")) return "PENDING_REVIEW";
  // Only APPROVED (and/or already CLOSED) entries remain.
  return "APPROVED";
}

export interface ConsultantReadiness {
  consultantId: string;
  consultantName: string;
  state: ConsultantReadinessState;
  /** Hours logged in the month (any status), for visibility in the UI/email. */
  hours: number;
}

export interface OperationReadiness {
  consultants: ConsultantReadiness[];
  totalConsultants: number;
  readyConsultants: number;
  pendingConsultants: number;
  /** Sum of hours across all consultants (any status). */
  totalHours: number;
  /** True only when there is a team AND every consultant is APPROVED. */
  canClose: boolean;
  /** Count of consultants per blocking state (excludes APPROVED), for alerts. */
  pendingByState: Partial<Record<ConsultantReadinessState, number>>;
}

const round2 = (n: number): number => Math.round(n * 100) / 100;

/**
 * Aggregate per-consultant readiness into the project's operational readiness.
 * `canClose` requires at least one consultant and all of them APPROVED.
 */
export function summarizeReadiness(
  consultants: readonly ConsultantReadiness[],
): OperationReadiness {
  const sorted = [...consultants].sort((a, b) =>
    a.consultantName.localeCompare(b.consultantName, "pt-BR"),
  );
  let ready = 0;
  let totalHours = 0;
  const pendingByState: Partial<Record<ConsultantReadinessState, number>> = {};
  for (const c of sorted) {
    totalHours += c.hours;
    if (isReadyState(c.state)) {
      ready += 1;
    } else {
      pendingByState[c.state] = (pendingByState[c.state] ?? 0) + 1;
    }
  }
  const total = sorted.length;
  const pending = total - ready;
  return {
    consultants: sorted,
    totalConsultants: total,
    readyConsultants: ready,
    pendingConsultants: pending,
    totalHours: round2(totalHours),
    canClose: total > 0 && pending === 0,
    pendingByState,
  };
}

/**
 * Human-readable alert summarizing why a project cannot be closed yet, e.g.
 * "2 aguardando aprovação · 1 em rascunho". Empty string when ready.
 */
export function pendingAlert(readiness: OperationReadiness): string {
  if (readiness.totalConsultants === 0) return "Sem equipe alocada no mês";
  if (readiness.canClose) return "";
  const order: ConsultantReadinessState[] = [
    "PENDING_REVIEW",
    "DRAFT",
    "REJECTED",
    "NO_ENTRIES",
  ];
  return order
    .filter((state) => (readiness.pendingByState[state] ?? 0) > 0)
    .map(
      (state) =>
        `${readiness.pendingByState[state]} ${consultantReadinessLabels[
          state
        ].toLowerCase()}`,
    )
    .join(" · ");
}

// ---------------------------------------------------------------------------
// DTOs shared between the DB read layer and the client table.
// ---------------------------------------------------------------------------

export interface OperationClosingRow {
  projectId: string;
  projectName: string;
  clientName: string;
  /** Closing record id, when one already exists for the month. */
  closingId: string | null;
  status: OperationClosingStatus;
  closedAt: string | null;
  closedByName: string | null;
  notifiedAt: string | null;
  readiness: OperationReadiness;
  /**
   * How many of the project's month launches are exceptions — anything that is
   * NOT a plain "Dia Útil" OR carries an attachment (see {@link isExceptionEntry}).
   * Drives the "Exceções" column + drill-down into the apuração detail.
   */
  exceptionCount: number;
}

/**
 * Shared rule for what counts as a launch "exception": anything that is NOT a
 * plain workday (`activityType !== "WORKDAY"`) OR any entry that carries an
 * attachment (justificativa/comprovante). Pure, so it is used both by the DB
 * read layer and by unit tests. Mirrors `isRevenueExceptionEntry` on the
 * revenue side (Contas a Receber) — keep both in sync if the rule changes.
 */
export function isExceptionEntry(input: {
  activityType: string;
  hasAttachment: boolean;
}): boolean {
  return input.activityType !== "WORKDAY" || input.hasAttachment;
}

/** One time entry of a consultant's month, for the apuração (day-by-day) modal. */
export interface OperationEntryDetail {
  id: string;
  /** ISO date (yyyy-mm-dd) of the launch. */
  date: string;
  /** Raw activityType code; the label is resolved in the UI (`activityLabelOf`). */
  activityType: string;
  hours: number;
  status: string;
  /** Whether the day is marked billable (visibility for the DP/apuração). */
  billable: boolean;
  hasAttachment: boolean;
  /** True when this entry falls under {@link isExceptionEntry}. */
  isException: boolean;
}

/** A consultant's launches for the project's month, grouped for the apuração. */
export interface OperationConsultantDetail {
  consultantId: string;
  consultantName: string;
  totalHours: number;
  exceptionCount: number;
  entries: OperationEntryDetail[];
}

/**
 * Full day-by-day apuração of a project's month: every allocated/logging
 * consultant with their launches (activity type, hours, status, attachment) so
 * the DP can inspect the detail behind the aggregate before closing. Loaded
 * on-demand (not part of the overview) by the "Apurar" action.
 */
export interface OperationClosingDetail {
  projectId: string;
  projectName: string;
  clientName: string;
  month: number;
  year: number;
  consultants: OperationConsultantDetail[];
  totalExceptions: number;
}

/**
 * One flat row of the "Detalhamento por consultor" tab: a single time entry of
 * the month across ALL projects, framed from the consultant's angle. Mirrors the
 * columns the DP asked for (Data, Consultor, Cliente/Projeto, Atividade, Horas,
 * Faturável, Status, Decidido em). `decidedAt` is the latest Approval of the
 * entry (null while still DRAFT/SUBMITTED). `isException` reuses
 * {@link isExceptionEntry} so the tab can highlight the same launches as the
 * apuração.
 */
export interface OperationDetailRow {
  id: string;
  /** ISO date (yyyy-mm-dd) of the launch. */
  date: string;
  consultantId: string;
  consultantName: string;
  clientName: string;
  projectName: string;
  /** Raw activityType code; label resolved in the UI (`activityLabelOf`). */
  activityType: string;
  hours: number;
  billable: boolean;
  status: string;
  hasAttachment: boolean;
  /** ISO datetime of the latest decision (approval/rejection), or null. */
  decidedAt: string | null;
  /** True when this entry falls under {@link isExceptionEntry}. */
  isException: boolean;
}

/** A consultant option for the detail tab filter. */
export interface OperationDetailConsultantOption {
  id: string;
  name: string;
}

/**
 * The full "Detalhamento por consultor" view: the flat launch rows for the month
 * (optionally narrowed to one consultant) plus the unfiltered consultant option
 * list that feeds the filter dropdown.
 */
export interface OperationClosingDetailView {
  month: number;
  year: number;
  rows: OperationDetailRow[];
  consultantOptions: OperationDetailConsultantOption[];
  /** Total launches across the (filtered) rows and their exception count. */
  totalHours: number;
  totalExceptions: number;
}

export interface OperationClosingOverview {
  month: number;
  year: number;
  rows: OperationClosingRow[];
  /** Projects not yet closed for the month (the "pendentes de fechamento"). */
  pendingCount: number;
  /** Of the pending ones, how many are already ready to close. */
  readyToCloseCount: number;
  closedCount: number;
}

/** Roll up the per-project rows into the overview counters. */
export function summarizeOverview(
  month: number,
  year: number,
  rows: OperationClosingRow[],
): OperationClosingOverview {
  let pending = 0;
  let readyToClose = 0;
  let closed = 0;
  for (const row of rows) {
    if (row.status === "CLOSED") {
      closed += 1;
    } else {
      pending += 1;
      if (row.readiness.canClose) readyToClose += 1;
    }
  }
  return {
    month,
    year,
    rows,
    pendingCount: pending,
    readyToCloseCount: readyToClose,
    closedCount: closed,
  };
}
