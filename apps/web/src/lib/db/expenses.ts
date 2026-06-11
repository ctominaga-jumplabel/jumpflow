import { prisma } from "@jumpflow/database";
import type { ActionResult } from "@/lib/actions/result";
import { isDevAuthEnabled } from "@/lib/auth/dev";
import { FINANCIAL_ROLES, hasRole } from "@/lib/auth/route-permissions";
import type { AppUser } from "@/lib/auth/types";
import { resolveDbUser } from "@/lib/db/users";
import type {
  Expense,
  ExpenseFilter,
  ExpenseStatus,
  ExpenseTotals,
} from "@/lib/expenses/types";
import { isExpenseRejected, summarizeExpenses } from "@/lib/expenses/types";
import type { ApprovalItem, ApprovalStage } from "@/lib/mock-data/approvals";
import { getStorageProvider, isStorageConfigured } from "@/lib/storage/provider";
import { parseIsoDateUtc, toIsoDate } from "@/lib/timesheet/week";

/**
 * Read/query layer for the Despesas module (docs/despesas-persistencia.md
 * section 7). Assumes a database is configured — callers must guard with
 * `isDatabaseConfigured()` first. Selects stay narrow; project financial
 * fields are never exposed.
 */

const MONTH_SHORT = [
  "jan",
  "fev",
  "mar",
  "abr",
  "mai",
  "jun",
  "jul",
  "ago",
  "set",
  "out",
  "nov",
  "dez",
];

/** Human date label for the approval queue, e.g. "03 jun 2026" (UTC fields). */
function expenseDateLabel(date: Date): string {
  const dd = String(date.getUTCDate()).padStart(2, "0");
  return `${dd} ${MONTH_SHORT[date.getUTCMonth()]} ${date.getUTCFullYear()}`;
}

interface ExpenseRow {
  id: string;
  projectId: string;
  date: Date;
  amount: unknown;
  description: string;
  invoiceNumber: string | null;
  status: string;
  submittedAt: Date | null;
  consultant: { name: string };
  project: { name: string; client: { name: string } };
  attachment: { fileName: string; contentType: string; size: number } | null;
}

const expenseSelect = {
  id: true,
  projectId: true,
  date: true,
  amount: true,
  description: true,
  invoiceNumber: true,
  status: true,
  submittedAt: true,
  consultant: { select: { name: true } },
  project: { select: { name: true, client: { select: { name: true } } } },
  attachment: { select: { fileName: true, contentType: true, size: true } },
} as const;

function toUiExpense(row: ExpenseRow, rejectionReason?: string): Expense {
  return {
    id: row.id,
    projectId: row.projectId,
    projectName: row.project.name,
    clientName: row.project.client.name,
    consultantName: row.consultant.name,
    date: toIsoDate(row.date),
    amount: Number(row.amount),
    description: row.description,
    invoiceNumber: row.invoiceNumber ?? undefined,
    attachment: row.attachment ?? undefined,
    status: row.status as ExpenseStatus,
    submittedAt: row.submittedAt?.toISOString(),
    rejectionReason,
    source: "db",
  };
}

/**
 * For rejected expenses, resolve the comment of the LATEST REJECTED approval
 * (the justification the consultant must act on).
 */
async function loadRejectionReasons(
  expenseIds: string[],
): Promise<Map<string, string>> {
  const reasons = new Map<string, string>();
  if (expenseIds.length === 0) return reasons;
  const approvals = await prisma.approval.findMany({
    where: {
      entityType: "EXPENSE",
      entityId: { in: expenseIds },
      status: "REJECTED",
    },
    orderBy: { createdAt: "desc" },
    select: { entityId: true, comment: true },
  });
  for (const approval of approvals) {
    if (!reasons.has(approval.entityId) && approval.comment) {
      reasons.set(approval.entityId, approval.comment);
    }
  }
  return reasons;
}

/**
 * Expenses of a consultant mapped to the UI shape, with optional status/
 * project/period filters (dates inclusive). Most recent first.
 */
