import type { TimeEntryStatus } from "@/lib/timesheet/types";
import type { ExpenseStatus, ExpenseTotals } from "@/lib/expenses/types";
import type { ExpenseStage } from "@/lib/reports/schemas";

/**
 * Shared row/total shapes for the Relatorios module (docs section 5+7).
 * Used by the read layer, the screen and the CSV builders. Hour-monetary
 * fields (`billingRate`, `billedAmount`) are OPTIONAL: they are present only
 * when the reader holds FINANCIAL_ROLES — the server omits them otherwise.
 */

export interface HoursReportRow {
  id: string;
  /** ISO date yyyy-mm-dd. */
  date: string;
  /** Human label of the week, e.g. "Semana 24 · 08–14 jun 2026". */
  weekLabel: string;
  consultantName: string;
  clientName: string;
  projectName: string;
  /** Activity label (pt-BR) or the raw legacy value. */
  activity: string;
  hours: number;
  billable: boolean;
  status: TimeEntryStatus;
  /** ISO datetime when submitted, when applicable. */
  submittedAt?: string;
  /** ISO datetime of the latest Approval of this entry, when decided. */
  decidedAt?: string;
  /** FINANCIAL_ROLES only: project billing rate (BRL/hour). */
  billingRate?: number | null;
  /** FINANCIAL_ROLES only: hours × billingRate, or null when no rate. */
  billedAmount?: number | null;
}

export interface HoursReportTotals {
  /** Number of entries. */
  count: number;
  /** Total hours across all rows. */
  totalHours: number;
  /** Total hours per status. */
  hoursByStatus: Partial<Record<TimeEntryStatus, number>>;
  /** Total hours per "Cliente / Projeto" group, ordered. */
  hoursByProject: { clientName: string; projectName: string; hours: number }[];
  /** FINANCIAL_ROLES only: total billed of APPROVED hours with a rate. */
  totalBilled?: number;
}

export interface HoursReport {
  rows: HoursReportRow[];
  totals: HoursReportTotals;
  /** Whether monetary hour columns are present (FINANCIAL_ROLES). */
  includeFinancials: boolean;
}

export interface ExpensesReportRow {
  id: string;
  /** ISO date yyyy-mm-dd. */
  date: string;
  consultantName: string;
  clientName: string;
  projectName: string;
  description: string;
  invoiceNumber?: string;
  amount: number;
  status: ExpenseStatus;
  /** Pipeline stage label (Gestor/Financeiro/Pagamento/Finalizada/Reprovada). */
  stage: string;
  hasReceipt: boolean;
  /** Comment of the latest Approval, when present. */
  lastDecision?: string;
  /** ISO datetime when submitted, when applicable. */
  submittedAt?: string;
}

export interface ExpensesReport {
  rows: ExpensesReportRow[];
  totals: ExpenseTotals;
}

/** A project line inside a consolidated client group. */
export interface ConsolidatedProject {
  projectId: string;
  projectName: string;
  /** APPROVED hours that enter the closing. */
  approvedHours: number;
  /** Non-APPROVED hours (DRAFT+SUBMITTED+REJECTED) that do NOT enter. */
  pendingHours: number;
  /** FINANCIAL_ROLES only: billed amount of APPROVED hours with a rate. */
  billedAmount?: number | null;
  /** Expenses that enter the closing (FINANCE_APPROVED+SCHEDULED+PAID). */
  expenseApproved: number;
  expenseScheduled: number;
  expensePaid: number;
  /** Expenses entering = approved + scheduled + paid. */
  expenseEntering: number;
  /** Expenses not yet at finance / rejected — do NOT enter. */
  expensePending: number;
}

export interface ConsolidatedClient {
  clientName: string;
  projects: ConsolidatedProject[];
}

export interface ConsolidatedTotals {
  /** Total APPROVED hours entering the closing. */
  approvedHours: number;
  /** Total non-APPROVED hours (signaled, not entering). */
  pendingHours: number;
  /** FINANCIAL_ROLES only: total billed of entering hours. */
  totalBilled?: number;
  /** Total expenses entering (approved+scheduled+paid). */
  expenseEntering: number;
  /** Total expenses pending (not yet at finance / rejected). */
  expensePending: number;
}

export interface ConsolidatedReport {
  clients: ConsolidatedClient[];
  totals: ConsolidatedTotals;
  includeFinancials: boolean;
}

export type { ExpenseStage, ExpenseTotals };
