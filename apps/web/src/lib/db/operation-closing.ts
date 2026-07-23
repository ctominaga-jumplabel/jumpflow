import { prisma } from "@jumpflow/database";
import { toIsoDate } from "@/lib/timesheet/week";
import { buildHoursWhere, type ReportScope } from "@/lib/db/reports";
import {
  resolveDetailRange,
  HOURS_DEFAULT_DIRECTION,
  HOURS_DEFAULT_SORT,
  DEFAULT_PAGE_SIZE,
  type HoursReportFilter,
  type HoursSortField,
} from "@/lib/reports/schemas";
import type { PaginationMeta } from "@/lib/reports/types";
import {
  classifyConsultantReadiness,
  isExceptionEntry,
  summarizeOverview,
  summarizeReadiness,
  type ConsultantReadiness,
  type OperationClosingDetail,
  type OperationClosingDetailView,
  type OperationClosingOverview,
  type OperationClosingRow,
  type OperationConsultantDetail,
  type OperationDetailRow,
  type OperationEntryDetail,
  type OperationFilterOptions,
  type OperationReadiness,
} from "@/lib/operations/closing";

/**
 * The operational screen shows ALL projects/consultants to anyone holding the
 * OPERACAO_FECHAMENTO permission (RBAC is the page/route's job), so the detail
 * query reuses the Hours report `where` builder under a BROAD scope with NO
 * financial columns and NO status restriction.
 */
const OPERATION_SCOPE: ReportScope = {
  broad: true,
  includeFinancials: false,
  financeHoursLimited: false,
};

/** Shared filters that narrow BOTH tabs (per-project closing + detail). */
export interface OperationClosingFilters {
  clientId?: string;
  projectId?: string;
  consultantId?: string;
  clientStatus?: string;
  projectStatus?: string;
}

