/**
 * Mocked monthly closing for the MVP "Financeiro" module.
 *
 * NOTE: not connected to the database yet. Shapes mirror `MonthlyClosing`
 * (docs/modelo-dados.md): only approved hours feed the closing; amount =
 * approved hours × sold hourly rate. Financial figures are role-protected —
 * the page guards access with `requireRole`.
 */

export type ClosingStatus = "OPEN" | "REVIEW" | "READY" | "CLOSED";

export const closingStatusLabels: Record<ClosingStatus, string> = {
  OPEN: "Aberto",
  REVIEW: "Em revisão",
  READY: "Pronto p/ fechar",
  CLOSED: "Fechado",
};

export interface ClosingRow {
  id: string;
  clientName: string;
  projectName: string;
  /** Approved hours that enter the closing. */
  approvedHours: number;
  /** Sold hourly rate (BRL). */
  billingHourlyRate: number;
  status: ClosingStatus;
}

export interface MonthlyClosing {
  month: number; // 1-based
  year: number;
  rows: ClosingRow[];
}

export const currentClosing: MonthlyClosing = {
  month: 5,
  year: 2026,
  rows: [
    {
      id: "cl-atlas",
      clientName: "Vix Energia",
      projectName: "Atlas",
      approvedHours: 320,
      billingHourlyRate: 320,
      status: "REVIEW",
    },
    {
      id: "cl-orion",
      clientName: "Banco Sul",
      projectName: "Órion",
      approvedHours: 208,
      billingHourlyRate: 290,
      status: "OPEN",
    },
    {
      id: "cl-vega",
      clientName: "Loja Norte",
      projectName: "Vega",
      approvedHours: 164,
      billingHourlyRate: 250,
      status: "READY",
    },
    {
      id: "cl-helios",
      clientName: "Vix Energia",
      projectName: "Helios",
      approvedHours: 96,
      billingHourlyRate: 300,
      status: "OPEN",
    },
    {
      id: "cl-lumen",
      clientName: "Banco Sul",
      projectName: "Lumen",
      approvedHours: 150,
      billingHourlyRate: 260,
      status: "CLOSED",
    },
  ],
};

/** Estimated revenue for a single closing row (hours × rate). */
export function rowAmount(row: ClosingRow): number {
  return row.approvedHours * row.billingHourlyRate;
}

export interface ClosingTotals {
  approvedHours: number;
  estimatedRevenue: number;
  readyToClose: number;
  closed: number;
}

/** Aggregate totals for the revenue summary cards. */
export function summarizeClosing(closing: MonthlyClosing): ClosingTotals {
  return closing.rows.reduce<ClosingTotals>(
    (acc, row) => {
      acc.approvedHours += row.approvedHours;
      acc.estimatedRevenue += rowAmount(row);
      if (row.status === "READY") acc.readyToClose += 1;
      if (row.status === "CLOSED") acc.closed += 1;
      return acc;
    },
    { approvedHours: 0, estimatedRevenue: 0, readyToClose: 0, closed: 0 },
  );
}
