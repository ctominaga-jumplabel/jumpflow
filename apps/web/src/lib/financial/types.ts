export type RevenueClosingStatus =
  | "OPEN"
  | "IN_REVIEW"
  | "READY_TO_CLOSE"
  | "CLOSED"
  | "INVOICED"
  | "CANCELLED";

export type FiscalDocumentStatus =
  | "DRAFT"
  | "REQUESTED"
  | "ISSUED"
  | "FAILED"
  | "CANCELLED";

export interface RevenueClosingFiscalDocument {
  id: string;
  status: FiscalDocumentStatus;
  invoiceNumber: string | null;
  protocol: string | null;
  issuedAt: string | null;
}

export interface RevenueClosingRow {
  id: string;
  clientName: string;
  projectName: string;
  approvedHours: number;
  billingHourlyRate: number;
  amount: number;
  status: RevenueClosingStatus;
  fiscalDocument: RevenueClosingFiscalDocument | null;
}

export interface RevenueClosingOverview {
  month: number;
  year: number;
  rows: RevenueClosingRow[];
}

export interface RevenueClosingTotals {
  approvedHours: number;
  estimatedRevenue: number;
  readyToClose: number;
  closed: number;
}

export const revenueClosingStatusLabels: Record<RevenueClosingStatus, string> = {
  OPEN: "Aberto",
  IN_REVIEW: "Em revisao",
  READY_TO_CLOSE: "Pronto p/ fechar",
  CLOSED: "Fechado",
  INVOICED: "Faturado",
  CANCELLED: "Cancelado",
};

export const fiscalDocumentStatusLabels: Record<FiscalDocumentStatus, string> = {
  DRAFT: "Rascunho",
  REQUESTED: "Solicitada",
  ISSUED: "Emitida",
  FAILED: "Falhou",
  CANCELLED: "Cancelada",
};

export function summarizeRevenueClosing(
  closing: RevenueClosingOverview,
): RevenueClosingTotals {
  return closing.rows.reduce<RevenueClosingTotals>(
    (acc, row) => {
      acc.approvedHours += row.approvedHours;
      acc.estimatedRevenue += row.amount;
      if (row.status === "READY_TO_CLOSE") acc.readyToClose += 1;
      if (row.status === "CLOSED" || row.status === "INVOICED") acc.closed += 1;
      return acc;
    },
    { approvedHours: 0, estimatedRevenue: 0, readyToClose: 0, closed: 0 },
  );
}
