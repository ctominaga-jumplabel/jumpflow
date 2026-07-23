import { prisma } from "@jumpflow/database";
import { FINANCIAL_ROLES, hasRole } from "@/lib/auth/route-permissions";
import { can } from "@/lib/auth/permissions";
import { REPORT_CONSULTANT_FILTER_CODE } from "@/lib/auth/permission-codes";
import type { AppUser } from "@/lib/auth/types";
import { getConsultantForUser } from "@/lib/db/timesheet";
import { resolveDbUser } from "@/lib/db/users";
import { activityLabelOf, type TimeEntryStatus } from "@/lib/timesheet/types";
import {
  expenseStatusLabels,
  isExpenseRejected,
  summarizeExpenses,
  type Expense,
  type ExpenseStatus,
} from "@/lib/expenses/types";
import { parseIsoDateUtc, toIsoDate, weekLabel } from "@/lib/timesheet/week";
import {
  DEFAULT_PAGE_SIZE,
  EXPENSE_STAGE_STATUSES,
  EXPENSES_DEFAULT_DIRECTION,
  EXPENSES_DEFAULT_SORT,
  HOURS_DEFAULT_DIRECTION,
  HOURS_DEFAULT_SORT,
  resolveConsolidatedRange,
  resolveDetailRange,
  type ConsolidatedReportFilter,
  type ExpensesReportFilter,
  type ExpensesSortField,
  type HoursReportFilter,
  type HoursSortField,
} from "@/lib/reports/schemas";
import type {
  ConsolidatedClient,
  ConsolidatedProject,
  ConsolidatedReport,
  ConsolidatedTotals,
  ExpensesReport,
  ExpensesReportRow,
  HoursReport,
  HoursReportRow,
  HoursReportTotals,
  PaginationMeta,
} from "@/lib/reports/types";
import {
  resolveSaleRate,
  type SaleRateRange,
} from "@/lib/projects/rates";

/** Safe ceiling for "export all" reads (CSV) when no page is given. */
const EXPORT_ALL_LIMIT = 50_000;

interface ProjectRateContext {
  projectFallbackRate?: number | null;
  clientFallbackRate?: number | null;
  rates: SaleRateRange[];
}

async function loadProjectRateContexts(
  projectIds: string[],
): Promise<Map<string, ProjectRateContext>> {
  const uniqueIds = [...new Set(projectIds)].filter(Boolean);
  if (uniqueIds.length === 0) return new Map();
  const projects = await prisma.project.findMany({
    where: { id: { in: uniqueIds } },
    select: {
      id: true,
      billingHourlyRate: true,
      client: { select: { defaultHourlyRate: true } },
      saleRates: {
        select: {
          id: true,
          projectId: true,
          consultantId: true,
          allocationId: true,
          startsAt: true,
          endsAt: true,
          hourlyRate: true,
        },
      },
    },
  });
  return new Map(
    projects.map((project) => [
      project.id,
      {
        projectFallbackRate:
          project.billingHourlyRate == null
            ? null
            : Number(project.billingHourlyRate),
        clientFallbackRate:
          project.client.defaultHourlyRate == null
            ? null
            : Number(project.client.defaultHourlyRate),
        rates: (project.saleRates ?? []).map((rate) => ({
          id: rate.id,
          projectId: rate.projectId,
          consultantId: rate.consultantId,
          allocationId: rate.allocationId,
          startsAt: toIsoDate(rate.startsAt),
          endsAt: rate.endsAt ? toIsoDate(rate.endsAt) : null,
          hourlyRate: Number(rate.hourlyRate),
        })),
      },
    ]),
  );
}

function resolveBillingRate(
  contexts: Map<string, ProjectRateContext>,
  entry: {
    projectId: string;
    consultantId?: string | null;
    allocationId?: string | null;
    date: Date;
  },
): number | null {
  const context = contexts.get(entry.projectId);
  if (!context) return null;
  return (
    resolveSaleRate(context.rates, {
      date: toIsoDate(entry.date),
      consultantId: entry.consultantId,
      allocationId: entry.allocationId,
      projectFallbackRate: context.projectFallbackRate,
      clientFallbackRate: context.clientFallbackRate,
    })?.hourlyRate ?? null
  );
}

