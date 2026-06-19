import { z } from "zod";
import { parseIsoDateUtc } from "@/lib/timesheet/week";
import { ACTIVITY_TYPES } from "@/lib/timesheet/types";
import { EXPENSE_STATUSES } from "@/lib/expenses/types";

/**
 * Shared Zod schemas for the Relatorios module (docs/relatorios-fechamento.md
 * section 4). Imported by the page and by the CSV route handlers — the SAME
 * filter contract drives the screen and the export, so a CSV can never query
 * more than the screen shows.
 *
 * All params are optional, derived from `searchParams` (strings). `ALL` is
 * treated as absent. Ranges are inclusive (`from <= date <= to`).
 */

/** Treat `""`/`undefined`/`"ALL"` as absent before validating. */
function blankToUndefined(value: unknown): unknown {
  if (value === null) return undefined;
  if (typeof value !== "string") return value;
  const trimmed = value.trim();
  if (trimmed.length === 0 || trimmed === "ALL") return undefined;
  return trimmed;
}

const isoDateSchema = z.preprocess(
  blankToUndefined,
  z
    .string()
    .refine((value) => parseIsoDateUtc(value) !== null, {
      message: "Data inválida (use o formato aaaa-mm-dd).",
    })
    .optional(),
);

/**
 * Entity id filter. The validation database uses readable ids (e.g.
 * "seed-consultant-dev"), so we only require a non-empty string and let the
 * query resolve existence — mirrors `lib/expenses/schemas.ts`.
 */
const idFilterSchema = z.preprocess(
  blankToUndefined,
  z.string().min(1).optional(),
);

const monthSchema = z.preprocess(
  blankToUndefined,
  z
    .string()
    .regex(/^\d{4}-(0[1-9]|1[0-2])$/, {
      message: "Mês inválido (use o formato aaaa-mm).",
    })
    .optional(),
);

/** `from <= to` when both are present. */
function refineDateRange(
  value: { from?: string; to?: string },
  ctx: z.RefinementCtx,
): void {
  if (value.from && value.to && value.to < value.from) {
    ctx.addIssue({
      code: "custom",
      path: ["to"],
      message: "A data final deve ser maior ou igual à inicial.",
    });
  }
}

const hoursStatusEnum = z.enum([
  "DRAFT",
  "SUBMITTED",
  "APPROVED",
  "REJECTED",
  "CLOSED",
]);

const activityEnum = z.enum(ACTIVITY_TYPES);

/* --------------------------------------------------------------------------
 * Rodada 4.1 — paridade de filtros do portal antigo (campos já existentes).
 * Todos os filtros abaixo usam colunas que já existem no schema, sem migration.
 * ------------------------------------------------------------------------ */

/** `Client.status` (paridade com `statusClientes` do legado). */
const clientStatusEnum = z.enum(["ACTIVE", "INACTIVE"]);
/** `Project.status` (paridade com `statusProjetos`). */
const projectStatusEnum = z.enum(["PROPOSAL", "ACTIVE", "PAUSED", "CLOSED"]);
/** `Consultant.status` (paridade com `statusUsuarios`). */
const consultantStatusEnum = z.enum(["ACTIVE", "INACTIVE", "ON_LEAVE"]);

/**
 * Cobrança/faturável (`TimeEntry.billable`), paridade com `cobranca` do legado.
 * `"true"` -> true, `"false"` -> false, vazio/`ALL`/ausente -> undefined.
 */
const billableSchema = z.preprocess((value) => {
  const v = blankToUndefined(value);
  if (v === undefined) return undefined;
  if (v === "true" || v === true) return true;
  if (v === "false" || v === false) return false;
  return v; // valor inesperado: deixa o enum falhar
}, z.boolean().optional());

const clientStatusSchema = z.preprocess(
  blankToUndefined,
  clientStatusEnum.optional(),
);
const projectStatusSchema = z.preprocess(
  blankToUndefined,
  projectStatusEnum.optional(),
);
const consultantStatusSchema = z.preprocess(
  blankToUndefined,
  consultantStatusEnum.optional(),
);

/** Period presets (resolved server-side into `from`/`to`). */
export const PERIOD_PRESETS = [
  "mes-atual",
  "mes-anterior",
  "ano-atual",
  "custom",
] as const;
export type PeriodPreset = (typeof PERIOD_PRESETS)[number];
const periodSchema = z.preprocess(
  blankToUndefined,
  z.enum(PERIOD_PRESETS).optional(),
);

