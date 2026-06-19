import { z } from "zod";
import { ACTIVITY_TYPES } from "./types";
import { parseIsoDateUtc } from "./week";

/**
 * Filters for the `/app/horas` weekly grid (Rodada 4.2,
 * docs/horas-operacional-filtros.md section 3). The query string is the source
 * of truth (server-driven in db mode), so all params are optional strings
 * derived from `searchParams`. `ALL`/blank are treated as absent, mirroring
 * `lib/reports/schemas.ts`.
 *
 * The filters only REDUCE what the consultant sees on the week. They never
 * affect the allocation rule that governs create/edit/submit/copy — that stays
 * enforced by the server actions.
 */

/** Treat `""`/`undefined`/`null`/`"ALL"` as absent before validating. */
function blankToUndefined(value: unknown): unknown {
  if (value === null) return undefined;
  if (typeof value !== "string") return value;
  const trimmed = value.trim();
  if (trimmed.length === 0 || trimmed === "ALL") return undefined;
  return trimmed;
}

/** `Project.status` (paridade com o legado). */
const projectStatusEnum = z.enum(["PROPOSAL", "ACTIVE", "PAUSED", "CLOSED"]);
export type ProjectStatusFilter = z.infer<typeof projectStatusEnum>;

/** `TimeEntry.status`. */
const statusEnum = z.enum([
  "DRAFT",
  "SUBMITTED",
  "APPROVED",
  "REJECTED",
  "CLOSED",
]);

/** Canonical activity catalog. */
const activityEnum = z.enum(ACTIVITY_TYPES);

/**
 * Sort whitelist for the aggregated rows. The raw value never reaches a sort
 * comparator as an arbitrary key — an unknown value falls back to the default.
 */
export const TIMESHEET_SORT_FIELDS = [
  "project",
  "activity",
  "status",
  "date",
] as const;
export type TimesheetSortField = (typeof TIMESHEET_SORT_FIELDS)[number];
export const TIMESHEET_DEFAULT_SORT: TimesheetSortField = "project";
export const TIMESHEET_DEFAULT_DIRECTION: "asc" | "desc" = "asc";

const directionEnum = z.enum(["asc", "desc"]);
const isoDateFilterSchema = z.preprocess(
  blankToUndefined,
  z.string().refine((value) => parseIsoDateUtc(value) !== null).optional(),
);

/**
 * Cobrança/faturável (`TimeEntry.billable`). `"true"` -> true, `"false"` ->
 * false, blank/`ALL`/absent -> undefined (all). An unexpected value falls
 * through to the boolean validator and fails (rejected by the schema).
 */
const billableSchema = z.preprocess((value) => {
  const v = blankToUndefined(value);
  if (v === undefined) return undefined;
  if (v === "true" || v === true) return true;
  if (v === "false" || v === false) return false;
  return v;
}, z.boolean().optional());

export const timesheetFilterSchema = z.object({
  projectStatus: z.preprocess(blankToUndefined, projectStatusEnum.optional()),
  clientId: z.preprocess(blankToUndefined, z.string().min(1).optional()),
  projectId: z.preprocess(blankToUndefined, z.string().min(1).optional()),
  activity: z.preprocess(blankToUndefined, activityEnum.optional()),
  status: z.preprocess(blankToUndefined, statusEnum.optional()),
  startDate: isoDateFilterSchema,
  endDate: isoDateFilterSchema,
  billable: billableSchema,
  sort: z.preprocess(blankToUndefined, z.enum(TIMESHEET_SORT_FIELDS).optional()),
  direction: z.preprocess(blankToUndefined, directionEnum.optional()),
});

export type TimesheetFilter = z.infer<typeof timesheetFilterSchema>;

/**
 * Parse raw search params into a TimesheetFilter with a SAFE fallback: an
 * invalid value never throws on the page — it is dropped and the defaults take
 * over. (Sensitive routes/actions should call `timesheetFilterSchema.parse`
 * directly to reject malformed input.)
 */
export function parseTimesheetFilter(
  raw: Record<string, string | string[] | undefined>,
): TimesheetFilter {
  const pick = (key: string): string | undefined => {
    const value = raw[key];
    return Array.isArray(value) ? value[0] : value;
  };
  const result = timesheetFilterSchema.safeParse({
    projectStatus: pick("projectStatus"),
    clientId: pick("clientId"),
    projectId: pick("projectId"),
    activity: pick("activity"),
    status: pick("status"),
    startDate: pick("inicio"),
    endDate: pick("fim"),
    billable: pick("billable"),
    sort: pick("sort"),
    direction: pick("direction"),
  });
  return result.success ? result.data : {};
}

/** Whether any reducing filter is active (drives the "active filters" hint). */
export function hasActiveTimesheetFilter(filter: TimesheetFilter): boolean {
  return Boolean(
    filter.projectStatus ||
      filter.clientId ||
      filter.projectId ||
      filter.activity ||
      filter.status ||
      filter.startDate ||
      filter.endDate ||
      filter.billable !== undefined,
  );
}