/** Whitelisted detail sort → Prisma orderBy (mirrors hoursOrderBy in reports). */
function detailOrderBy(
  sort: HoursSortField,
  direction: "asc" | "desc",
): Record<string, unknown>[] {
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

/**
 * Latest Approval datetime (createdAt) per TimeEntry, as an ISO string. Mirrors
 * `loadLatestApprovalAt` in `lib/db/reports.ts` but kept local so this module
 * stays self-contained. Approvals are ordered newest-first so the first hit per
 * entity is the latest decision.
 */
async function loadDecidedAt(
  entryIds: string[],
): Promise<Map<string, string>> {
  const out = new Map<string, string>();
  if (entryIds.length === 0) return out;
  const approvals = await prisma.approval.findMany({
    where: { entityType: "TIME_ENTRY", entityId: { in: entryIds } },
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

/**
 * DB read layer for the Operational Closing (Fechamento Operacional para o DP).
 *
 * The heavy lifting (readiness classification, counters) lives in the pure
 * `lib/operations/closing.ts`; here we only fetch and shape data. All queries
 * are bulk (no N+1): one pass over the month's active allocations, time entries,
 * existing closings and the projects they touch.
 */

function monthBounds(month: number, year: number): { start: Date; end: Date } {
  const start = new Date(Date.UTC(year, month - 1, 1));
  const end = new Date(Date.UTC(year, month, 1));
  return { start, end };
}

interface ConsultantAccumulator {
  name: string;
  statuses: string[];
  hours: number;
  /** Count of the consultant's exception launches (see `isExceptionEntry`). */
  exceptions: number;
}

function ensureConsultant(
  map: Map<string, ConsultantAccumulator>,
  id: string,
  name: string,
): ConsultantAccumulator {
  const existing = map.get(id);
  if (existing) {
    // Keep the first non-empty name we saw (allocation and entries agree).
    if (!existing.name && name) existing.name = name;
    return existing;
  }
  const created: ConsultantAccumulator = {
    name,
    statuses: [],
    hours: 0,
    exceptions: 0,
  };
  map.set(id, created);
  return created;
}

/**
 * Build the readiness of a single project's month from the consultant
 * accumulator (allocated team unioned with whoever logged hours).
 */
function readinessFromAccumulator(
  consultants: Map<string, ConsultantAccumulator>,
): OperationReadiness {
  const rows: ConsultantReadiness[] = [];
  for (const [consultantId, acc] of consultants) {
    rows.push({
      consultantId,
      consultantName: acc.name || "Consultor",
      state: classifyConsultantReadiness(acc.statuses),
      hours: Math.round(acc.hours * 100) / 100,
    });
  }
  return summarizeReadiness(rows);
}

/**
 * Readiness for ONE project's month — used by the server actions to revalidate
 * `canClose` before writing (never trust the client) and to snapshot the team.
 */
export async function getOperationReadiness(
  projectId: string,
  month: number,
  year: number,
): Promise<OperationReadiness> {
  const { start, end } = monthBounds(month, year);
  const consultants = new Map<string, ConsultantAccumulator>();

  // Active allocations overlapping the month define the team that MUST finish.
  const allocations = await prisma.allocation.findMany({
    where: {
      projectId,
      status: "ACTIVE",
      startDate: { lt: end },
      OR: [{ endDate: null }, { endDate: { gte: start } }],
    },
    select: { consultantId: true, consultant: { select: { name: true } } },
  });
  for (const a of allocations) {
    ensureConsultant(consultants, a.consultantId, a.consultant?.name ?? "");
  }

  // Whoever logged hours in the month (covers ended/changed allocations too).
  const entries = await prisma.timeEntry.findMany({
    where: { projectId, date: { gte: start, lt: end } },
    select: {
      consultantId: true,
      status: true,
      hours: true,
      consultant: { select: { name: true } },
    },
  });
  for (const e of entries) {
    const acc = ensureConsultant(
      consultants,
      e.consultantId,
      e.consultant?.name ?? "",
    );
    acc.statuses.push(e.status);
    acc.hours += Number(e.hours ?? 0);
  }

  return readinessFromAccumulator(consultants);
}

/**
 * Overview for the dedicated monthly screen: every relevant project with its
 * readiness and operational closing status. Relevant = ACTIVE projects, plus
 * any project that logged hours or already has a closing record this month.
 *
 * The shared filters narrow which projects appear: `clientId`/`projectId`/
 * `clientStatus`/`projectStatus` push into the project query; `consultantId`
 * keeps only projects where that consultant is on the month's team (allocated
 * or logged). Readiness always reflects the WHOLE team (the closing is about the
 * project's month, not one consultant).
 */
export async function listOperationClosings(
  input: { month: number; year: number } & OperationClosingFilters,
): Promise<OperationClosingOverview> {
  const { month, year, clientId, projectId, consultantId, clientStatus, projectStatus } =
    input;
  const { start, end } = monthBounds(month, year);

  const [allocations, entries, closings] = await Promise.all([
    prisma.allocation.findMany({
      where: {
        status: "ACTIVE",
        startDate: { lt: end },
        OR: [{ endDate: null }, { endDate: { gte: start } }],
      },
      select: {
        projectId: true,
        consultantId: true,
        consultant: { select: { name: true } },
      },
    }),
    prisma.timeEntry.findMany({
      where: { date: { gte: start, lt: end } },
      select: {
        projectId: true,
        consultantId: true,
        status: true,
        hours: true,
        activityType: true,
        attachment: { select: { id: true } },
        consultant: { select: { name: true } },
      },
    }),
    prisma.operationClosing.findMany({
      where: { month, year },
      select: {
        id: true,
        projectId: true,
        status: true,
        closedAt: true,
        closedByUserId: true,
        notifiedAt: true,
      },
    }),
  ]);

  // projectId → (consultantId → accumulator)
  const byProject = new Map<string, Map<string, ConsultantAccumulator>>();
  const project = (id: string) => {
    let m = byProject.get(id);
    if (!m) {
      m = new Map();
      byProject.set(id, m);
    }
    return m;
  };
  for (const a of allocations) {
    ensureConsultant(project(a.projectId), a.consultantId, a.consultant?.name ?? "");
  }
  for (const e of entries) {
    const acc = ensureConsultant(
      project(e.projectId),
      e.consultantId,
      e.consultant?.name ?? "",
    );
    acc.statuses.push(e.status);
    acc.hours += Number(e.hours ?? 0);
    if (
      isExceptionEntry({
        activityType: e.activityType,
        hasAttachment: e.attachment != null,
      })
    ) {
      acc.exceptions += 1;
    }
  }

  const closingByProject = new Map(closings.map((c) => [c.projectId, c]));

  // Projects to show: ACTIVE projects ∪ those with hours/closings this month.
  const touchedIds = new Set<string>([
    ...byProject.keys(),
    ...closingByProject.keys(),
  ]);

  // Shared filters (both tabs). `consultantId` narrows to projects where that
  // consultant is on the month's team; otherwise keep ACTIVE ∪ touched.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const constraints: Record<string, any>[] = [];
  if (consultantId) {
    const consultantProjectIds = [...byProject.entries()]
      .filter(([, team]) => team.has(consultantId))
      .map(([id]) => id);
    constraints.push({ id: { in: consultantProjectIds } });
  } else {
    constraints.push({ OR: [{ status: "ACTIVE" }, { id: { in: [...touchedIds] } }] });
  }
  if (projectId) constraints.push({ id: projectId });
  if (clientId) constraints.push({ clientId });
  if (projectStatus) constraints.push({ status: projectStatus });
  if (clientStatus) constraints.push({ client: { status: clientStatus } });

  const projects = await prisma.project.findMany({
    where: { AND: constraints },
    select: { id: true, name: true, client: { select: { name: true } } },
    orderBy: [{ client: { name: "asc" } }, { name: "asc" }],
  });

  // Resolve closedBy names in one batch.
  const closerIds = closings
    .map((c) => c.closedByUserId)
    .filter((id): id is string => Boolean(id));
  const closers = closerIds.length
    ? await prisma.user.findMany({
        where: { id: { in: closerIds } },
        select: { id: true, name: true },
      })
    : [];
  const closerName = new Map(closers.map((u) => [u.id, u.name]));

  const rows: OperationClosingRow[] = projects.map((p) => {
    const closing = closingByProject.get(p.id) ?? null;
    const consultants = byProject.get(p.id) ?? new Map();
    const readiness = readinessFromAccumulator(consultants);
    let exceptionCount = 0;
    for (const acc of consultants.values()) exceptionCount += acc.exceptions;
    return {
      projectId: p.id,
      projectName: p.name,
      clientName: p.client?.name ?? "—",
      closingId: closing?.id ?? null,
      status: closing?.status === "CLOSED" ? "CLOSED" : "OPEN",
      closedAt: closing?.closedAt ? closing.closedAt.toISOString() : null,
      closedByName: closing?.closedByUserId
        ? (closerName.get(closing.closedByUserId) ?? null)
        : null,
      notifiedAt: closing?.notifiedAt ? closing.notifiedAt.toISOString() : null,
      readiness,
      exceptionCount,
    };
  });

  return summarizeOverview(month, year, rows);
}

/**
 * Day-by-day apuração of ONE project's month: every consultant who was
 * allocated or logged hours, with each launch's date, activity type, hours,
 * status, billable flag and whether it carries an attachment. Loaded on demand
 * by the "Apurar" action (not part of the overview, which stays aggregate-only).
 * Bulk queries (no N+1): the team from active allocations ∪ whoever logged.
 */
export async function getOperationClosingDetail(input: {
  projectId: string;
  month: number;
  year: number;
}): Promise<OperationClosingDetail | null> {
  const { projectId, month, year } = input;
  const { start, end } = monthBounds(month, year);

  const project = await prisma.project.findUnique({
    where: { id: projectId },
    select: { id: true, name: true, client: { select: { name: true } } },
  });
  if (!project) return null;

  // Team that must finish the month (active allocations overlapping it).
  const allocations = await prisma.allocation.findMany({
    where: {
      projectId,
      status: "ACTIVE",
      startDate: { lt: end },
      OR: [{ endDate: null }, { endDate: { gte: start } }],
    },
    select: { consultantId: true, consultant: { select: { name: true } } },
  });

  const entries = await prisma.timeEntry.findMany({
    where: { projectId, date: { gte: start, lt: end } },
    orderBy: [{ consultantId: "asc" }, { date: "asc" }],
    select: {
      id: true,
      consultantId: true,
      date: true,
      hours: true,
      status: true,
      activityType: true,
      billable: true,
      attachment: { select: { id: true } },
      consultant: { select: { name: true } },
    },
  });

  // consultantId → detail. Seed with the allocated team so a consultant with no
  // launches still appears (NO_ENTRIES is itself worth seeing in the apuração).
  const byConsultant = new Map<string, OperationConsultantDetail>();
  const ensure = (id: string, name: string): OperationConsultantDetail => {
    let d = byConsultant.get(id);
    if (!d) {
      d = {
        consultantId: id,
        consultantName: name || "Consultor",
        totalHours: 0,
        exceptionCount: 0,
        entries: [],
      };
      byConsultant.set(id, d);
    } else if (d.consultantName === "Consultor" && name) {
      d.consultantName = name;
    }
    return d;
  };
  for (const a of allocations) {
    ensure(a.consultantId, a.consultant?.name ?? "");
  }

  let totalExceptions = 0;
  for (const e of entries) {
    const detail = ensure(e.consultantId, e.consultant?.name ?? "");
    const hasAttachment = e.attachment != null;
    const isException = isExceptionEntry({
      activityType: e.activityType,
      hasAttachment,
    });
    const hours = Math.round(Number(e.hours ?? 0) * 100) / 100;
    const entry: OperationEntryDetail = {
      id: e.id,
      date: toIsoDate(e.date),
      activityType: e.activityType,
      hours,
      status: e.status,
      billable: e.billable,
      hasAttachment,
      isException,
    };
    detail.entries.push(entry);
    detail.totalHours = Math.round((detail.totalHours + hours) * 100) / 100;
    if (isException) {
      detail.exceptionCount += 1;
      totalExceptions += 1;
    }
  }

  const consultants = [...byConsultant.values()].sort((a, b) =>
    a.consultantName.localeCompare(b.consultantName, "pt-BR"),
  );

  return {
    projectId: project.id,
    projectName: project.name,
    clientName: project.client?.name ?? "—",
    month,
    year,
    consultants,
    totalExceptions,
  };
}

const round2 = (n: number): number => Math.round(n * 100) / 100;

/** Cap for the "export all" path (mirrors reports' EXPORT_ALL_LIMIT). */
const DETAIL_EXPORT_LIMIT = 50_000;

const DETAIL_SELECT = {
  id: true,
  consultantId: true,
  date: true,
  hours: true,
  status: true,
  activityType: true,
  billable: true,
  attachment: { select: { id: true } },
  consultant: { select: { name: true } },
  project: { select: { name: true, client: { select: { name: true } } } },
} as const;

// Raw row shape from DETAIL_SELECT (Prisma infers structurally); kept loose.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type DetailRaw = any;

/** Build the shared detail `where` from the report-style filter + period. */
function detailWhere(
  filter: HoursReportFilter,
  now: Date,
): Record<string, unknown> {
  const range = resolveDetailRange(filter, now);
  return buildHoursWhere(OPERATION_SCOPE, { ...filter, ...range });
}

/** Map raw rows to DTOs, resolving the decision datetime in one batched read. */
async function mapDetailRows(
  raw: DetailRaw[],
): Promise<OperationDetailRow[]> {
  const decidedAt = await loadDecidedAt(raw.map((e: DetailRaw) => e.id));
  return raw.map((e: DetailRaw) => {
    const hasAttachment = e.attachment != null;
    return {
      id: e.id,
      date: toIsoDate(e.date),
      consultantId: e.consultantId,
      consultantName: e.consultant?.name ?? "Consultor",
      clientName: e.project?.client?.name ?? "—",
      projectName: e.project?.name ?? "—",
      activityType: e.activityType,
      hours: round2(Number(e.hours ?? 0)),
      billable: e.billable,
      status: e.status,
      hasAttachment,
      decidedAt: decidedAt.get(e.id) ?? null,
      isException: isExceptionEntry({
        activityType: e.activityType,
        hasAttachment,
      }),
    };
  });
}

/**
 * Flat, consultant-centric detail for the "Detalhamento por consultor" tab:
 * every time entry matching the shared report-style filters (period/date range,
 * cliente, projeto, consultor, status, atividade, faturável, status de
 * cliente/projeto/consultor), ordered and PAGINATED. Reuses the Hours report
 * `where`/range builders under a BROAD, non-financial scope — the SAME filter
 * contract as Relatórios, so this screen and its Excel always agree.
 *
 * Totals (`totalHours`/`totalExceptions`) reflect the WHOLE filtered set, not
 * just the page. Same RBAC contract as the overview (gated by the page/route via
 * `OPERACAO_FECHAMENTO` view). No N+1: page read + a totals read + one batched
 * Approval read for the decision dates of the page rows.
 */
export async function listOperationClosingDetail(
  filter: HoursReportFilter,
  now: Date = new Date(),
): Promise<OperationClosingDetailView> {
  const where = detailWhere(filter, now);

  const sort = filter.sort ?? HOURS_DEFAULT_SORT;
  const direction = filter.direction ?? HOURS_DEFAULT_DIRECTION;
  const pageSize = filter.pageSize ?? DEFAULT_PAGE_SIZE;
  const page = Math.max(1, filter.page ?? 1);

  const total = await prisma.timeEntry.count({ where });

  const pageRows = await prisma.timeEntry.findMany({
    where,
    orderBy: detailOrderBy(sort, direction),
    skip: (page - 1) * pageSize,
    take: pageSize,
    select: DETAIL_SELECT,
  });

  // Totals over the WHOLE filtered set (hours + exceptions), not just the page.
  const totalsRaw = await prisma.timeEntry.findMany({
    where,
    select: {
      hours: true,
      activityType: true,
      attachment: { select: { id: true } },
    },
    take: DETAIL_EXPORT_LIMIT,
  });
  let totalHours = 0;
  let totalExceptions = 0;
  for (const e of totalsRaw) {
    totalHours = round2(totalHours + Number(e.hours ?? 0));
    if (
      isExceptionEntry({
        activityType: e.activityType,
        hasAttachment: e.attachment != null,
      })
    ) {
      totalExceptions += 1;
    }
  }

  const rows = await mapDetailRows(pageRows);

  const pagination: PaginationMeta = {
    total,
    page,
    pageSize,
    totalPages: Math.max(1, Math.ceil(total / pageSize)),
  };

  return { rows, pagination, totalHours, totalExceptions };
}

/**
 * ALL detail rows matching the filter (no pagination), for the `.xlsx` export.
 * Same filter contract as {@link listOperationClosingDetail}; capped at
 * {@link DETAIL_EXPORT_LIMIT}. Sorted the same way the screen is.
 */
export async function listOperationDetailRows(
  filter: HoursReportFilter,
  now: Date = new Date(),
): Promise<OperationDetailRow[]> {
  const where = detailWhere(filter, now);
  const sort = filter.sort ?? HOURS_DEFAULT_SORT;
  const direction = filter.direction ?? HOURS_DEFAULT_DIRECTION;
  const raw = await prisma.timeEntry.findMany({
    where,
    orderBy: detailOrderBy(sort, direction),
    take: DETAIL_EXPORT_LIMIT,
    select: DETAIL_SELECT,
  });
  return mapDetailRows(raw);
}

/**
 * Clients/projects/consultants that feed the shared filter dropdowns on the
 * Fechamento Operacional screen. The screen shows ALL of them (RBAC is the
 * page's job), so unlike `getReportFilterOptions` this is not scoped to a
 * report universe.
 */
export async function getOperationFilterOptions(): Promise<OperationFilterOptions> {
  const [projects, consultants] = await Promise.all([
    prisma.project.findMany({
      select: {
        id: true,
        name: true,
        clientId: true,
        client: { select: { id: true, name: true } },
      },
      orderBy: { name: "asc" },
    }),
    prisma.consultant.findMany({
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
    projects: projects.map((p) => ({ id: p.id, name: p.name, clientId: p.clientId })),
    consultants: consultants.map((c) => ({ id: c.id, name: c.name })),
  };
}