/** Sort direction. Default depends on the report (date asc for hours). */
const directionEnum = z.enum(["asc", "desc"]);
const directionSchema = z.preprocess(
  blankToUndefined,
  directionEnum.optional(),
);

/**
 * Allowed page sizes. Anything outside the set is rejected (the UI only offers
 * these values), keeping the page bounded and predictable. Shared by the
 * Relatorios screen and the Horas consultation panel.
 */
export const PAGE_SIZES = [5, 10, 25, 50, 100, 250, 500] as const;
export const DEFAULT_PAGE_SIZE = 50;

const pageSchema = z.preprocess((value) => {
  const v = blankToUndefined(value);
  return v === undefined ? undefined : Number(v);
}, z.number().int().min(1).optional());

const pageSizeSchema = z.preprocess((value) => {
  const v = blankToUndefined(value);
  return v === undefined ? undefined : Number(v);
}, z
  .number()
  .refine((n): n is (typeof PAGE_SIZES)[number] =>
    (PAGE_SIZES as readonly number[]).includes(n),
  )
  .optional());

/**
 * Sort whitelist per report. Invalid values fall back to the default below —
 * the raw value never reaches Prisma as a column name (anti-injection).
 */
export const HOURS_SORT_FIELDS = [
  "date",
  "hours",
  "consultantName",
  "projectName",
  "status",
] as const;
export type HoursSortField = (typeof HOURS_SORT_FIELDS)[number];
export const HOURS_DEFAULT_SORT: HoursSortField = "date";
export const HOURS_DEFAULT_DIRECTION: "asc" | "desc" = "asc";

export const EXPENSES_SORT_FIELDS = [
  "date",
  "amount",
  "consultantName",
  "projectName",
  "status",
] as const;
export type ExpensesSortField = (typeof EXPENSES_SORT_FIELDS)[number];
export const EXPENSES_DEFAULT_SORT: ExpensesSortField = "date";
export const EXPENSES_DEFAULT_DIRECTION: "asc" | "desc" = "desc";

const hoursSortSchema = z.preprocess(
  blankToUndefined,
  z.enum(HOURS_SORT_FIELDS).optional(),
);
const expensesSortSchema = z.preprocess(
  blankToUndefined,
  z.enum(EXPENSES_SORT_FIELDS).optional(),
);

/*
 * NOTE on `somenteComMovimento` (legado `filtroUsuariosClientesProjetos`):
 * intentionally NOT implemented. Every row in the detail reports already comes
 * from a TimeEntry/Expense (movement is implicit), and the consolidated report
 * only materializes a project when it has hours or expenses in the range —
 * projects with zero movement never appear. The toggle would be a no-op in all
 * three reports, so we omit it rather than add an inert control.
 */

export const hoursReportFilterSchema = z
  .object({
    period: periodSchema,
    from: isoDateSchema,
    to: isoDateSchema,
    clientId: idFilterSchema,
    projectId: idFilterSchema,
    consultantId: idFilterSchema,
    status: z.preprocess(blankToUndefined, hoursStatusEnum.optional()),
    activityType: z.preprocess(blankToUndefined, activityEnum.optional()),
    billable: billableSchema,
    clientStatus: clientStatusSchema,
    projectStatus: projectStatusSchema,
    consultantStatus: consultantStatusSchema,
    sort: hoursSortSchema,
    direction: directionSchema,
    page: pageSchema,
    pageSize: pageSizeSchema,
  })
  .superRefine(refineDateRange);

export type HoursReportFilter = z.infer<typeof hoursReportFilterSchema>;

const expenseStatusEnum = z.enum(EXPENSE_STATUSES);

/** Expense pipeline stages and their underlying statuses. */
export const EXPENSE_STAGES = [
  "GESTOR",
  "FINANCEIRO",
  "PAGAMENTO",
  "FINALIZADA",
] as const;

export type ExpenseStage = (typeof EXPENSE_STAGES)[number];

const expenseStageEnum = z.enum(EXPENSE_STAGES);

/** Status set entering each pipeline stage (docs section 4). */
export const EXPENSE_STAGE_STATUSES: Record<
  ExpenseStage,
  readonly (typeof EXPENSE_STATUSES)[number][]
> = {
  GESTOR: ["SUBMITTED", "MANAGER_REJECTED"],
  FINANCEIRO: ["MANAGER_APPROVED", "FINANCE_REJECTED"],
  PAGAMENTO: ["FINANCE_APPROVED", "PAYMENT_SCHEDULED"],
  FINALIZADA: ["PAID"],
};

