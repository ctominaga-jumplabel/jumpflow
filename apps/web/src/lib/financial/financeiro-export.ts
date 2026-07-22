import type { XlsxColumn } from "@/lib/export/xlsx";
import {
  fiscalDocumentStatusLabels,
  revenueClosingStatusLabels,
  type RevenueClosingRow,
  type RevenueClosingStatus,
} from "@/lib/financial/types";
import { opportunityTypeLabel } from "@/lib/projects/labels";
import { expenseStatusLabels, type Expense } from "@/lib/expenses/types";

/**
 * Pure builders for the Financeiro `.xlsx` exports (Onda 6): "Contas a Receber"
 * (revenue closings) and "Contas a Pagar" (finance-approved expenses).
 *
 * Both tabs live under the role-protected /app/financeiro page
 * (requireRole(FINANCIAL_ROLES)) and the export routes re-check the SAME gate,
 * so every financial column is authorized for whoever can reach these files —
 * there is no per-column masking here (the whole surface is financial). RBAC and
 * filtering are the caller's job; these functions only shape authorized rows.
 */

const MONEY_FMT = "#,##0.00";

export interface RevenueExportFilter {
  clientName?: string;
  projectName?: string;
  status?: RevenueClosingStatus;
}

/**
 * Reapply the Contas a Receber screen filter (cliente/projeto/status). Mirrors
 * the in-page filter in `app/app/financeiro/page.tsx` exactly so the export can
 * never include more than the table shows. The period (month/year) is applied
 * upstream by `listRevenueClosings`.
 */
export function filterRevenueRows(
  rows: ReadonlyArray<RevenueClosingRow>,
  filter: RevenueExportFilter,
): RevenueClosingRow[] {
  return rows.filter(
    (row) =>
      (!filter.clientName || row.clientName === filter.clientName) &&
      (!filter.projectName || row.projectName === filter.projectName) &&
      (!filter.status || row.status === filter.status),
  );
}

/** Columns for the Contas a Receber export. Includes the CRM opportunity type. */
export function revenueXlsxColumns(): XlsxColumn<RevenueClosingRow>[] {
  return [
    { header: "Cliente", value: (r) => r.clientName, width: 24 },
    { header: "Projeto", value: (r) => r.projectName, width: 24 },
    {
      header: "Tipo",
      value: (r) => opportunityTypeLabel(r.opportunityType),
      width: 18,
    },
    {
      header: "Horas aprovadas",
      value: (r) => r.approvedHours,
      numFmt: MONEY_FMT,
      width: 16,
    },
    {
      header: "Valor hora",
      value: (r) => r.billingHourlyRate,
      numFmt: MONEY_FMT,
      width: 14,
    },
    { header: "Valor", value: (r) => r.amount, numFmt: MONEY_FMT, width: 16 },
    {
      header: "Status",
      value: (r) => revenueClosingStatusLabels[r.status],
      width: 18,
    },
    {
      header: "NF status",
      value: (r) =>
        r.fiscalDocument
          ? fiscalDocumentStatusLabels[r.fiscalDocument.status]
          : "",
      width: 14,
    },
    {
      header: "NF número",
      value: (r) => r.fiscalDocument?.invoiceNumber ?? "",
      width: 14,
    },
  ];
}

/** Columns for the Contas a Pagar export (finance-approved expenses). */
export function financeExpensesXlsxColumns(): XlsxColumn<Expense>[] {
  return [
    { header: "Data", value: (r) => r.date, width: 12 },
    { header: "Cliente", value: (r) => r.clientName, width: 24 },
    { header: "Projeto", value: (r) => r.projectName, width: 24 },
    { header: "Consultor", value: (r) => r.consultantName, width: 22 },
    { header: "Descrição", value: (r) => r.description, width: 30 },
    { header: "Nota fiscal", value: (r) => r.invoiceNumber ?? "", width: 16 },
    { header: "Valor", value: (r) => r.amount, numFmt: MONEY_FMT, width: 14 },
    {
      header: "Status",
      value: (r) => expenseStatusLabels[r.status],
      width: 24,
    },
  ];
}
