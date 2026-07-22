import type { XlsxColumn } from "@/lib/export/xlsx";
import {
  consultantReadinessLabels,
  type OperationClosingOverview,
  type OperationClosingStatus,
} from "@/lib/operations/closing";

/**
 * Pure builder for the Fechamento Operacional `.xlsx` export (Onda 6). Flattens
 * the per-project overview into ONE ROW PER ALLOCATED CONSULTANT, which is what
 * the screen surfaces (the DP follow-up is "who is still pending"). A project
 * with no allocated consultants keeps a single placeholder row so it is not
 * silently dropped from the file.
 *
 * No financial fields here (operational readiness only), so no masking. RBAC is
 * the route's job (requirePermission("OPERACAO_FECHAMENTO", "view")).
 */

const closingStatusLabels: Record<OperationClosingStatus, string> = {
  OPEN: "Aberto",
  CLOSED: "Fechado",
};

export interface OperationClosingExportRow {
  projectName: string;
  clientName: string;
  /** "Aberto" | "Fechado" (project's operational status for the month). */
  closingStatus: string;
  consultantName: string;
  /** Readiness label (Aprovado / Aguardando aprovação / ...). */
  readiness: string;
  hours: number;
  /** ISO datetime the project was closed, or "". */
  closedAt: string;
  closedByName: string;
}

export function buildOperationClosingExportRows(
  overview: OperationClosingOverview,
): OperationClosingExportRow[] {
  const rows: OperationClosingExportRow[] = [];
  for (const project of overview.rows) {
    const closingStatus = closingStatusLabels[project.status];
    const closedAt = project.closedAt ?? "";
    const closedByName = project.closedByName ?? "";
    const consultants = project.readiness.consultants;
    if (consultants.length === 0) {
      rows.push({
        projectName: project.projectName,
        clientName: project.clientName,
        closingStatus,
        consultantName: "",
        readiness: "Sem equipe alocada",
        hours: 0,
        closedAt,
        closedByName,
      });
      continue;
    }
    for (const consultant of consultants) {
      rows.push({
        projectName: project.projectName,
        clientName: project.clientName,
        closingStatus,
        consultantName: consultant.consultantName,
        readiness: consultantReadinessLabels[consultant.state],
        hours: consultant.hours,
        closedAt,
        closedByName,
      });
    }
  }
  return rows;
}

const MONEY_FMT = "#,##0.00";

export function operationClosingXlsxColumns(): XlsxColumn<OperationClosingExportRow>[] {
  return [
    { header: "Projeto", value: (r) => r.projectName, width: 24 },
    { header: "Cliente", value: (r) => r.clientName, width: 24 },
    { header: "Status do fechamento", value: (r) => r.closingStatus, width: 18 },
    { header: "Consultor", value: (r) => r.consultantName, width: 22 },
    { header: "Situação", value: (r) => r.readiness, width: 20 },
    { header: "Horas", value: (r) => r.hours, numFmt: MONEY_FMT, width: 10 },
    { header: "Fechado em", value: (r) => r.closedAt, width: 22 },
    { header: "Fechado por", value: (r) => r.closedByName, width: 22 },
  ];
}