/**
 * Read/query layer for the Relatorios module (docs/relatorios-fechamento.md
 * sections 2, 5, 7). Assumes a database is configured — callers must guard
 * with `isDatabaseConfigured()`.
 *
 * RBAC and scope live here so the screen and the CSV route handlers call the
 * SAME functions: a CSV can never export more than the screen shows. Monetary
 * hour columns are gated by `includeFinancials` both in the `select` (defense
 * in depth) and in the mapper.
 */

/** Hours statuses FINANCE may see (closing-only). */
const FINANCE_HOURS_STATUSES: TimeEntryStatus[] = ["APPROVED", "CLOSED"];

/** Activity label (canonical -> legacy -> raw). Single source in types.ts. */
function activityLabelFor(value: string): string {
  return activityLabelOf(value);
}

export interface ReportScope {
  /** CONSULTANT (no management role): restrict to this consultant id. */
  ownConsultantId?: string;
  /** PROJECT_MANAGER: restrict to projects managed by this DB user id. */
  managerUserId?: string;
  /** True for AREA_MANAGER / ADMIN / FINANCE (no consultant/PM narrowing). */
  broad: boolean;
  /** FINANCIAL_ROLES: monetary hour columns are allowed. */
  includeFinancials: boolean;
  /** FINANCE: hours are limited to APPROVED/CLOSED. */
  financeHoursLimited: boolean;
}

/**
 * Resolve a user's report scope as the UNION of their roles (the widest wins).
 * Pure over roles + `getConsultantForUser`/`resolveDbUser`.
 *
 * - CONSULTANT only -> own consultant, no financials.
 * - PROJECT_MANAGER -> managed projects (via managerUserId).
 * - AREA_MANAGER / ADMIN -> broad + financials.
 * - FINANCE -> broad + financials + financeHoursLimited.
 */
export async function resolveReportScope(user: AppUser): Promise<ReportScope> {
  const isAdmin = hasRole(user, "ADMIN");
  const isAreaManager = hasRole(user, "AREA_MANAGER");
  const isFinance = hasRole(user, "FINANCE");
  const isProjectManager = hasRole(user, "PROJECT_MANAGER");
  const includeFinancials = hasRole(user, FINANCIAL_ROLES);
  // Broad scope may ALSO be granted via the matrix (RELATORIOS_CONSULTORES), e.g.
  // to People/DP, so the consultant filter appears. The HOURS financial columns
  // (billing rate/cost/margin) stay gated by `includeFinancials`/FINANCIAL_ROLES,
  // so a matrix-only viewer never sees them. Expense/reimbursement values DO
  // follow the broad scope (conscious finance-ops decision: People/DP may see
  // reimbursements). Fail-closed if the matrix can't be read.
  let canFilterAllConsultants = false;
  try {
    canFilterAllConsultants = await can(REPORT_CONSULTANT_FILTER_CODE, "view");
  } catch {
    canFilterAllConsultants = false;
  }

  // Broad scope: any of ADMIN/AREA_MANAGER/FINANCE, or the matrix grant above.
  const broad = isAdmin || isAreaManager || isFinance || canFilterAllConsultants;
  // FINANCE limits hours to closing-relevant statuses, but only when it does
  // NOT also hold a wider hours role (ADMIN/AREA_MANAGER see all statuses).
  const financeHoursLimited = isFinance && !isAdmin && !isAreaManager;

  if (broad) {
    return { broad: true, includeFinancials, financeHoursLimited };
  }

  if (isProjectManager) {
    const dbUser = await resolveDbUser(user);
    return {
      managerUserId: dbUser?.id,
      broad: false,
      includeFinancials,
      financeHoursLimited: false,
    };
  }

  // CONSULTANT (or no role): own data only, never financials.
  const consultant = await getConsultantForUser(user);
  return {
    ownConsultantId: consultant?.id,
    broad: false,
    includeFinancials: false,
    financeHoursLimited: false,
  };
}

/** Whether a non-broad scope can resolve to ANY rows. */
function scopeHasUniverse(scope: ReportScope): boolean {
  if (scope.broad) return true;
  if (scope.ownConsultantId) return true;
  if (scope.managerUserId) return true;
  return false;
}

// The where shapes are dynamic Prisma filters; keep them lintable.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Where = Record<string, any>;

