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

/** Normalize a region: national holidays carry no region. */
function normalizeRegion(scope: HolidayScopeKey, region?: string | null): string | null {
  if (scope === "NATIONAL") return null;
  const trimmed = region?.trim();
  return trimmed ? trimmed : null;
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
 * Whether a holiday with the same (date, scope, region) already exists. This is
 * the safety net that replaces the old DB unique index (R1): in Postgres NULLs
 * are distinct, so national holidays (region NULL) slipped past a unique index.
 * `excludeId` lets an update ignore itself. Region is normalized first.
 */
export async function findDuplicateHoliday(input: {
  date: string;
  scope: HolidayScopeKey;
  region?: string | null;
  excludeId?: string;
}): Promise<boolean> {
  const region = normalizeRegion(input.scope, input.region);
  const existing = await prisma.holiday.findFirst({
    where: {
      date: toUtcDate(input.date),
      scope: input.scope,
      region,
      ...(input.excludeId ? { id: { not: input.excludeId } } : {}),
    },
    select: { id: true },
  });
  return existing !== null;
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

/** Delete a holiday. HolidayProject links cascade (onDelete: Cascade). */
export async function deleteHoliday(id: string): Promise<void> {
  await prisma.holiday.delete({ where: { id } });
}
