import { prisma, Prisma } from "@jumpflow/database";
import { isDevAuthEnabled } from "@/lib/auth/dev";
import type { AppUser } from "@/lib/auth/types";
import type { ApprovalItem } from "@/lib/mock-data/approvals";
import {
  activityLabels,
  deriveWeekStatus,
  isActivityType,
  type ActivityType,
  type TimeEntryRow,
  type TimeEntryStatus,
  type TimesheetWeek,
} from "@/lib/timesheet/types";
import {
  addDays,
  buildWeekDays,
  toIsoDate,
  weekLabel,
  weekStartOf,
} from "@/lib/timesheet/week";

/**
 * Read/query layer for the Horas module. Assumes a database is configured —
 * callers must guard with `isDatabaseConfigured()` first.
 */

type Db = Prisma.TransactionClient | typeof prisma;

/**
 * Resolve the `Consultant` linked to the current user.
 *
 * Constraint: in dev mode `getCurrentUser()` returns the synthetic id
 * "dev-user" (it never touches the database), while the seeded consultant is
 * linked to the REAL cuid of the same email. So we try `userId` first and,
 * ONLY under dev auth, fall back to the unique consultant email. In
 * production `Consultant.userId` is the operational gate: unlinking it must
 * revoke timesheet access, so no email fallback there.
 */
export async function getConsultantForUser(user: AppUser) {
  const byUserId = await prisma.consultant.findUnique({
    where: { userId: user.id },
  });
  if (byUserId) return byUserId;
  if (!isDevAuthEnabled()) return null;
  return prisma.consultant.findUnique({ where: { email: user.email } });
}

/**
 * Active allocation covering `date` for (consultant, project), or null.
 * The strict rule: no entry may exist without an ACTIVE allocation whose
 * period contains the entry date.
 */
export async function findActiveAllocation(
  db: Db,
  consultantId: string,
  projectId: string,
  date: Date,
) {
  return db.allocation.findFirst({
    where: {
      consultantId,
      projectId,
      status: "ACTIVE",
      startDate: { lte: date },
      OR: [{ endDate: null }, { endDate: { gte: date } }],
    },
  });
}

/**
 * Pure period-status derivation (docs/horas-persistencia.md section 4):
 * CLOSED never changes; REJECTED > DRAFT (or empty) > SUBMITTED > APPROVED.
 */
export function derivePeriodStatus(
  current: string,
  entryStatuses: string[],
): TimeEntryStatus {
  if (current === "CLOSED") return "CLOSED";
  if (entryStatuses.includes("REJECTED")) return "REJECTED";
  if (entryStatuses.length === 0 || entryStatuses.includes("DRAFT")) {
    return "DRAFT";
  }
  if (entryStatuses.includes("SUBMITTED")) return "SUBMITTED";
  return "APPROVED";
}

/** Recompute and persist a period's status from its entries. */
export async function recomputePeriodStatus(
  db: Db,
  periodId: string,
): Promise<void> {
  const period = await db.timesheetPeriod.findUnique({
    where: { id: periodId },
    include: { entries: { select: { status: true } } },
  });
  if (!period || period.status === "CLOSED") return;
  const next = derivePeriodStatus(
    period.status,
    period.entries.map((e) => e.status),
  );
  if (next !== period.status) {
    await db.timesheetPeriod.update({
      where: { id: periodId },
      data: { status: next },
    });
  }
}

function toActivity(value: string): ActivityType {
  // Entries are validated on write; tolerate legacy values on read.
  return isActivityType(value) ? value : "DEVELOPMENT";
}

/**
 * Display label for an activity. Unknown/legacy values (e.g. seed data with
 * free-form strings) are shown raw instead of being coerced to a wrong label —
 * the approver must decide on accurate information.
 */
function activityLabelFor(value: string): string {
  return isActivityType(value) ? activityLabels[value] : value;
}

/**
 * Load the consultant's week as the UI shape: one row per
 * (project, activity, status) with hours[7] Mon→Sun. Entries of the same
 * project+activity but different statuses become separate rows so a row's
 * status is always exact.
 */
