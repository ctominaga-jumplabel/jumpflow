import { prisma } from "@jumpflow/database";
import {
  classifyConsultantReadiness,
  summarizeOverview,
  summarizeReadiness,
  type ConsultantReadiness,
  type OperationClosingOverview,
  type OperationClosingRow,
  type OperationReadiness,
} from "@/lib/operations/closing";

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
  const created: ConsultantAccumulator = { name, statuses: [], hours: 0 };
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
    const readiness = readinessFromAccumulator(byProject.get(p.id) ?? new Map());
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
    };
  });

  return summarizeOverview(month, year, rows);
}
