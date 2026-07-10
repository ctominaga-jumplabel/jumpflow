import { prisma, Prisma } from "@jumpflow/database";
import { isDevAuthEnabled } from "@/lib/auth/dev";
import type { AppUser } from "@/lib/auth/types";
import type { ApprovalItem } from "@/lib/mock-data/approvals";
import {
  activityLabelOf,
  deriveWeekStatus,
  type TimeEntryRow,
  type TimeEntryStatus,
  type TimesheetWeek,
} from "@/lib/timesheet/types";
import {
  TIMESHEET_DEFAULT_DIRECTION,
  TIMESHEET_DEFAULT_SORT,
  type ProjectStatusFilter,
  type TimesheetFilter,
} from "@/lib/timesheet/filters";
import type { HolidayLookup } from "@/lib/timesheet/holidays";
import {
  addDays,
  buildWeekDays,
  parseIsoDateUtc,
  startOfUtcDay,
  toIsoDate,
  weekLabel,
  weekStartOf,
} from "@/lib/timesheet/week";

/**
 * Read/query layer for the Horas module. Assumes a database is configured —
 * callers must guard with `isDatabaseConfigured()` first.
 */

type Db = Prisma.TransactionClient | typeof prisma;
const MAX_PERIOD_OVERVIEW_DAYS = 93;

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
 * Lookup PROJECT-AWARE de feriados no intervalo [start, end] (inclusivo), para o
 * aviso/confirmação ao apontar horas em feriado (Onda A-ext/3).
 *
 * Aplicabilidade (espelha `HolidayProject`): feriado SEM vínculo = GLOBAL (vale
 * para todos os projetos); feriado COM >=1 vínculo = vale só para os projetos
 * vinculados. O resultado separa `global` (date->nome) de `byProject`
 * (projectId->date->nome); a UI resolve por (projeto, data) via
 * `resolveProjectHoliday` / `resolveGlobalHoliday`.
 *
 * Semântica date-only: `Holiday.date` é `@db.Date` gravada à meia-noite UTC
 * (mesma convenção de `TimeEntry.date`). Comparamos SEMPRE por data-calendário
 * via `toIsoDate` (campos UTC), nunca por timestamp, para não errar o dia por
 * fuso. O filtro do intervalo normaliza os limites com `startOfUtcDay`.
 */
