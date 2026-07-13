/**
 * Data layer for the holidays calendar (admin CRUD at /app/admin/feriados).
 *
 * A Holiday drives the "feriado próximo" notification and the "apontou horas em
 * feriado" warning (Onda A). Applicability is by project (Onda A-ext): a holiday
 * WITHOUT any HolidayProject link is GLOBAL (applies to every project — the case
 * of national holidays); WITH >=1 link it applies ONLY to the linked projects
 * (a client day off, a regional holiday).
 *
 * Reads/writes are thin here; authorization, Zod validation, the duplicate guard
 * and audit live in the server actions. `date` is a pure date (@db.Date) stored
 * at UTC midnight and surfaced as an ISO `yyyy-mm-dd` string.
 */
import { prisma } from "@jumpflow/database";

export type HolidayScopeKey = "NATIONAL" | "STATE" | "CITY";

export interface HolidayProjectView {
  id: string;
  name: string;
}

export interface HolidayView {
  id: string;
  /** ISO `yyyy-mm-dd` (date-only). */
  date: string;
  name: string;
  scope: HolidayScopeKey;
  region: string | null;
  year: number;
  /** Linked projects. Empty array => GLOBAL (applies to every project). */
  projects: HolidayProjectView[];
}

/** Parse an ISO `yyyy-mm-dd` string into a UTC-midnight Date (date-only). */
function toUtcDate(iso: string): Date {
  return new Date(`${iso}T00:00:00.000Z`);
}

/** Format a stored @db.Date back into an ISO `yyyy-mm-dd` string. */
function fromDbDate(value: Date): string {
  return value.toISOString().slice(0, 10);
}

/**
 * Normalize a region: national holidays carry no region. For STATE/CITY the
 * value is trimmed AND upper-cased so "sp" / " SP " never escape the duplicate
 * check as distinct regions (N4).
 */
export function normalizeRegion(
  scope: HolidayScopeKey,
  region?: string | null,
): string | null {
  if (scope === "NATIONAL") return null;
  const trimmed = region?.trim().toUpperCase();
  return trimmed ? trimmed : null;
}

/** Outcome of the project-aware duplicate check. */
export interface HolidayDuplicate {
  duplicate: boolean;
  /** For a project conflict, the name of the shared project (pt-br message). */
  conflictProjectName?: string;
}

/**
 * Pure, project-aware duplicate rule (R1 fix). Given the OTHER holidays that
 * already share the same (date, scope, region) and the desired set of linked
 * projects, decide whether the new/edited holiday collides.
 *
 * - GLOBAL (no desired projects): collides only with another GLOBAL holiday on
 *   the same key. Two distinct global holidays on the same day are a duplicate.
 * - PROJECT-scoped: collides only if some candidate shares at least one linked
 *   project (same project booked twice that day). Disjoint project sets are
 *   allowed — e.g. "Folga Cliente A"→X and "Folga Cliente B"→Y on the same date.
 *
 * A global candidate never conflicts with a project-scoped request (and vice
 * versa) because they share no project id; that overlap is legitimate.
 * Pure (no I/O), so it is unit-testable without a database.
 */
export function detectHolidayDuplicate(
  candidates: ReadonlyArray<{ projects: ReadonlyArray<{ id: string; name: string }> }>,
  desiredProjectIds: readonly string[],
): HolidayDuplicate {
  const desired = new Set(desiredProjectIds);
  if (desired.size === 0) {
    // New/edited holiday is GLOBAL: only another GLOBAL holiday is a duplicate.
    return { duplicate: candidates.some((c) => c.projects.length === 0) };
  }
  for (const candidate of candidates) {
    const shared = candidate.projects.find((p) => desired.has(p.id));
    if (shared) return { duplicate: true, conflictProjectName: shared.name };
  }
  return { duplicate: false };
}

/** List holidays ordered by date, optionally filtered by year, with linked projects. */
export async function listHolidays(year?: number): Promise<HolidayView[]> {
  const holidays = await prisma.holiday.findMany({
    where: typeof year === "number" ? { year } : undefined,
    orderBy: [{ date: "asc" }, { name: "asc" }],
    include: {
      projects: {
        include: { project: { select: { id: true, name: true } } },
        orderBy: { createdAt: "asc" },
      },
    },
  });
  return holidays.map((h) => ({
    id: h.id,
    date: fromDbDate(h.date),
    name: h.name,
    scope: h.scope as HolidayScopeKey,
    region: h.region,
    year: h.year,
    projects: h.projects.map((link) => ({
      id: link.project.id,
      name: link.project.name,
    })),
  }));
}

/** Distinct years that already have holidays, newest first — feeds the filter. */
export async function listHolidayYears(): Promise<number[]> {
  const rows = await prisma.holiday.findMany({
    distinct: ["year"],
    select: { year: true },
    orderBy: { year: "desc" },
  });
  return rows.map((r) => r.year);
}