/** Inclusive `date` range filter fragment from ISO strings. */
function dateRangeFilter(from?: string, to?: string): Where | undefined {
  const gte = from ? parseIsoDateUtc(from) : null;
  const lte = to ? parseIsoDateUtc(to) : null;
  if (!gte && !lte) return undefined;
  return {
    date: { ...(gte ? { gte } : {}), ...(lte ? { lte } : {}) },
  };
}

/**
 * Build the Prisma `where` for the Hours report from scope + filters. Pure and
 * exported for tests. FINANCE-limited scope forces `status in APPROVED/CLOSED`
 * even with no explicit status; an explicit status is intersected with it.
 */
export function buildHoursWhere(
  scope: ReportScope,
  filter: HoursReportFilter,
): Where {
  const where: Where = {};

  // Scope narrowing.
  if (scope.ownConsultantId) where.consultantId = scope.ownConsultantId;
  if (scope.managerUserId) {
    where.project = { managerUserId: scope.managerUserId };
  }

  // Explicit filters.
  if (filter.consultantId) where.consultantId = filter.consultantId;
  if (filter.projectId) where.projectId = filter.projectId;
  applyRelationStatusFilters(where, filter);
  if (filter.activityType) where.activityType = filter.activityType;
  if (filter.billable !== undefined) where.billable = filter.billable;

  const range = dateRangeFilter(filter.from, filter.to);
  if (range) Object.assign(where, range);

  // Status: FINANCE limited set, possibly intersected with an explicit filter.
  if (scope.financeHoursLimited) {
    if (filter.status && FINANCE_HOURS_STATUSES.includes(filter.status)) {
      where.status = filter.status;
    } else {
      where.status = { in: FINANCE_HOURS_STATUSES };
    }
  } else if (filter.status) {
    where.status = filter.status;
  }

  return where;
}

/**
 * Shared client/project/consultant status + clientId merging for both report
 * where builders. Carefully SPREADS `where.project` so it never clobbers an
 * existing scope narrowing (`managerUserId`) or a `clientId` filter.
 *
 * - `clientId` -> `where.project.clientId`
 * - `projectStatus` -> `where.project.status`
 * - `clientStatus` -> `where.project.client = { status }`
 * - `consultantStatus` -> `where.consultant = { status }` (coexists with the
 *   scalar `where.consultantId` set by scope/explicit filter).
 */
function applyRelationStatusFilters(
  where: Where,
  filter: {
    clientId?: string;
    clientStatus?: string;
    projectStatus?: string;
    consultantStatus?: string;
  },
): void {
  const project: Where = { ...(where.project ?? {}) };
  if (filter.clientId) project.clientId = filter.clientId;
  if (filter.projectStatus) project.status = filter.projectStatus;
  if (filter.clientStatus) {
    project.client = { ...(project.client ?? {}), status: filter.clientStatus };
  }
  if (Object.keys(project).length > 0) where.project = project;

  if (filter.consultantStatus) {
    where.consultant = {
      ...(where.consultant ?? {}),
      status: filter.consultantStatus,
    };
  }
}

/**
 * Build the Prisma `where` for the Expenses report from scope + filters. Pure
 * and exported for tests. `status` (explicit) wins over `stage`; a stage
 * expands to its status set.
 */
export function buildExpensesWhere(
  scope: ReportScope,
  filter: ExpensesReportFilter,
): Where {
  const where: Where = {};

  if (scope.ownConsultantId) where.consultantId = scope.ownConsultantId;
  if (scope.managerUserId) {
    where.project = { managerUserId: scope.managerUserId };
  }

  if (filter.consultantId) where.consultantId = filter.consultantId;
  if (filter.projectId) where.projectId = filter.projectId;
  applyRelationStatusFilters(where, filter);

  const range = dateRangeFilter(filter.from, filter.to);
  if (range) Object.assign(where, range);

  if (filter.status) {
    where.status = filter.status;
  } else if (filter.stage) {
    where.status = { in: [...EXPENSE_STAGE_STATUSES[filter.stage]] };
  }

  return where;
}

/**
 * Resolve the ISO datetime of the latest Approval per entity, ordered desc and
 * collapsed to the first (newest) per entityId.
 */
async function loadLatestApprovalAt(
  entityType: "TIME_ENTRY" | "EXPENSE",
  entityIds: string[],
): Promise<Map<string, string>> {
  const out = new Map<string, string>();
  if (entityIds.length === 0) return out;
  const approvals = await prisma.approval.findMany({
    where: { entityType, entityId: { in: entityIds } },
    orderBy: { createdAt: "desc" },
    select: { entityId: true, createdAt: true },
  });
  for (const approval of approvals) {
    if (!out.has(approval.entityId)) {
      out.set(approval.entityId, approval.createdAt.toISOString());
    }
  }
  return out;
}