export async function listExpensesForConsultant(
  consultantId: string,
  filter: ExpenseFilter = {},
): Promise<Expense[]> {
  const from = filter.from ? parseIsoDateUtc(filter.from) : null;
  const to = filter.to ? parseIsoDateUtc(filter.to) : null;
  const rows = await prisma.expense.findMany({
    where: {
      consultantId,
      ...(filter.status && filter.status !== "ALL"
        ? { status: filter.status }
        : {}),
      ...(filter.projectId && filter.projectId !== "ALL"
        ? { projectId: filter.projectId }
        : {}),
      ...(from || to
        ? { date: { ...(from ? { gte: from } : {}), ...(to ? { lte: to } : {}) } }
        : {}),
    },
    select: expenseSelect,
    orderBy: [{ date: "desc" }, { createdAt: "desc" }],
  });

  const rejectedIds = rows
    .filter((r) => isExpenseRejected(r.status as ExpenseStatus))
    .map((r) => r.id);
  const reasons = await loadRejectionReasons(rejectedIds);
  return rows.map((row) => toUiExpense(row, reasons.get(row.id)));
}

export interface ExpenseProjectOption {
  id: string;
  name: string;
  clientName: string;
}

/**
 * Projects the consultant may log expenses to: ACTIVE allocations on projects
 * not CLOSED. The server action still validates that the allocation period
 * covers the chosen date.
 */
export async function listExpenseProjects(
  consultantId: string,
): Promise<ExpenseProjectOption[]> {
  const allocations = await prisma.allocation.findMany({
    where: {
      consultantId,
      status: "ACTIVE",
      project: { status: { not: "CLOSED" } },
    },
    select: {
      projectId: true,
      project: { select: { name: true, client: { select: { name: true } } } },
    },
  });
  const byProject = new Map<string, ExpenseProjectOption>();
  for (const allocation of allocations) {
    byProject.set(allocation.projectId, {
      id: allocation.projectId,
      name: allocation.project.name,
      clientName: allocation.project.client.name,
    });
  }
  return [...byProject.values()].sort((a, b) =>
    a.name.localeCompare(b.name, "pt-BR"),
  );
}

export interface ExpenseApprovalScope {
  /** Include the manager stage (SUBMITTED expenses). */
  includeManagerStage: boolean;
  /** Include the finance stage (MANAGER_APPROVED expenses). */
  includeFinanceStage: boolean;
  /**
   * Restrict the manager stage (and history) to projects managed by this DB
   * user id (PROJECT_MANAGER scope). Omit for ADMIN/AREA_MANAGER.
   */
  managerUserId?: string;
}

const HISTORY_LIMIT = 50;

/**
 * Derive the approval stage of each EXPENSE Approval, walking the two-stage
 * chain in chronological order: the stage starts at MANAGER; a manager
 * approval moves the pointer to FINANCE; any rejection (and a finance
 * approval, which ends the chain) resets it to MANAGER for the next
 * resubmission cycle. Pure and exported for tests.
 */
export function deriveApprovalStages(
  approvals: ReadonlyArray<{ status: string }>,
): ApprovalStage[] {
  const stages: ApprovalStage[] = [];
  let stage: ApprovalStage = "MANAGER";
  for (const approval of approvals) {
    stages.push(stage);
    stage =
      approval.status === "APPROVED" && stage === "MANAGER"
        ? "FINANCE"
        : "MANAGER";
  }
  return stages;
}

/**
 * Approval queue items for EXPENSE — a single queue with a stage label:
 * - pending: SUBMITTED ("Gestor" stage) and/or MANAGER_APPROVED
 *   ("Financeiro" stage), per the caller-built scope;
 * - history: latest EXPENSE approvals (PM scope resolved BEFORE the limit).
 */