export async function getHolidayLookup(
  start: Date,
  end: Date,
): Promise<HolidayLookup> {
  const holidays = await prisma.holiday.findMany({
    where: {
      date: { gte: startOfUtcDay(start), lte: startOfUtcDay(end) },
    },
    select: {
      date: true,
      name: true,
      projects: { select: { projectId: true } },
    },
  });
  const global: Record<string, string> = {};
  const byProject: Record<string, Record<string, string>> = {};
  for (const holiday of holidays) {
    const iso = toIsoDate(holiday.date);
    if (holiday.projects.length === 0) {
      // Sem vínculo => global. Primeiro nome vence em caso de colisão de data.
      if (!(iso in global)) global[iso] = holiday.name;
    } else {
      for (const link of holiday.projects) {
        const map = (byProject[link.projectId] ??= {});
        if (!(iso in map)) map[iso] = holiday.name;
      }
    }
  }
  return { global, byProject };
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

/**
 * Activity code as stored, preserved verbatim on read. Entries are validated on
 * write (canonical catalog), but legacy/unknown values must NOT be coerced — the
 * UI renders them via `activityLabelOf`, and the approver must see what was
 * actually logged.
 */
function toActivity(value: string): string {
  return value;
}

/**
 * Display label for an activity (canonical -> legacy -> raw). Delegates to the
 * single source of truth in `lib/timesheet/types`.
 */
function activityLabelFor(value: string): string {
  return activityLabelOf(value);
}

/**
 * Build the extra `where` fragment from the operational filters (Rodada 4.2).
 * The filters only REDUCE the rows shown; they never touch the allocation rule.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function entryFilterWhere(filter: TimesheetFilter): Record<string, any> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const where: Record<string, any> = {};
  if (filter.status) where.status = filter.status;
  if (filter.activity) where.activityType = filter.activity;
  if (filter.billable !== undefined) where.billable = filter.billable;
  if (filter.projectId) where.projectId = filter.projectId;
  if (filter.clientId) {
    where.project = { ...(where.project ?? {}), clientId: filter.clientId };
  }
  if (filter.projectStatus) {
    where.project = { ...(where.project ?? {}), status: filter.projectStatus };
  }
  return where;
}

/** Sort key extractor for an aggregated row, by whitelisted sort field. */
function rowSortKey(row: TimeEntryRow, sort: string): string {
  switch (sort) {
    case "activity":
      return activityLabelOf(row.activity);
    case "status":
      return row.status;
    case "date": {
      // First weekday index with logged hours; rows with no hours sort last.
      const idx = row.hours.findIndex((h) => h > 0);
      return String(idx < 0 ? 99 : idx).padStart(2, "0");
    }
    case "project":
    default:
      return row.projectName;
  }
}

/**
 * Load the consultant's week as the UI shape: one row per
 * (project, activity, status) with hours[7] Mon→Sun. Entries of the same
 * project+activity but different statuses become separate rows so a row's
 * status is always exact.
 *
 * The optional `filter` (Rodada 4.2) reduces the entries server-side
 * (status/activity/billable/project + project status) and orders the aggregated
 * rows by the whitelisted `sort`/`direction`. With no filter the behavior is
 * identical to before.
 */
export async function getWeekForConsultant(
  consultantId: string,
  weekStart: Date,
  filter: TimesheetFilter = {},
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
      where: {
        consultantId,
        date: { gte: start, lte: end },
        ...entryFilterWhere(filter),
      },
      // Narrow select: never pull project financial fields (billingHourlyRate,
      // budgetHours, costCenter) into the timesheet grid.
      include: {
        project: { select: { name: true, client: { select: { name: true } } } },
        // Anexo opcional (melhoria #2): só o nome do arquivo para o rótulo/link
        // da grade. O arquivo nunca é servido aqui — só por URL assinada.
        attachment: { select: { fileName: true } },
      },
      orderBy: { date: "asc" },
    }),
  ]);

  const rowsByKey = new Map<string, TimeEntryRow>();
  for (const entry of entries) {
    // O fator de remuneração entra na chave: dois ON_CALL no mesmo
    // projeto/atividade/status mas com fatores diferentes (ex.: 0.33 e 0.50)
    // são linhas distintas — colapsá-los exibiria um único fator e corromperia
    // o "Equivalente" mostrado na grade.
    const key = `${entry.projectId}|${entry.activityType}|${entry.status}|${Number(
      entry.multiplier,
    )}`;
    let row = rowsByKey.get(key);
    if (!row) {
      row = {
        id: key,
        projectId: entry.projectId,
        projectName: entry.project.name,
        clientName: entry.project.client.name,
        activity: toActivity(entry.activityType),
        billable: entry.billable,
        multiplier: Number(entry.multiplier),
        status: entry.status as TimeEntryStatus,
        hours: [0, 0, 0, 0, 0, 0, 0],
        entryIds: [null, null, null, null, null, null, null],
        clock: [null, null, null, null, null, null, null],
        attachments: [null, null, null, null, null, null, null],
      };
      rowsByKey.set(key, row);
    }
    const dayIndex = Math.round(
      (entry.date.getTime() - start.getTime()) / 86_400_000,
    );
    if (dayIndex < 0 || dayIndex > 6) continue;
    row.hours[dayIndex] = Number(entry.hours);
    if (row.entryIds) row.entryIds[dayIndex] = entry.id;
    if (row.attachments) {
      row.attachments[dayIndex] = entry.attachment
        ? { fileName: entry.attachment.fileName }
        : null;
    }
    if (row.clock) {
      row.clock[dayIndex] = {
        startTime: entry.startTime,
        endTime: entry.endTime,
        breakStart: entry.breakStart,
        breakEnd: entry.breakEnd,
      };
    }
    if (!row.description && entry.description) {
      row.description = entry.description;
    }
  }

  const sort = filter.sort ?? TIMESHEET_DEFAULT_SORT;
  const direction = filter.direction ?? TIMESHEET_DEFAULT_DIRECTION;
  const factor = direction === "desc" ? -1 : 1;
  const rows = [...rowsByKey.values()].sort((a, b) => {
    const primary =
      rowSortKey(a, sort).localeCompare(rowSortKey(b, sort), "pt-BR") * factor;
    if (primary !== 0) return primary;
    // Stable secondary order keeps split rows deterministic regardless of sort.
    return (
      a.projectName.localeCompare(b.projectName, "pt-BR") ||
      activityLabelOf(a.activity).localeCompare(
        activityLabelOf(b.activity),
        "pt-BR",
      ) ||
      a.status.localeCompare(b.status)
    );
  });

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