/** Latest Approval comment per entity (any status). */
async function loadLatestApprovalComment(
  entityType: "EXPENSE",
  entityIds: string[],
): Promise<Map<string, string>> {
  const out = new Map<string, string>();
  if (entityIds.length === 0) return out;
  const approvals = await prisma.approval.findMany({
    where: { entityType, entityId: { in: entityIds } },
    orderBy: { createdAt: "desc" },
    select: { entityId: true, comment: true },
  });
  for (const approval of approvals) {
    if (!out.has(approval.entityId) && approval.comment) {
      out.set(approval.entityId, approval.comment);
    }
  }
  return out;
}

/**
 * Resolve effective pagination. When `page`/`pageSize` are BOTH absent the
 * caller wants the whole filtered set (CSV "export all"): we return `skip: 0`
 * and `take: EXPORT_ALL_LIMIT` and flag `exportAll`. Otherwise we clamp to a
 * valid 1-based page and a known page size and compute `skip`/`take`.
 */
function resolvePagination(filter: {
  page?: number;
  pageSize?: number;
}): { page: number; pageSize: number; skip: number; take: number; exportAll: boolean } {
  const exportAll = filter.page === undefined && filter.pageSize === undefined;
  if (exportAll) {
    return { page: 1, pageSize: EXPORT_ALL_LIMIT, skip: 0, take: EXPORT_ALL_LIMIT, exportAll: true };
  }
  const pageSize = filter.pageSize ?? DEFAULT_PAGE_SIZE;
  const page = Math.max(1, filter.page ?? 1);
  return { page, pageSize, skip: (page - 1) * pageSize, take: pageSize, exportAll: false };
}

/** Build pagination meta from a total count and the resolved page. */
function paginationMeta(
  total: number,
  resolved: { page: number; pageSize: number; exportAll: boolean },
): PaginationMeta {
  if (resolved.exportAll) {
    return { total, page: 1, pageSize: total, totalPages: 1 };
  }
  return {
    total,
    page: resolved.page,
    pageSize: resolved.pageSize,
    totalPages: Math.max(1, Math.ceil(total / resolved.pageSize)),
  };
}

/** Map a whitelisted hours sort field + direction to a Prisma `orderBy`. */
function hoursOrderBy(
  sort: HoursSortField,
  direction: "asc" | "desc",
): Where[] {
  switch (sort) {
    case "hours":
      return [{ hours: direction }, { date: "asc" }];
    case "consultantName":
      return [{ consultant: { name: direction } }, { date: "asc" }];
    case "projectName":
      return [{ project: { name: direction } }, { date: "asc" }];
    case "status":
      return [{ status: direction }, { date: "asc" }];
    case "date":
    default:
      return [{ date: direction }, { createdAt: "asc" }];
  }
}

/** Map a whitelisted expenses sort field + direction to a Prisma `orderBy`. */
function expensesOrderBy(
  sort: ExpensesSortField,
  direction: "asc" | "desc",
): Where[] {
  switch (sort) {
    case "amount":
      return [{ amount: direction }, { date: "desc" }];
    case "consultantName":
      return [{ consultant: { name: direction } }, { date: "desc" }];
    case "projectName":
      return [{ project: { name: direction } }, { date: "desc" }];
    case "status":
      return [{ status: direction }, { date: "desc" }];
    case "date":
    default:
      return [{ date: direction }, { createdAt: "desc" }];
  }
}

/**
 * Hours report: rows (current page) + totals (whole filtered set). The `select`
 * only pulls `billingHourlyRate` when financials are allowed (defense in
 * depth). `decidedAt` is the latest Approval of the entry. A period preset, if
 * present, overrides `from`/`to` server-side. Totals are computed over the
 * ENTIRE filtered set via a separate minimal query, never just the page.
 */