export async function listExpenseApprovalItems(
  scope: ExpenseApprovalScope,
): Promise<ApprovalItem[]> {
  const pendingFilters: object[] = [];
  if (scope.includeManagerStage) {
    pendingFilters.push({
      status: "SUBMITTED",
      ...(scope.managerUserId
        ? { project: { managerUserId: scope.managerUserId } }
        : {}),
    });
  }
  if (scope.includeFinanceStage) {
    pendingFilters.push({ status: "MANAGER_APPROVED" });
  }

  const pendingRows = pendingFilters.length
    ? await prisma.expense.findMany({
        where: { OR: pendingFilters },
        select: expenseSelect,
        orderBy: { submittedAt: "asc" },
      })
    : [];

  const pending: ApprovalItem[] = pendingRows.map((row) => ({
    id: `db-exp-pending-${row.id}`,
    type: "EXPENSE",
    source: "db",
    expenseId: row.id,
    stage: row.status === "SUBMITTED" ? "MANAGER" : "FINANCE",
    consultantName: row.consultant.name,
    projectName: row.project.name,
    clientName: row.project.client.name,
    period: expenseDateLabel(row.date),
    hours: 0,
    amount: Number(row.amount),
    activitySummary: row.invoiceNumber
      ? `${row.description} · ${row.invoiceNumber}`
      : row.description,
    submittedAt: (row.submittedAt ?? new Date()).toISOString(),
    status: "PENDING",
    isAutomatic: false,
  }));

  // Approval.entityId has no FK to Expense, so the PROJECT_MANAGER scope must
  // be resolved to expense ids BEFORE the take(HISTORY_LIMIT) window.
  let historyEntityFilter: { entityId: { in: string[] } } | undefined;
  if (scope.managerUserId) {
    const managedExpenses = await prisma.expense.findMany({
      where: { project: { managerUserId: scope.managerUserId } },
      select: { id: true },
    });
    historyEntityFilter = {
      entityId: { in: managedExpenses.map((e) => e.id) },
    };
  }

  const approvals = await prisma.approval.findMany({
    where: { entityType: "EXPENSE", ...historyEntityFilter },
    orderBy: { createdAt: "desc" },
    take: HISTORY_LIMIT,
  });

  const decidedIds = [...new Set(approvals.map((a) => a.entityId))];
  const decidedRows = decidedIds.length
    ? await prisma.expense.findMany({
        where: { id: { in: decidedIds } },
        select: expenseSelect,
      })
    : [];
  const rowsById = new Map(decidedRows.map((row) => [row.id, row]));

  // Stage derivation needs the FULL chronological chain per expense, not the
  // truncated window, so resubmission cycles resolve correctly.
  const allChains = decidedIds.length
    ? await prisma.approval.findMany({
        where: { entityType: "EXPENSE", entityId: { in: decidedIds } },
        orderBy: { createdAt: "asc" },
        select: { id: true, entityId: true, status: true },
      })
    : [];
  const stageByApprovalId = new Map<string, ApprovalStage>();
  const chains = new Map<string, { id: string; status: string }[]>();
  for (const approval of allChains) {
    const chain = chains.get(approval.entityId) ?? [];
    chain.push(approval);
    chains.set(approval.entityId, chain);
  }
  for (const chain of chains.values()) {
    const stages = deriveApprovalStages(chain);
    chain.forEach((approval, index) => {
      stageByApprovalId.set(approval.id, stages[index]);
    });
  }

  const history: ApprovalItem[] = [];
  for (const approval of approvals) {
    const row = rowsById.get(approval.entityId);
    if (!row) continue;
    history.push({
      id: `db-exp-approval-${approval.id}`,
      type: "EXPENSE",
      source: "db",
      expenseId: row.id,
      stage: stageByApprovalId.get(approval.id),
      consultantName: row.consultant.name,
      projectName: row.project.name,
      clientName: row.project.client.name,
      period: expenseDateLabel(row.date),
      hours: 0,
      amount: Number(row.amount),
      activitySummary: row.invoiceNumber
        ? `${row.description} · ${row.invoiceNumber}`
        : row.description,
      submittedAt: (row.submittedAt ?? approval.createdAt).toISOString(),
      status: approval.status === "REJECTED" ? "REJECTED" : "APPROVED",
      isAutomatic: approval.isAutomatic,
      comment: approval.comment ?? undefined,
    });
  }

  return [...pending, ...history];
}

