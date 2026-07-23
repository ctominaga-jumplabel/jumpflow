import type { XlsxColumn } from "@/lib/export/xlsx";
import {
  activityLabelOf,
  timeEntryStatusLabels,
  type TimeEntryStatus,
} from "@/lib/timesheet/types";
import type { OperationDetailRow } from "@/lib/operations/closing";

/**
 * Pure builder for the "Detalhamento por consultor" `.xlsx` export of the
 * Fechamento Operacional. One row per time entry of the month, mirroring the
 * on-screen columns (Data, Consultor, Cliente/Projeto, Atividade, Horas,
 * Faturável, Status, Decidido em). No financial fields (operational hours only),
 * so no masking — RBAC is the route's job (OPERACAO_FECHAMENTO view).
 */

export interface OperationDetailExportRow {
  /** ISO date (yyyy-mm-dd) of the launch. */
  date: string;
  consultantName: string;
  /** "Cliente / Projeto" merged into one column for the sheet. */
  clientProject: string;
  activity: string;
  hours: number;
  /** "Sim" | "Não". */
  billable: string;
  status: string;
  /** ISO datetime of the latest decision, or "". */
  decidedAt: string;
}

function statusLabel(status: string): string {
  return timeEntryStatusLabels[status as TimeEntryStatus] ?? status;
}

export function buildOperationDetailExportRows(
  rows: readonly OperationDetailRow[],
): OperationDetailExportRow[] {
  return rows.map((r) => ({
    date: r.date,
    consultantName: r.consultantName,
    clientProject: `${r.clientName} / ${r.projectName}`,
    activity: activityLabelOf(r.activityType),
    hours: r.hours,
    billable: r.billable ? "Sim" : "Não",
    status: statusLabel(r.status),
    decidedAt: r.decidedAt ?? "",
  }));
}

const HOURS_FMT = "#,##0.00";

export function operationDetailXlsxColumns(): XlsxColumn<OperationDetailExportRow>[] {
  return [
    { header: "Data", value: (r) => r.date, width: 12 },
    { header: "Consultor", value: (r) => r.consultantName, width: 24 },
    { header: "Cliente / Projeto", value: (r) => r.clientProject, width: 32 },
    { header: "Atividade", value: (r) => r.activity, width: 18 },
    { header: "Horas", value: (r) => r.hours, numFmt: HOURS_FMT, width: 10 },
    { header: "Faturável", value: (r) => r.billable, width: 12 },
    { header: "Status", value: (r) => r.status, width: 16 },
    { header: "Decidido em", value: (r) => r.decidedAt, width: 22 },
  ];
}