export async function getHoursReport(
  user: AppUser,
  filter: HoursReportFilter,
  now: Date = new Date(),
): Promise<HoursReport> {
  const scope = await resolveReportScope(user);
  const includeFinancials = scope.includeFinancials;

  if (!scopeHasUniverse(scope)) {
    return emptyHoursReport(includeFinancials);
  }

  // Period preset overrides explicit from/to (server-side).
  const range = resolveDetailRange(filter, now);
  const where = buildHoursWhere(scope, { ...filter, ...range });

  const sort = filter.sort ?? HOURS_DEFAULT_SORT;
  const direction = filter.direction ?? HOURS_DEFAULT_DIRECTION;
  const pg = resolvePagination(filter);

  // Page of rows for display/export.
  const rowsRaw = await prisma.timeEntry.findMany({
    where,
    select: {
      id: true,
      projectId: true,
      consultantId: true,
      allocationId: true,
      date: true,
      hours: true,
      activityType: true,
      billable: true,
      status: true,
      submittedAt: true,
      consultant: { select: { name: true } },
      project: {
        select: {
          name: true,
          client: { select: { name: true } },
        },
      },
    },
    orderBy: hoursOrderBy(sort, direction),
    skip: pg.skip,
    take: pg.take,
  });

  // Totals over the WHOLE filtered set (not just the page): a separate minimal
  // read of every matching row (hours/status/rate) keeps the stat tiles honest.
  const totalsRaw = await prisma.timeEntry.findMany({
    where,
    select: {
      hours: true,
      status: true,
      projectId: true,
      consultantId: true,
      allocationId: true,
      date: true,
      project: {
        select: {
          name: true,
          client: { select: { name: true } },
        },
      },
    },
    take: EXPORT_ALL_LIMIT,
  });
  const total = totalsRaw.length;

  const decidedAt = await loadLatestApprovalAt(
    "TIME_ENTRY",
    rowsRaw.map((r) => r.id),
  );
  const rateContexts = includeFinancials
    ? await loadProjectRateContexts([
        ...rowsRaw.map((r) => r.projectId),
        ...totalsRaw.map((r) => r.projectId),
      ])
    : new Map<string, ProjectRateContext>();

  const rows: HoursReportRow[] = rowsRaw.map((r) => {
    const hours = Number(r.hours);
    const status = r.status as TimeEntryStatus;
    const row: HoursReportRow = {
      id: r.id,
      date: toIsoDate(r.date),
      weekLabel: weekLabel(r.date),
      consultantName: r.consultant.name,
      clientName: r.project.client.name,
      projectName: r.project.name,
      activity: activityLabelFor(r.activityType),
      hours,
      billable: r.billable,
      status,
      submittedAt: r.submittedAt?.toISOString(),
      decidedAt: decidedAt.get(r.id),
    };
    if (includeFinancials) {
      const rate = resolveBillingRate(rateContexts, r);
      row.billingRate = rate;
      row.billedAmount = rate != null ? hours * rate : null;
    }
    return row;
  });

  const totals = summarizeHours(
    totalsRaw.map((r) => ({
      ...r,
      project: {
        ...r.project,
        billingHourlyRate: includeFinancials
          ? resolveBillingRate(rateContexts, r)
          : undefined,
      },
    })),
    includeFinancials,
  );
  return {
    rows,
    totals,
    includeFinancials,
    pagination: paginationMeta(total, pg),
  };
}

function emptyHoursReport(includeFinancials: boolean): HoursReport {
  return {
    rows: [],
    totals: {
      count: 0,
      totalHours: 0,
      hoursByStatus: {},
      hoursByProject: [],
      ...(includeFinancials ? { totalBilled: 0 } : {}),
    },
    includeFinancials,
    pagination: { total: 0, page: 1, pageSize: DEFAULT_PAGE_SIZE, totalPages: 1 },
  };
}

/** Minimal raw shape `summarizeHours` needs (whole-set totals query). */
interface HoursTotalsRow {
  hours: unknown;
  status: string;
  project: {
    name: string;
    client: { name: string };
    billingHourlyRate?: unknown;
  };
}

/**
 * Aggregate Hours totals over the WHOLE filtered set (pure). Accepts the raw
 * minimal rows from Prisma so totals never depend on the visible page.
 */