export interface FinanceExpenses {
  expenses: Expense[];
  totals: ExpenseTotals;
}

/**
 * Expenses that reached finance (FINANCE_APPROVED, PAYMENT_SCHEDULED, PAID)
 * with aggregate totals for the ExpensesFinancePanel.
 */
export async function listFinanceExpenses(): Promise<FinanceExpenses> {
  const rows = await prisma.expense.findMany({
    where: {
      status: { in: ["FINANCE_APPROVED", "PAYMENT_SCHEDULED", "PAID"] },
    },
    select: expenseSelect,
    orderBy: [{ date: "desc" }, { createdAt: "desc" }],
  });
  const expenses = rows.map((row) => toUiExpense(row));
  return { expenses, totals: summarizeExpenses(expenses) };
}

const SIGNED_URL_TTL_SECONDS = 300;

/**
 * Short-lived signed URL for an expense receipt. RBAC runs on the server
 * BEFORE signing: allowed for the expense owner, the manager of the expense's
 * project, FINANCE, AREA_MANAGER and ADMIN — nobody else.
 */
export async function getReceiptSignedUrl(
  expenseId: string,
  user: AppUser,
): Promise<ActionResult<{ url: string }>> {
  // Anti-enumeration: a missing expense and an expense the caller may not see
  // return the SAME FORBIDDEN response, so the existence of an id never leaks
  // to someone without access. The NOT_FOUND ("sem comprovante") branch below
  // is reachable ONLY after access is confirmed.
  const forbidden: ActionResult<{ url: string }> = {
    ok: false,
    error: "FORBIDDEN",
    message: "Você não tem acesso a este comprovante.",
  };

  const expense = await prisma.expense.findUnique({
    where: { id: expenseId },
    select: {
      id: true,
      consultant: { select: { userId: true, email: true } },
      project: { select: { managerUserId: true } },
      attachment: { select: { storageKey: true } },
    },
  });
  if (!expense) return forbidden;

  const dbUser = await resolveDbUser(user);
  const isOwner =
    (dbUser !== null && expense.consultant.userId === dbUser.id) ||
    (isDevAuthEnabled() &&
      expense.consultant.email.toLowerCase() ===
        user.email.trim().toLowerCase());
  const isProjectManager =
    dbUser !== null && expense.project.managerUserId === dbUser.id;
  // FINANCIAL_ROLES = ADMIN, AREA_MANAGER, FINANCE — exactly the privileged
  // set allowed to open any receipt.
  const hasPrivilegedRole = hasRole(user, FINANCIAL_ROLES);
  if (!isOwner && !isProjectManager && !hasPrivilegedRole) return forbidden;

  if (!expense.attachment) {
    return {
      ok: false,
      error: "NOT_FOUND",
      message: "Esta despesa não possui comprovante.",
    };
  }
  if (!isStorageConfigured()) {
    return {
      ok: false,
      error: "NO_STORAGE",
      message: "Anexos indisponíveis: storage não configurado.",
    };
  }

  const provider = getStorageProvider();
  if (!provider) {
    return {
      ok: false,
      error: "NO_STORAGE",
      message: "Anexos indisponíveis: storage não configurado.",
    };
  }
  try {
    const url = await provider.getSignedUrl(
      expense.attachment.storageKey,
      SIGNED_URL_TTL_SECONDS,
    );
    return { ok: true, data: { url } };
  } catch (error) {
    console.error("[despesas] failed to sign receipt url", error);
    return {
      ok: false,
      error: "UNEXPECTED",
      message: "Não foi possível gerar o link do comprovante. Tente novamente.",
    };
  }
}