export async function getWeekForConsultant(
  consultantId: string,
  weekStart: Date,
): Promise<TimesheetWeek> {
  const start = weekStartOf(weekStart);
  const end = addDays(start, 6);

  const [period, entries] = await Promise.all([
    prisma.timesheetPeriod.findUnique({
      where: {
        consultantId_startDate_endDate: {
          consultantId,
          startDate: start,
          endDate: end,
        },
      },
    }),
    prisma.timeEntry.findMany({
      where: { consultantId, date: { gte: start, lte: end } },
      // Narrow select: never pull project financial fields (billingHourlyRate,
      // budgetHours, costCenter) into the timesheet grid.
      include: {
        project: { select: { name: true, client: { select: { name: true } } } },
      },
      orderBy: { date: "asc" },
    }),
  ]);

  const rowsByKey = new Map<string, TimeEntryRow>();
  for (const entry of entries) {
    const key = `${entry.projectId}|${entry.activityType}|${entry.status}`;
    let row = rowsByKey.get(key);
    if (!row) {
      row = {
        id: key,
        projectId: entry.projectId,
        projectName: entry.project.name,
        clientName: entry.project.client.name,
        activity: toActivity(entry.activityType),
        billable: entry.billable,
        status: entry.status as TimeEntryStatus,
        hours: [0, 0, 0, 0, 0, 0, 0],
        entryIds: [null, null, null, null, null, null, null],
      };
      rowsByKey.set(key, row);
    }
    const dayIndex = Math.round(
      (entry.date.getTime() - start.getTime()) / 86_400_000,
    );
    if (dayIndex < 0 || dayIndex > 6) continue;
    row.hours[dayIndex] = Number(entry.hours);
    if (row.entryIds) row.entryIds[dayIndex] = entry.id;
    if (!row.description && entry.description) {
      row.description = entry.description;
    }
  }

  const rows = [...rowsByKey.values()].sort(
    (a, b) =>
      a.projectName.localeCompare(b.projectName, "pt-BR") ||
      a.activity.localeCompare(b.activity) ||
      a.status.localeCompare(b.status),
  );

  const week: TimesheetWeek = {
    label: weekLabel(start),
    startDate: toIsoDate(start),
    endDate: toIsoDate(end),
    status: "DRAFT",
    days: buildWeekDays(start),
    rows,
  };
  week.status = period
    ? (period.status as TimeEntryStatus)
    : deriveWeekStatus(week);
  return week;
}

export interface AllowedProject {
  id: string;
  name: string;
  clientName: string;
}

/**
 * Projects the consultant may log hours to in the given week: ACTIVE
 * allocations whose period intersects the week, on projects not CLOSED.
 */