export function summarizeHours(
  rows: ReadonlyArray<HoursTotalsRow>,
  includeFinancials: boolean,
): HoursReportTotals {
  const hoursByStatus: Partial<Record<TimeEntryStatus, number>> = {};
  const projectMap = new Map<
    string,
    { clientName: string; projectName: string; hours: number }
  >();
  let totalHours = 0;
  let totalBilled = 0;
  let count = 0;

  for (const raw of rows) {
    count += 1;
    const hours = Number(raw.hours);
    const status = raw.status as TimeEntryStatus;
    const clientName = raw.project.client.name;
    const projectName = raw.project.name;
    totalHours += hours;
    hoursByStatus[status] = (hoursByStatus[status] ?? 0) + hours;

    const key = `${clientName}|||${projectName}`;
    const group = projectMap.get(key) ?? {
      clientName,
      projectName,
      hours: 0,
    };
    group.hours += hours;
    projectMap.set(key, group);

    if (includeFinancials && status === "APPROVED") {
      const rateRaw = raw.project.billingHourlyRate;
      if (rateRaw != null) totalBilled += hours * Number(rateRaw);
    }
  }

  const hoursByProject = [...projectMap.values()].sort(
    (a, b) =>
      a.clientName.localeCompare(b.clientName, "pt-BR") ||
      a.projectName.localeCompare(b.projectName, "pt-BR"),
  );

  return {
    count,
    totalHours,
    hoursByStatus,
    hoursByProject,
    ...(includeFinancials ? { totalBilled } : {}),
  };
}

/** Pipeline stage label for an expense status (pt-BR). */
export function expenseStageLabel(status: ExpenseStatus): string {
  switch (status) {
    case "SUBMITTED":
    case "MANAGER_APPROVED":
      return "Gestor";
    case "FINANCE_APPROVED":
      return "Financeiro";
    case "PAYMENT_SCHEDULED":
      return "Pagamento";
    case "PAID":
      return "Finalizada";
    case "MANAGER_REJECTED":
    case "FINANCE_REJECTED":
      return "Reprovada";
    case "DRAFT":
    default:
      return "Rascunho";
  }
}

/**
 * Expenses report: rows (current page) + totals (whole filtered set). A period
 * preset overrides `from`/`to` server-side. Totals come from a separate minimal
 * read of every matching row so they never reflect just the visible page.
 */
export async function getExpensesReport(
  user: AppUser,
  filter: ExpensesReportFilter,
  now: Date = new Date(),
): Promise<ExpensesReport> {
  const scope = await resolveReportScope(user);
  if (!scopeHasUniverse(scope)) {
    return {
      rows: [],
      totals: summarizeExpenses([]),
      pagination: { total: 0, page: 1, pageSize: DEFAULT_PAGE_SIZE, totalPages: 1 },
    };
  }

  const range = resolveDetailRange(filter, now);
  const where = buildExpensesWhere(scope, { ...filter, ...range });

  const sort = filter.sort ?? EXPENSES_DEFAULT_SORT;
  const direction = filter.direction ?? EXPENSES_DEFAULT_DIRECTION;
  const pg = resolvePagination(filter);

  const rowsRaw = await prisma.expense.findMany({
    where,
    select: {
      id: true,
      date: true,
      amount: true,
      description: true,
      invoiceNumber: true,
      status: true,
      submittedAt: true,
      consultant: { select: { name: true } },
      project: { select: { name: true, client: { select: { name: true } } } },
      attachment: { select: { id: true } },
    },
    orderBy: expensesOrderBy(sort, direction),
    skip: pg.skip,
    take: pg.take,
  });

  // Totals over the WHOLE filtered set (amount + status only).
  const totalsRaw = await prisma.expense.findMany({
    where,
    select: { amount: true, status: true },
    take: EXPORT_ALL_LIMIT,
  });
  const total = totalsRaw.length;

  const lastComment = await loadLatestApprovalComment(
    "EXPENSE",
    rowsRaw.map((r) => r.id),
  );

  const rows: ExpensesReportRow[] = rowsRaw.map((r) => {
    const status = r.status as ExpenseStatus;
    return {
      id: r.id,
      date: toIsoDate(r.date),
      consultantName: r.consultant.name,
      clientName: r.project.client.name,
      projectName: r.project.name,
      description: r.description,
      invoiceNumber: r.invoiceNumber ?? undefined,
      amount: Number(r.amount),
      status,
      stage: expenseStageLabel(status),
      hasReceipt: r.attachment != null,
      lastDecision: lastComment.get(r.id),
      submittedAt: r.submittedAt?.toISOString(),
    };
  });

  // Totals over the whole set via the canonical aggregator (minimal shape).
  const asExpenses: Expense[] = totalsRaw.map((r, i) => ({
    id: `t-${i}`,
    projectId: "",
    projectName: "",
    clientName: "",
    consultantName: "",
    date: "",
    amount: Number(r.amount),
    description: "",
    invoiceNumber: undefined,
    status: r.status as ExpenseStatus,
    source: "db",
  }));

  return {
    rows,
    totals: summarizeExpenses(asExpenses),
    pagination: paginationMeta(total, pg),
  };
}