export const expensesReportFilterSchema = z
  .object({
    period: periodSchema,
    from: isoDateSchema,
    to: isoDateSchema,
    clientId: idFilterSchema,
    projectId: idFilterSchema,
    consultantId: idFilterSchema,
    status: z.preprocess(blankToUndefined, expenseStatusEnum.optional()),
    stage: z.preprocess(blankToUndefined, expenseStageEnum.optional()),
    clientStatus: clientStatusSchema,
    projectStatus: projectStatusSchema,
    consultantStatus: consultantStatusSchema,
    sort: expensesSortSchema,
    direction: directionSchema,
    page: pageSchema,
    pageSize: pageSizeSchema,
  })
  .superRefine(refineDateRange);

export type ExpensesReportFilter = z.infer<typeof expensesReportFilterSchema>;

/**
 * Consolidated/closing filter: a `month` (yyyy-mm) expanded to the UTC month
 * range, OR an explicit `from`/`to`. No status — the closing semantics define
 * what enters. When `month` is present it takes precedence over `from`/`to`.
 */
export const consolidatedReportFilterSchema = z
  .object({
    month: monthSchema,
    from: isoDateSchema,
    to: isoDateSchema,
    clientId: idFilterSchema,
    projectId: idFilterSchema,
    consultantId: idFilterSchema,
    clientStatus: clientStatusSchema,
    projectStatus: projectStatusSchema,
    consultantStatus: consultantStatusSchema,
  })
  .superRefine(refineDateRange);

export type ConsolidatedReportFilter = z.infer<
  typeof consolidatedReportFilterSchema
>;

/**
 * Resolve the effective inclusive date range of a consolidated filter:
 * `month` (yyyy-mm) expands to first..last day of the month (UTC); otherwise
 * the explicit `from`/`to` are used. Returns ISO date strings or undefined.
 */
export function resolveConsolidatedRange(
  filter: ConsolidatedReportFilter,
): { from?: string; to?: string } {
  if (filter.month) {
    const [year, month] = filter.month.split("-").map(Number);
    const first = new Date(Date.UTC(year, month - 1, 1));
    const last = new Date(Date.UTC(year, month, 0)); // day 0 = last of prev
    return { from: toIso(first), to: toIso(last) };
  }
  return { from: filter.from, to: filter.to };
}

function toIso(date: Date): string {
  const y = date.getUTCFullYear();
  const m = String(date.getUTCMonth() + 1).padStart(2, "0");
  const d = String(date.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

/**
 * Resolve a period preset into an inclusive UTC `from`/`to` range. Pure and
 * testable: `today` is injected (the caller passes `new Date()`), never read
 * from the ambient clock. A known preset OVERRIDES any explicit `from`/`to`;
 * `custom`/`undefined` return `{}` so the caller keeps its explicit range.
 *
 * - `mes-atual`: first..last day of `today`'s month.
 * - `mes-anterior`: first..last day of the previous month.
 * - `ano-atual`: Jan 1 .. Dec 31 of `today`'s year.
 */
export function resolvePeriodPreset(
  period: PeriodPreset | undefined,
  today: Date,
): { from?: string; to?: string } {
  if (!period || period === "custom") return {};
  const y = today.getUTCFullYear();
  const m = today.getUTCMonth(); // 0-based

  if (period === "mes-atual") {
    return {
      from: toIso(new Date(Date.UTC(y, m, 1))),
      to: toIso(new Date(Date.UTC(y, m + 1, 0))),
    };
  }
  if (period === "mes-anterior") {
    return {
      from: toIso(new Date(Date.UTC(y, m - 1, 1))),
      to: toIso(new Date(Date.UTC(y, m, 0))),
    };
  }
  // ano-atual
  return {
    from: toIso(new Date(Date.UTC(y, 0, 1))),
    to: toIso(new Date(Date.UTC(y, 11, 31))),
  };
}

/**
 * Effective inclusive range for a detail report (hours/expenses): a known
 * `period` preset overrides `from`/`to`; otherwise the explicit range is used.
 * `today` is injected for testability.
 */
export function resolveDetailRange(
  filter: { period?: PeriodPreset; from?: string; to?: string },
  today: Date,
): { from?: string; to?: string } {
  const preset = resolvePeriodPreset(filter.period, today);
  if (preset.from || preset.to) return preset;
  return { from: filter.from, to: filter.to };
}