export interface PeriodProjectTotal {
  projectId: string;
  projectName: string;
  clientName: string;
  totalHours: number;
}

export interface PeriodCalendarEntry {
  id: string;
  date: string;
  projectName: string;
  activityLabel: string;
  status: TimeEntryStatus;
  hours: number;
}

export interface PeriodCalendarDay {
  date: string;
  totalHours: number;
  statuses: TimeEntryStatus[];
  entries: PeriodCalendarEntry[];
  /**
   * Nome do feriado NACIONAL nesta data, quando houver (Onda A/3). Só para
   * sinalização no resumo do período; nunca bloqueia lançamento.
   */
  holidayName?: string;
}

export interface TimesheetPeriodOverview {
  startDate: string;
  endDate: string;
  totalHours: number;
  projectTotals: PeriodProjectTotal[];
  days: PeriodCalendarDay[];
}

export async function getPeriodForConsultant(
  consultantId: string,
  startDateIso: string,
  endDateIso: string,
  filter: TimesheetFilter = {},
): Promise<TimesheetPeriodOverview> {
  const parsedStart = parseIsoDateUtc(startDateIso);
  const parsedEnd = parseIsoDateUtc(endDateIso);
  const start = parsedStart ?? weekStartOf(new Date());
  const requestedEnd = parsedEnd && parsedEnd >= start ? parsedEnd : addDays(start, 6);
  const maxEnd = addDays(start, MAX_PERIOD_OVERVIEW_DAYS - 1);
  const end = requestedEnd > maxEnd ? maxEnd : requestedEnd;

  const [entries, holidays] = await Promise.all([
    prisma.timeEntry.findMany({
      where: {
        consultantId,
        date: { gte: start, lte: end },
        ...entryFilterWhere(filter),
      },
      include: {
        project: { select: { name: true, client: { select: { name: true } } } },
      },
      orderBy: { date: "asc" },
    }),
    // Mesmo intervalo do período já calculado. O resumo do período é
    // cross-projeto (agrega vários projetos por dia), então marcamos apenas
    // feriados GLOBAIS aqui; feriados específicos de projeto são sinalizados na
    // grade (project-aware), onde há a linha do projeto.
    getHolidayLookup(start, end),
  ]);

  const daysByDate = new Map<string, PeriodCalendarDay>();
  for (
    let cursor = start;
    cursor.getTime() <= end.getTime();
    cursor = addDays(cursor, 1)
  ) {
    const iso = toIsoDate(cursor);
    const holidayName = holidays.global[iso];
    daysByDate.set(iso, {
      date: iso,
      totalHours: 0,
      statuses: [],
      entries: [],
      ...(holidayName ? { holidayName } : {}),
    });
  }

  const projectTotals = new Map<string, PeriodProjectTotal>();
  for (const entry of entries) {
    const hours = Number(entry.hours);
    const date = toIsoDate(entry.date);
    const day = daysByDate.get(date);
    const status = entry.status as TimeEntryStatus;
    if (day) {
      day.totalHours += hours;
      if (!day.statuses.includes(status)) day.statuses.push(status);
      day.entries.push({
        id: entry.id,
        date,
        projectName: entry.project.name,
        activityLabel: activityLabelFor(entry.activityType),
        status,
        hours,
      });
    }
    const existing = projectTotals.get(entry.projectId);
    if (existing) {
      existing.totalHours += hours;
    } else if (hours > 0) {
      projectTotals.set(entry.projectId, {
        projectId: entry.projectId,
        projectName: entry.project.name,
        clientName: entry.project.client.name,
        totalHours: hours,
      });
    }
  }

  return {
    startDate: toIsoDate(start),
    endDate: toIsoDate(end),
    totalHours: entries.reduce((sum, entry) => sum + Number(entry.hours), 0),
    projectTotals: [...projectTotals.values()]
      .filter((item) => item.totalHours > 0)
      .sort((a, b) => a.projectName.localeCompare(b.projectName, "pt-BR")),
    days: [...daysByDate.values()],
  };
}