const EXPENSE_ENTERING: ExpenseStatus[] = [
  "FINANCE_APPROVED",
  "PAYMENT_SCHEDULED",
  "PAID",
];

/**
 * Consolidated/closing report (docs section 5.3): group cliente -> projeto,
 * separating hours/expenses that ENTER the closing from pending items. Pending
 * items are signaled but never summed into the "entering" totals.
 */
export async function getConsolidatedReport(
  user: AppUser,
  filter: ConsolidatedReportFilter,
): Promise<ConsolidatedReport> {
  const scope = await resolveReportScope(user);
  const includeFinancials = scope.includeFinancials;
  if (!scopeHasUniverse(scope)) {
    return emptyConsolidated(includeFinancials);
  }

  const range = resolveConsolidatedRange(filter);
  // Reuse the pure where builders; consolidated carries no time-entry/expense
  // status filter, but it DOES honor client/project/consultant status filters.
  const hoursWhere = buildHoursWhere(scope, {
    from: range.from,
    to: range.to,
    clientId: filter.clientId,
    projectId: filter.projectId,
    consultantId: filter.consultantId,
    clientStatus: filter.clientStatus,
    projectStatus: filter.projectStatus,
    consultantStatus: filter.consultantStatus,
  });
  const expensesWhere = buildExpensesWhere(scope, {
    from: range.from,
    to: range.to,
    clientId: filter.clientId,
    projectId: filter.projectId,
    consultantId: filter.consultantId,
    clientStatus: filter.clientStatus,
    projectStatus: filter.projectStatus,
    consultantStatus: filter.consultantStatus,
  });

  const [hoursRaw, expensesRaw] = await Promise.all([
    prisma.timeEntry.findMany({
      where: hoursWhere,
      select: {
        hours: true,
        status: true,
        projectId: true,
        consultantId: true,
        allocationId: true,
        date: true,
        project: {
          select: {
            name: true,
            client: { select: { name: true } },
          },
        },
      },
    }),
    prisma.expense.findMany({
      where: expensesWhere,
      select: {
        amount: true,
        status: true,
        projectId: true,
        project: { select: { name: true, client: { select: { name: true } } } },
      },
    }),
  ]);

  interface ProjAcc extends ConsolidatedProject {
    clientName: string;
  }
  const projects = new Map<string, ProjAcc>();

  function ensure(
    projectId: string,
    projectName: string,
    clientName: string,
  ): ProjAcc {
    let acc = projects.get(projectId);
    if (!acc) {
      acc = {
        projectId,
        projectName,
        clientName,
        approvedHours: 0,
        pendingHours: 0,
        ...(includeFinancials ? { billedAmount: 0 } : {}),
        expenseApproved: 0,
        expenseScheduled: 0,
        expensePaid: 0,
        expenseEntering: 0,
        expensePending: 0,
      };
      projects.set(projectId, acc);
    }
    return acc;
  }

  let totalApproved = 0;
  let totalPendingHours = 0;
  let totalBilled = 0;
  let totalExpenseEntering = 0;
  let totalExpensePending = 0;
  const consolidatedRateContexts = includeFinancials
    ? await loadProjectRateContexts(hoursRaw.map((entry) => entry.projectId))
    : new Map<string, ProjectRateContext>();

  for (const e of hoursRaw) {
    const acc = ensure(e.projectId, e.project.name, e.project.client.name);
    const h = Number(e.hours);
    if (e.status === "APPROVED") {
      acc.approvedHours += h;
      totalApproved += h;
      if (includeFinancials) {
        const rate = resolveBillingRate(consolidatedRateContexts, e);
        if (rate != null) {
          const amount = h * rate;
          acc.billedAmount = (acc.billedAmount ?? 0) + amount;
          totalBilled += amount;
        }
      }
    } else {
      // DRAFT / SUBMITTED / REJECTED / CLOSED-but-not-approved => pending.
      acc.pendingHours += h;
      totalPendingHours += h;
    }
  }

  for (const x of expensesRaw) {
    const acc = ensure(x.projectId, x.project.name, x.project.client.name);
    const amount = Number(x.amount);
    const status = x.status as ExpenseStatus;
    if (EXPENSE_ENTERING.includes(status)) {
      acc.expenseEntering += amount;
      totalExpenseEntering += amount;
      if (status === "FINANCE_APPROVED") acc.expenseApproved += amount;
      else if (status === "PAYMENT_SCHEDULED") acc.expenseScheduled += amount;
      else if (status === "PAID") acc.expensePaid += amount;
    } else {
      // SUBMITTED / MANAGER_APPROVED / rejected => not at finance yet.
      acc.expensePending += amount;
      totalExpensePending += amount;
    }
  }

  // Group by client, ordered.
  const byClient = new Map<string, ConsolidatedProject[]>();
  for (const acc of projects.values()) {
    const list = byClient.get(acc.clientName) ?? [];
    const { clientName: _omit, ...project } = acc;
    void _omit;
    list.push(project);
    byClient.set(acc.clientName, list);
  }

  const clients: ConsolidatedClient[] = [...byClient.entries()]
    .map(([clientName, projectList]) => ({
      clientName,
      projects: projectList.sort((a, b) =>
        a.projectName.localeCompare(b.projectName, "pt-BR"),
      ),
    }))
    .sort((a, b) => a.clientName.localeCompare(b.clientName, "pt-BR"));

  const totals: ConsolidatedTotals = {
    approvedHours: totalApproved,
    pendingHours: totalPendingHours,
    expenseEntering: totalExpenseEntering,
    expensePending: totalExpensePending,
    ...(includeFinancials ? { totalBilled } : {}),
  };

  return { clients, totals, includeFinancials };
}

