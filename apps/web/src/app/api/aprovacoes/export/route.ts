import { requireRole, hasRole } from "@/lib/auth/guards";
import { isDatabaseConfigured } from "@/lib/db/config";
import { buildWorkbook, defineSheet, xlsxResponse } from "@/lib/export/xlsx";
import {
  approvalXlsxColumns,
  filterApprovalItemsForExport,
  type ApprovalExportFilter,
} from "@/lib/approvals/approval-export";
import {
  approvalStatusLabels,
  type ApprovalKind,
  type ApprovalStatus,
} from "@/lib/mock-data/approvals";
import { noDatabaseResponse } from "../../relatorios/shared";

export const dynamic = "force-dynamic";

const APPROVAL_ROLES = [
  "ADMIN",
  "AREA_MANAGER",
  "PROJECT_MANAGER",
  "FINANCE",
] as const;

/**
 * `.xlsx` export of the Aprovações queue (Onda 6). Rebuilds the SAME scoped
 * queue the screen shows — HOURS via listHoursApprovalItems, EXPENSE via
 * listExpenseApprovalItems — with the identical role gating and PROJECT_MANAGER
 * managerUserId narrowing as `app/app/aprovacoes/page.tsx`. The on-screen
 * filters (kind/status/cliente/projeto/consultor/atividade/período) are
 * reapplied server-side. Audits `APPROVALS_EXPORTED` with the filter used.
 */
export async function GET(request: Request) {
  const user = await requireRole([...APPROVAL_ROLES]);
  if (!isDatabaseConfigured()) return noDatabaseResponse();

  const { listHoursApprovalItems } = await import("@/lib/db/timesheet");
  const { listExpenseApprovalItems } = await import("@/lib/db/expenses");
  const { resolveDbUser } = await import("@/lib/db/users");

  const unrestricted = hasRole(user, ["ADMIN", "AREA_MANAGER"]);
  const isProjectManager = hasRole(user, "PROJECT_MANAGER");
  const isFinance = hasRole(user, "FINANCE");

  // Resolve the REAL db user once (dev session ids never match db rows): used
  // for the PROJECT_MANAGER scope AND the audit actor below.
  const dbUser = await resolveDbUser(user);
  let managerUserId: string | undefined;
  if (!unrestricted && isProjectManager) {
    // An unresolvable manager sees an empty stage (fail closed).
    managerUserId = dbUser?.id ?? "__no-manager__";
  }

  const seesHours = unrestricted || isProjectManager;
  const hoursItems = seesHours
    ? await listHoursApprovalItems(managerUserId ? { managerUserId } : {})
    : [];
  const expenseItems = await listExpenseApprovalItems({
    includeManagerStage: unrestricted || isProjectManager,
    includeFinanceStage: unrestricted || isFinance,
    managerUserId,
  });
  const items = [...hoursItems, ...expenseItems];

  // Reapply the on-screen filters (names carried directly by the queue).
  const url = new URL(request.url);
  const kindRaw = url.searchParams.get("kind") || undefined;
  const kind =
    kindRaw === "HOURS" || kindRaw === "EXPENSE"
      ? (kindRaw as ApprovalKind)
      : undefined;
  const statusRaw = url.searchParams.get("status") || undefined;
  const status =
    statusRaw && statusRaw in approvalStatusLabels
      ? (statusRaw as ApprovalStatus)
      : undefined;
  const filter: ApprovalExportFilter = {
    kind,
    status,
    client: url.searchParams.get("client") || undefined,
    project: url.searchParams.get("project") || undefined,
    consultant: url.searchParams.get("consultant") || undefined,
    activity: url.searchParams.get("activity") || undefined,
    from: url.searchParams.get("from") || undefined,
    to: url.searchParams.get("to") || undefined,
  };
  const rows = filterApprovalItemsForExport(items, filter);

  const daySlug = new Date().toISOString().slice(0, 10);
  const buffer = await buildWorkbook([
    defineSheet({ name: "Aprovacoes", columns: approvalXlsxColumns(), rows }),
  ]);

  const { recordAuditEvent } = await import("@/lib/db/audit");
  await recordAuditEvent({
    actorUserId: dbUser?.id ?? null,
    entityType: "Approval",
    entityId: daySlug,
    action: "APPROVALS_EXPORTED",
    after: { filter, rowCount: rows.length },
  });

  return xlsxResponse(buffer, `aprovacoes_${daySlug}.xlsx`);
}
