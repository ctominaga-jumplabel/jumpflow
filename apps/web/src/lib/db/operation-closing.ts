import { prisma } from "@jumpflow/database";
import { toIsoDate } from "@/lib/timesheet/week";
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
  type OperationDetailConsultantOption,
  type OperationDetailRow,
  type OperationEntryDetail,
  type OperationReadiness,
} from "@/lib/operations/closing";

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
 */
export async function listOperationClosings(input: {
  month: number;
  year: number;
}): Promise<OperationClosingOverview> {
  const { month, year } = input;
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
  const projects = await prisma.project.findMany({
    where: {
      OR: [{ status: "ACTIVE" }, { id: { in: [...touchedIds] } }],
    },
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

/**
 * Flat, consultant-centric detail of the month for the "Detalhamento por
 * consultor" tab: every time entry across ALL projects in the month, with the
 * columns the DP asked for (date, consultant, client/project, activity, hours,
 * billable, status and the decision datetime). Optionally narrowed to a single
 * consultant; the consultant option list is always built from the UNFILTERED
 * set so selecting one never collapses the dropdown.
 *
 * Same RBAC contract as the overview (gated by the page/route via
 * `OPERACAO_FECHAMENTO` view). Bulk queries only (no N+1): one pass over the
 * month's entries plus one batched Approval read for the decision dates.
 */
export async function listOperationClosingDetail(input: {
  month: number;
  year: number;
  consultantId?: string;
}): Promise<OperationClosingDetailView> {
  const { month, year, consultantId } = input;
  const { start, end } = monthBounds(month, year);

  const entries = await prisma.timeEntry.findMany({
    where: { date: { gte: start, lt: end } },
    orderBy: [{ date: "asc" }, { consultantId: "asc" }],
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
      project: {
        select: { name: true, client: { select: { name: true } } },
      },
    },
  });

  // Consultant options come from the full (unfiltered) month so the filter never
  // hides the consultant you just picked.
  const optionMap = new Map<string, string>();
  for (const e of entries) {
    if (!optionMap.has(e.consultantId)) {
      optionMap.set(e.consultantId, e.consultant?.name ?? "Consultor");
    }
  }
  const consultantOptions: OperationDetailConsultantOption[] = [
    ...optionMap.entries(),
  ]
    .map(([id, name]) => ({ id, name }))
    .sort((a, b) => a.name.localeCompare(b.name, "pt-BR"));

  const filtered = consultantId
    ? entries.filter((e) => e.consultantId === consultantId)
    : entries;

  const decidedAt = await loadDecidedAt(filtered.map((e) => e.id));

  let totalHours = 0;
  let totalExceptions = 0;
  const rows: OperationDetailRow[] = filtered.map((e) => {
    const hasAttachment = e.attachment != null;
    const isException = isExceptionEntry({
      activityType: e.activityType,
      hasAttachment,
    });
    const hours = round2(Number(e.hours ?? 0));
    totalHours = round2(totalHours + hours);
    if (isException) totalExceptions += 1;
    return {
      id: e.id,
      date: toIsoDate(e.date),
      consultantId: e.consultantId,
      consultantName: e.consultant?.name ?? "Consultor",
      clientName: e.project?.client?.name ?? "—",
      projectName: e.project?.name ?? "—",
      activityType: e.activityType,
      hours,
      billable: e.billable,
      status: e.status,
      hasAttachment,
      decidedAt: decidedAt.get(e.id) ?? null,
      isException,
    };
  });

  return {
    month,
    year,
    rows,
    consultantOptions,
    totalHours,
    totalExceptions,
  };
}
