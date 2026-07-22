import type { XlsxColumn } from "@/lib/export/xlsx";
import type { HoursReportRow, ExpensesReportRow } from "@/lib/reports/types";

/**
 * Column definitions for the Relatorios `.xlsx` exports (Onda 6). Mirror the
 * pure CSV builders in `lib/reports/csv.ts` so both formats stay in sync:
 *
 * - RBAC and scope are the CALLER's job — these helpers only shape rows the
 *   read layer already authorized (`getHoursReport`/`getExpensesReport`).
 * - Financial masking is honored the SAME way as the CSV path: the monetary
 *   hour columns ("Valor hora", "Valor faturado") are appended ONLY when
 *   `includeFinancials` is true (FINANCIAL_ROLES). A non-financial caller gets a
 *   sheet without those columns at all — the value is never even computed.
 * - Money cells use the `#,##0.00` number format; dates stay ISO strings.
 */

export interface HoursXlsxOptions {
  /** When false, monetary hour columns are omitted entirely (mask). */
  includeFinancials: boolean;
  /** Resolve a status label (pt-BR). */
  statusLabel: (status: string) => string;
}

const MONEY_FMT = "#,##0.00";

/** Columns for the Hours report. Monetary columns appear only when allowed. */
export function hoursXlsxColumns(
  opts: HoursXlsxOptions,
): XlsxColumn<HoursReportRow>[] {
  const base: XlsxColumn<HoursReportRow>[] = [
    { header: "Data", value: (r) => r.date, width: 12 },
    { header: "Semana", value: (r) => r.weekLabel, width: 26 },
    { header: "Consultor", value: (r) => r.consultantName, width: 22 },
    { header: "Cliente", value: (r) => r.clientName, width: 22 },
    { header: "Projeto", value: (r) => r.projectName, width: 24 },
    { header: "Atividade", value: (r) => r.activity, width: 20 },
    { header: "Horas", value: (r) => r.hours, numFmt: MONEY_FMT, width: 10 },
    {
      header: "Faturável",
      value: (r) => (r.billable ? "Sim" : "Não"),
      width: 10,
    },
    { header: "Status", value: (r) => opts.statusLabel(r.status), width: 16 },
    { header: "Enviado em", value: (r) => r.submittedAt ?? "", width: 22 },
    { header: "Decidido em", value: (r) => r.decidedAt ?? "", width: 22 },
  ];
  if (!opts.includeFinancials) return base;
  return [
    ...base,
    {
      header: "Valor hora",
      value: (r) => r.billingRate ?? null,
      numFmt: MONEY_FMT,
      width: 14,
    },
    {
      header: "Valor faturado",
      value: (r) => r.billedAmount ?? null,
      numFmt: MONEY_FMT,
      width: 16,
    },
  ];
}

export interface ExpensesXlsxOptions {
  /** Resolve a status label (pt-BR). */
  statusLabel: (status: string) => string;
}

/** Columns for the Expenses report. Never includes receipt storage fields. */
export function expensesXlsxColumns(
  opts: ExpensesXlsxOptions,
): XlsxColumn<ExpensesReportRow>[] {
  return [
    { header: "Data", value: (r) => r.date, width: 12 },
    { header: "Consultor", value: (r) => r.consultantName, width: 22 },
    { header: "Cliente", value: (r) => r.clientName, width: 22 },
    { header: "Projeto", value: (r) => r.projectName, width: 24 },
    { header: "Descrição", value: (r) => r.description, width: 30 },
    { header: "Nota fiscal", value: (r) => r.invoiceNumber ?? "", width: 16 },
    { header: "Valor", value: (r) => r.amount, numFmt: MONEY_FMT, width: 14 },
    { header: "Status", value: (r) => opts.statusLabel(r.status), width: 24 },
    { header: "Etapa", value: (r) => r.stage, width: 14 },
    {
      header: "Comprovante",
      value: (r) => (r.hasReceipt ? "Sim" : "Não"),
      width: 12,
    },
    { header: "Última decisão", value: (r) => r.lastDecision ?? "", width: 30 },
    { header: "Enviado em", value: (r) => r.submittedAt ?? "", width: 22 },
  ];
}