export async function listAllowedProjects(
  consultantId: string,
  weekStart: Date,
): Promise<AllowedProject[]> {
  const start = weekStartOf(weekStart);
  const end = addDays(start, 6);

  const allocations = await prisma.allocation.findMany({
    where: {
      consultantId,
      status: "ACTIVE",
      startDate: { lte: end },
      OR: [{ endDate: null }, { endDate: { gte: start } }],
      project: { status: { not: "CLOSED" } },
    },
    // Narrow select: only the label fields, never project financials.
    select: {
      projectId: true,
      project: { select: { name: true, client: { select: { name: true } } } },
    },
  });

  const byProject = new Map<string, AllowedProject>();
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

export interface HoursApprovalScope {
  /**
   * Restrict to projects managed by this DB user id (PROJECT_MANAGER scope).
   * Omit for ADMIN/AREA_MANAGER (unrestricted).
   */
  managerUserId?: string;
}

const HISTORY_LIMIT = 50;

/**
 * Approval queue items for HOURS:
 * - pending: SUBMITTED entries grouped by (consultant, project, period) with
 *   summed hours and the oldest submittedAt;
 * - history: latest TIME_ENTRY approvals (manual and automatic).
 */
export async function listHoursApprovalItems(
  scope: HoursApprovalScope = {},
): Promise<ApprovalItem[]> {
  const projectScope = scope.managerUserId
    ? { project: { managerUserId: scope.managerUserId } }
    : {};

  const pendingEntries = await prisma.timeEntry.findMany({
    where: { status: "SUBMITTED", ...projectScope },
    include: {
      consultant: { select: { name: true } },
      // Narrow select: label + managerUserId only, never project financials.
      project: {
        select: {
          name: true,
          managerUserId: true,
          client: { select: { name: true } },
        },
      },
      period: { select: { id: true, startDate: true } },
    },
    orderBy: { submittedAt: "asc" },
  });

  interface PendingGroup {
    consultantName: string;
    projectName: string;
    clientName: string;
    periodStart: Date;
    entryIds: string[];
    hours: number;
    activities: Set<string>;
    submittedAt: Date | null;
  }

  const groups = new Map<string, PendingGroup>();
  for (const entry of pendingEntries) {
    const key = `${entry.consultantId}|${entry.projectId}|${entry.periodId}`;
    let group = groups.get(key);
    if (!group) {
      group = {
        consultantName: entry.consultant.name,
        projectName: entry.project.name,
        clientName: entry.project.client.name,
        periodStart: entry.period.startDate,
        entryIds: [],
        hours: 0,
        activities: new Set(),
        submittedAt: null,
      };
      groups.set(key, group);
    }
    group.entryIds.push(entry.id);
    group.hours += Number(entry.hours);
    group.activities.add(activityLabelFor(entry.activityType));
    if (
      entry.submittedAt &&
      (!group.submittedAt || entry.submittedAt < group.submittedAt)
    ) {
      group.submittedAt = entry.submittedAt;
    }
  }

  const pending: ApprovalItem[] = [...groups.entries()].map(([key, g]) => ({
    id: `db-pending-${key}`,
    type: "HOURS",
    source: "db",
    entryIds: g.entryIds,
    consultantName: g.consultantName,
    projectName: g.projectName,
    clientName: g.clientName,
    period: weekLabel(g.periodStart),
    hours: g.hours,
    activitySummary: [...g.activities].join(" · "),
    submittedAt: (g.submittedAt ?? new Date()).toISOString(),
    status: "PENDING",
    isAutomatic: false,
  }));

  // Approval.entityId has no FK to TimeEntry, so the PROJECT_MANAGER scope
  // must be resolved to entry ids BEFORE the take(HISTORY_LIMIT) window —
  // otherwise recent decisions on other managers' projects push the PM's own
  // history out of the window.
  let historyEntityFilter: { entityId: { in: string[] } } | undefined;
  if (scope.managerUserId) {
    const managedEntries = await prisma.timeEntry.findMany({
      where: { project: { managerUserId: scope.managerUserId } },
      select: { id: true },
    });
    historyEntityFilter = { entityId: { in: managedEntries.map((e) => e.id) } };
  }

  const approvals = await prisma.approval.findMany({
    where: { entityType: "TIME_ENTRY", ...historyEntityFilter },
    orderBy: { createdAt: "desc" },
    take: HISTORY_LIMIT,
  });

  const decidedEntryIds = [...new Set(approvals.map((a) => a.entityId))];
  const decidedEntries = decidedEntryIds.length
    ? await prisma.timeEntry.findMany({
        where: { id: { in: decidedEntryIds } },
        include: {
          consultant: { select: { name: true } },
          // Narrow select: label + managerUserId only (PM history filter).
          project: {
            select: {
              name: true,
              managerUserId: true,
              client: { select: { name: true } },
            },
          },
          period: { select: { startDate: true } },
        },
      })
    : [];
  const entriesById = new Map(decidedEntries.map((e) => [e.id, e]));

  const history: ApprovalItem[] = [];
  for (const approval of approvals) {
    const entry = entriesById.get(approval.entityId);
    if (!entry) continue;
    if (
      scope.managerUserId &&
      entry.project.managerUserId !== scope.managerUserId
    ) {
      continue;
    }
    history.push({
      id: `db-approval-${approval.id}`,
      type: "HOURS",
      source: "db",
      entryIds: [entry.id],
      consultantName: entry.consultant.name,
      projectName: entry.project.name,
      clientName: entry.project.client.name,
      period: weekLabel(entry.period.startDate),
      hours: Number(entry.hours),
      activitySummary: activityLabelFor(entry.activityType),
      submittedAt: (entry.submittedAt ?? approval.createdAt).toISOString(),
      status:
        approval.status === "REJECTED"
          ? "REJECTED"
          : approval.isAutomatic
            ? "AUTO_APPROVED"
            : "APPROVED",
      isAutomatic: approval.isAutomatic,
      ruleKey: approval.ruleKey ?? undefined,
      comment: approval.comment ?? undefined,
    });
  }

  return [...pending, ...history];
}