function emptyConsolidated(includeFinancials: boolean): ConsolidatedReport {
  return {
    clients: [],
    totals: {
      approvedHours: 0,
      pendingHours: 0,
      expenseEntering: 0,
      expensePending: 0,
      ...(includeFinancials ? { totalBilled: 0 } : {}),
    },
    includeFinancials,
  };
}

export interface ReportFilterOptions {
  clients: { id: string; name: string }[];
  projects: { id: string; name: string; clientId: string }[];
  consultants: { id: string; name: string }[];
}

/**
 * Distinct clients/projects/consultants the user may filter by, scoped exactly
 * like the report (a CONSULTANT only sees their own data, a PM only managed
 * projects). Drives the filter dropdowns.
 */
export async function getReportFilterOptions(
  user: AppUser,
): Promise<ReportFilterOptions> {
  const scope = await resolveReportScope(user);
  if (!scopeHasUniverse(scope)) {
    return { clients: [], projects: [], consultants: [] };
  }

  const projectWhere: Where = {};
  if (scope.managerUserId) projectWhere.managerUserId = scope.managerUserId;

  const consultantWhere: Where = {};
  if (scope.ownConsultantId) consultantWhere.id = scope.ownConsultantId;

  // A consultant restricted to own data should still only see projects they
  // have entries/expenses on, but a simple full list scoped by management is
  // enough for the dropdowns; the read functions enforce the real scope.
  const [projects, consultants] = await Promise.all([
    prisma.project.findMany({
      where: scope.managerUserId ? projectWhere : undefined,
      select: {
        id: true,
        name: true,
        clientId: true,
        client: { select: { id: true, name: true } },
      },
      orderBy: { name: "asc" },
    }),
    prisma.consultant.findMany({
      where: scope.ownConsultantId ? consultantWhere : undefined,
      select: { id: true, name: true },
      orderBy: { name: "asc" },
    }),
  ]);

  const clientMap = new Map<string, string>();
  for (const p of projects) clientMap.set(p.client.id, p.client.name);

  return {
    clients: [...clientMap.entries()]
      .map(([id, name]) => ({ id, name }))
      .sort((a, b) => a.name.localeCompare(b.name, "pt-BR")),
    projects: projects.map((p) => ({
      id: p.id,
      name: p.name,
      clientId: p.clientId,
    })),
    consultants: consultants.map((c) => ({ id: c.id, name: c.name })),
  };
}

/** Re-exports for the screen/CSV (labels live with their domain modules). */
export { expenseStatusLabels, isExpenseRejected };
