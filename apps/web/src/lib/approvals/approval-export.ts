import type { XlsxColumn } from "@/lib/export/xlsx";
import {
  approvalKindLabels,
  approvalStageLabels,
  approvalStatusLabels,
  type ApprovalItem,
  type ApprovalKind,
  type ApprovalStatus,
} from "@/lib/mock-data/approvals";

/**
 * Pure helpers for the Aprovações `.xlsx` export (Onda 6). The route rebuilds
 * the SAME scoped queue the screen shows (listHoursApprovalItems +
 * listExpenseApprovalItems, gated by role and PROJECT_MANAGER managerUserId),
 * then this module filters + shapes those already-authorized items.
 *
 * The `amount` column is the EXPENSE value the approver already sees on screen
 * (never a masked project financial field), so no column masking is needed —
 * the RBAC scope alone decides which items reach the file.
 */

export interface ApprovalExportFilter {
  /** Kind tab (Horas/Despesas). Undefined = both. */
  kind?: ApprovalKind;
  /** Status chip. Undefined = all. */
  status?: ApprovalStatus;
  /** Exact name matches, mirroring the queue's client-side filters. */
  client?: string;
  project?: string;
  consultant?: string;
  activity?: string;
  /** Inclusive submitted-date range (yyyy-mm-dd), compared like the queue. */
  from?: string;
  to?: string;
}

/**
 * Apply the queue's on-screen filters to the scoped items. Matches the exact
 * predicates in `ApprovalQueue` (kind tab, status chip, client/project/
 * consultant/activity by name, submitted-date window) so the export equals the
 * visible list.
 */
export function filterApprovalItemsForExport(
  items: ReadonlyArray<ApprovalItem>,
  filter: ApprovalExportFilter,
): ApprovalItem[] {
  return items.filter((item) => {
    if (filter.kind && item.type !== filter.kind) return false;
    if (filter.status && item.status !== filter.status) return false;
    if (filter.client && item.clientName !== filter.client) return false;
    if (filter.project && item.projectName !== filter.project) return false;
    if (filter.consultant && item.consultantName !== filter.consultant) {
      return false;
    }
    if (filter.activity && item.activitySummary !== filter.activity) {
      return false;
    }
    const submittedDate = item.submittedAt.slice(0, 10);
    if (filter.from && submittedDate < filter.from) return false;
    if (filter.to && submittedDate > filter.to) return false;
    return true;
  });
}

const MONEY_FMT = "#,##0.00";

/** Columns for the Aprovações queue export (hours + expenses in one sheet). */
export function approvalXlsxColumns(): XlsxColumn<ApprovalItem>[] {
  return [
    { header: "Consultor", value: (i) => i.consultantName, width: 22 },
    { header: "Tipo", value: (i) => approvalKindLabels[i.type], width: 12 },
    {
      header: "Etapa",
      value: (i) => (i.stage ? approvalStageLabels[i.stage] : ""),
      width: 12,
    },
    { header: "Cliente", value: (i) => i.clientName, width: 22 },
    { header: "Projeto", value: (i) => i.projectName, width: 24 },
    { header: "Período", value: (i) => i.period, width: 26 },
    {
      header: "Horas",
      value: (i) => (i.type === "HOURS" ? i.hours : null),
      numFmt: MONEY_FMT,
      width: 10,
    },
    {
      header: "Valor",
      value: (i) => (i.type === "EXPENSE" ? (i.amount ?? null) : null),
      numFmt: MONEY_FMT,
      width: 14,
    },
    { header: "Atividade", value: (i) => i.activitySummary, width: 30 },
    {
      header: "Status",
      value: (i) => approvalStatusLabels[i.status],
      width: 16,
    },
    {
      header: "Automático",
      value: (i) => (i.isAutomatic ? "Sim" : "Não"),
      width: 12,
    },
    { header: "Regra", value: (i) => i.ruleKey ?? "", width: 20 },
    { header: "Justificativa", value: (i) => i.comment ?? "", width: 30 },
    { header: "Enviado em", value: (i) => i.submittedAt, width: 22 },
  ];
}