export interface AllowedProject {
  id: string;
  name: string;
  clientId: string;
  clientName: string;
}

export interface TimesheetDefaultOption extends AllowedProject {
  allocationId: string;
  defaultConfig: {
    activityType: string;
    hoursPerDay: number;
    weekdays: number[];
    billable: boolean;
    description: string;
    startTime: string | null;
    breakStart: string | null;
    breakEnd: string | null;
    endTime: string | null;
  } | null;
}

/**
 * Projects the consultant may log hours to in the given week: ACTIVE
 * allocations whose period intersects the week, on projects not CLOSED.
 *
 * When `projectStatus` is given (filter dropdown), the list is further narrowed
 * to that exact status; otherwise the default (any non-CLOSED) applies.
 */
export async function listAllowedProjects(
  consultantId: string,
  weekStart: Date,
  projectStatus?: ProjectStatusFilter,
): Promise<AllowedProject[]> {
  const start = weekStartOf(weekStart);
  const end = addDays(start, 6);

  const allocations = await prisma.allocation.findMany({
    where: {
      consultantId,
      status: "ACTIVE",
      startDate: { lte: end },
      OR: [{ endDate: null }, { endDate: { gte: start } }],
      project: projectStatus
        ? { status: projectStatus }
        : { status: { not: "CLOSED" } },
    },
    // Narrow select: only the label fields, never project financials.
    select: {
      projectId: true,
      project: {
        select: { name: true, client: { select: { id: true, name: true } } },
      },
    },
  });

  const byProject = new Map<string, AllowedProject>();
  for (const allocation of allocations) {
    byProject.set(allocation.projectId, {
      id: allocation.projectId,
      name: allocation.project.name,
      clientId: allocation.project.client.id,
      clientName: allocation.project.client.name,
    });
  }
  return [...byProject.values()].sort((a, b) =>
    a.name.localeCompare(b.name, "pt-BR"),
  );
}

/**
 * Active allocations eligible for a weekly default in the selected week.
 * Unlike listAllowedProjects, this intentionally keeps one row per allocation:
 * the default belongs to the allocation, not the project globally.
 */
export async function listTimesheetDefaultOptions(
  consultantId: string,
  weekStart: Date,
): Promise<TimesheetDefaultOption[]> {
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
    select: {
      id: true,
      projectId: true,
      project: {
        select: { name: true, client: { select: { id: true, name: true } } },
      },
      timesheetDefault: {
        select: {
          activityType: true,
          hoursPerDay: true,
          weekdays: true,
          billable: true,
          description: true,
          startTime: true,
          breakStart: true,
          breakEnd: true,
          endTime: true,
        },
      },
    },
    orderBy: { project: { name: "asc" } },
  });

  return allocations.map((allocation) => ({
    id: allocation.projectId,
    allocationId: allocation.id,
    name: allocation.project.name,
    clientId: allocation.project.client.id,
    clientName: allocation.project.client.name,
    defaultConfig: allocation.timesheetDefault
      ? {
          activityType: allocation.timesheetDefault.activityType,
          hoursPerDay: Number(allocation.timesheetDefault.hoursPerDay),
          weekdays: allocation.timesheetDefault.weekdays,
          billable: allocation.timesheetDefault.billable,
          description: allocation.timesheetDefault.description ?? "",
          startTime: allocation.timesheetDefault.startTime,
          breakStart: allocation.timesheetDefault.breakStart,
          breakEnd: allocation.timesheetDefault.breakEnd,
          endTime: allocation.timesheetDefault.endTime,
        }
      : null,
  }));
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
