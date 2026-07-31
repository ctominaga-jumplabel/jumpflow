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

/** ISO `yyyy-mm-dd` → `dd/mm/yyyy` (data-only, sem fuso). "" quando inválido. */
function formatDateBr(iso: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  if (!m) return iso ?? "";
  return `${m[3]}/${m[2]}/${m[1]}`;
}

const WEEKDAYS_PT = [
  "Domingo",
  "Segunda",
  "Terça",
  "Quarta",
  "Quinta",
  "Sexta",
  "Sábado",
];

/** ISO `yyyy-mm-dd` → dia da semana pt-BR (ex.: "Sábado"). "" quando inválido. */
function weekdayPtBr(iso: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  if (!m) return "";
  // UTC para casar com a semântica date-only (evita virar o dia por fuso).
  const day = new Date(
    Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])),
  ).getUTCDay();
  return WEEKDAYS_PT[day] ?? "";
}

export interface ClientHoursXlsxOptions {
  /** Resolve a status label (pt-BR). */
  statusLabel: (status: string) => string;
}

/**
 * Colunas do Excel de horas faturáveis ENVIADO AO CLIENTE (anexo do e-mail de
 * pré-fatura). Layout do print aprovado pelo cliente: Cliente, Projeto,
 * Faturável, Status, Atividade, Consultor, Data, Data (dia da semana), Horas,
 * Valor hora, Valor faturado. Difere do export interno de Relatórios
 * (`hoursXlsxColumns`), que carrega campos operacionais (Semana/Enviado em/
 * Decidido em) e mascara os monetários por papel. Aqui o contexto já é
 * financeiro (montado no envio da pré-fatura), então os valores sempre entram.
 */
export function clientHoursXlsxColumns(
  opts: ClientHoursXlsxOptions,
): XlsxColumn<HoursReportRow>[] {
  return [
    { header: "Cliente", value: (r) => r.clientName, width: 22 },
    { header: "Projeto", value: (r) => r.projectName, width: 24 },
    {
      header: "Faturável",
      value: (r) => (r.billable ? "Sim" : "Não"),
      width: 10,
    },
    { header: "Status", value: (r) => opts.statusLabel(r.status), width: 14 },
    { header: "Atividade", value: (r) => r.activity, width: 18 },
    { header: "Consultor", value: (r) => r.consultantName, width: 22 },
    { header: "Data", value: (r) => formatDateBr(r.date), width: 12 },
    { header: "Data", value: (r) => weekdayPtBr(r.date), width: 12 },
    { header: "Horas", value: (r) => r.hours, numFmt: MONEY_FMT, width: 10 },
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