/** Active projects for the applicability multi-select. */
export async function listProjectsForHolidays(): Promise<HolidayProjectView[]> {
  return prisma.project.findMany({
    where: { status: { in: ["ACTIVE", "PROPOSAL", "PAUSED"] } },
    select: { id: true, name: true },
    orderBy: { name: "asc" },
  });
}

/**
 * Project-aware duplicate check (R1 fix). This is the safety net that replaces
 * the old DB unique index: in Postgres NULLs are distinct, so national holidays
 * (region NULL) slipped past a unique index. It fetches every OTHER holiday on
 * the same (date, scope, normalized region) and delegates the decision to the
 * pure {@link detectHolidayDuplicate}. `excludeId` lets an update ignore itself.
 */
export async function findDuplicateHoliday(input: {
  date: string;
  scope: HolidayScopeKey;
  region?: string | null;
  projectIds: string[];
  excludeId?: string;
}): Promise<HolidayDuplicate> {
  const region = normalizeRegion(input.scope, input.region);
  const candidates = await prisma.holiday.findMany({
    where: {
      date: toUtcDate(input.date),
      scope: input.scope,
      region,
      ...(input.excludeId ? { id: { not: input.excludeId } } : {}),
    },
    select: {
      id: true,
      projects: { select: { project: { select: { id: true, name: true } } } },
    },
  });
  const normalized = candidates.map((c) => ({
    projects: c.projects.map((link) => ({
      id: link.project.id,
      name: link.project.name,
    })),
  }));
  return detectHolidayDuplicate(normalized, [...new Set(input.projectIds)]);
}

export interface HolidayWriteInput {
  date: string;
  name: string;
  scope: HolidayScopeKey;
  region?: string | null;
  /** Selected project ids; empty => GLOBAL. */
  projectIds: string[];
}

/**
 * Create a holiday and sync its project links in a single transaction. `year`
 * is derived from the date. Empty `projectIds` leaves the holiday GLOBAL.
 */
export async function createHoliday(
  input: HolidayWriteInput,
): Promise<{ id: string }> {
  const date = toUtcDate(input.date);
  const region = normalizeRegion(input.scope, input.region);
  const year = Number(input.date.slice(0, 4));
  const uniqueProjectIds = [...new Set(input.projectIds)];

  return prisma.$transaction(async (tx) => {
    const created = await tx.holiday.create({
      data: { date, name: input.name.trim(), scope: input.scope, region, year },
      select: { id: true },
    });
    if (uniqueProjectIds.length > 0) {
      await tx.holidayProject.createMany({
        data: uniqueProjectIds.map((projectId) => ({
          holidayId: created.id,
          projectId,
        })),
        skipDuplicates: true,
      });
    }
    return created;
  });
}

/**
 * Update a holiday and re-sync its project links (create/remove to match the
 * selection) in a single transaction. `year` is re-derived from the date.
 */
export async function updateHoliday(
  id: string,
  input: HolidayWriteInput,
): Promise<{ id: string }> {
  const date = toUtcDate(input.date);
  const region = normalizeRegion(input.scope, input.region);
  const year = Number(input.date.slice(0, 4));
  const desired = new Set(input.projectIds);

  return prisma.$transaction(async (tx) => {
    await tx.holiday.update({
      where: { id },
      data: { date, name: input.name.trim(), scope: input.scope, region, year },
    });

    const current = await tx.holidayProject.findMany({
      where: { holidayId: id },
      select: { projectId: true },
    });
    const currentSet = new Set(current.map((c) => c.projectId));

    const toRemove = [...currentSet].filter((pid) => !desired.has(pid));
    const toAdd = [...desired].filter((pid) => !currentSet.has(pid));

    if (toRemove.length > 0) {
      await tx.holidayProject.deleteMany({
        where: { holidayId: id, projectId: { in: toRemove } },
      });
    }
    if (toAdd.length > 0) {
      await tx.holidayProject.createMany({
        data: toAdd.map((projectId) => ({ holidayId: id, projectId })),
        skipDuplicates: true,
      });
    }
    return { id };
  });
}

/** Fetch a single holiday view by id (used to snapshot `before` on delete). */
export async function getHolidayById(id: string): Promise<HolidayView | null> {
  const h = await prisma.holiday.findUnique({
    where: { id },
    include: {
      projects: {
        include: { project: { select: { id: true, name: true } } },
        orderBy: { createdAt: "asc" },
      },
    },
  });
  if (!h) return null;
  return {
    id: h.id,
    date: fromDbDate(h.date),
    name: h.name,
    scope: h.scope as HolidayScopeKey,
    region: h.region,
    year: h.year,
    projects: h.projects.map((link) => ({
      id: link.project.id,
      name: link.project.name,
    })),
  };
}

/** Delete a holiday. HolidayProject links cascade (onDelete: Cascade). */
export async function deleteHoliday(id: string): Promise<void> {
  await prisma.holiday.delete({ where: { id } });
}
