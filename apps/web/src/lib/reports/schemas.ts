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

export const hoursReportFilterSchema = z
  .object({
    from: isoDateSchema,
    to: isoDateSchema,
    clientId: idFilterSchema,
    projectId: idFilterSchema,
    consultantId: idFilterSchema,
    status: z.preprocess(blankToUndefined, hoursStatusEnum.optional()),
    activityType: z.preprocess(blankToUndefined, activityEnum.optional()),
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
    from: isoDateSchema,
    to: isoDateSchema,
    clientId: idFilterSchema,
    projectId: idFilterSchema,
    consultantId: idFilterSchema,
    status: z.preprocess(blankToUndefined, expenseStatusEnum.optional()),
    stage: z.preprocess(blankToUndefined, expenseStageEnum.optional()),
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
