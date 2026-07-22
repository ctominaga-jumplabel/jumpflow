import { z } from "zod";
import { ACTIVITY_TYPES } from "./types";
import { parseIsoDateUtc } from "./week";
import { validateClockTimes } from "./time-clock";
import { JUSTIFICATION_MAX_LENGTH } from "@/lib/shared/justification";

/**
 * Shared Zod schemas for the Horas server actions (and their tests).
 * The server is the validation authority; client-side checks are a
 * pre-flight convenience only.
 */

/**
 * Entity ids. The spec suggests cuid, but seeded validation data uses
 * human-readable ids (e.g. "seed-project-portal"), so we only require a
 * non-empty string and let the database resolve existence.
 */
const idSchema = z.string().trim().min(1, "Identificador obrigatório.");

const isoDateSchema = z
  .string()
  .refine((value) => parseIsoDateUtc(value) !== null, {
    message: "Data inválida (use o formato aaaa-mm-dd).",
  });

const timeOfDaySchema = z
  .string()
  .trim()
  .regex(/^([01]\d|2[0-3]):([0-5]\d)$/, "Horário inválido (use HH:mm).");

/** Optional break field: blank string is treated as "no break". */
const optionalTimeOfDaySchema = z
  .union([timeOfDaySchema, z.literal("")])
  .optional()
  .nullable()
  .transform((value) => (value && value.length > 0 ? value : null));

/**
 * Clock-in fields shared by every entry input. Hours are derived from these
 * (Saída - Início - pausa); the break is optional via "Remover pausa".
 */
const clockFields = {
  startTime: timeOfDaySchema,
  endTime: timeOfDaySchema,
  breakStart: optionalTimeOfDaySchema,
  breakEnd: optionalTimeOfDaySchema,
} as const;

interface ClockShape {
  startTime: string;
  endTime: string;
  breakStart?: string | null;
  breakEnd?: string | null;
}

/** Attach the cross-field clock validation (order, break window, total <= 24h). */
function refineClock<T extends z.ZodTypeAny>(schema: T): T {
  return schema.superRefine((value, ctx) => {
    const clock = value as ClockShape;
    const result = validateClockTimes({
      startTime: clock.startTime,
      endTime: clock.endTime,
      breakStart: clock.breakStart,
      breakEnd: clock.breakEnd,
    });
    if (!result.ok) {
      ctx.addIssue({ code: "custom", path: ["endTime"], message: result.message });
    }
  }) as unknown as T;
}

/** Description is now mandatory for every entry. */
const descriptionSchema = z
  .string()
  .trim()
  .min(1, "Descrição é obrigatória.")
  .max(500, "Descrição deve ter no máximo 500 caracteres.");

/**
 * Fator de remuneração do lançamento (melhoria #2). O consultor é sempre pago
 * pelo equivalente `hours x multiplier`. Atividades normais usam 1.00; ON_CALL
 * usa um fator fracionário (ex.: 0.33). Default 1.00 quando omitido (linhas e
 * formulários que não enviam o campo). Sempre > 0 e <= 10 (sanidade).
 */
const multiplierSchema = z.coerce
  .number()
  .positive("O fator de remuneração deve ser maior que zero.")
  .max(10, "Fator de remuneração inválido (máximo 10).")
  .default(1);

/**
 * Motivo de NÃO faturável (P9). Opcional no schema porque só é exigido quando um
 * GESTOR marca o lançamento como não faturável — a obrigatoriedade condicional é
 * reforçada no servidor (resolveBillableDecision usa justificationSchema). Um
 * consultor puro não dita `billable`, então nunca precisa enviar o motivo.
 */
const nonBillableReasonSchema = z
  .string()
  .trim()
  .max(JUSTIFICATION_MAX_LENGTH)
  .optional();

export const timeEntryInputSchema = refineClock(
  z.object({
    projectId: idSchema,
    activityType: z.enum(ACTIVITY_TYPES),
    date: isoDateSchema,
    ...clockFields,
    description: descriptionSchema,
    billable: z.boolean(),
    nonBillableReason: nonBillableReasonSchema,
    multiplier: multiplierSchema,
  }),
);

// `z.input`: o `multiplier` tem `.default(1)`, então é OPCIONAL para quem chama
// a action (o servidor preenche 1.00). O valor já parseado (output) sempre tem
// `multiplier: number`.
export type TimeEntryInput = z.input<typeof timeEntryInputSchema>;

const weekdaySchema = z
  .number()
  .int("Dia da semana invalido.")
  .min(1, "Dia da semana invalido.")
  .max(7, "Dia da semana invalido.");

export const weeklyTimeEntryInputSchema = refineClock(
  z.object({
    projectId: idSchema,
    activityType: z.enum(ACTIVITY_TYPES),
    weekStart: isoDateSchema,
    ...clockFields,
    weekdays: z
      .array(weekdaySchema)
      .min(1, "Selecione ao menos um dia.")
      .max(7, "Selecione no maximo sete dias."),
    description: descriptionSchema,
    billable: z.boolean(),
    nonBillableReason: nonBillableReasonSchema,
    multiplier: multiplierSchema,
  }),
);

export type WeeklyTimeEntryInput = z.input<typeof weeklyTimeEntryInputSchema>;

export const updateTimeEntryInputSchema = refineClock(
  z.object({
    id: idSchema,
    ...clockFields,
    description: descriptionSchema,
    billable: z.boolean(),
    nonBillableReason: nonBillableReasonSchema,
    multiplier: multiplierSchema,
    /** Optional move to another day of the SAME week. */
    date: isoDateSchema.optional(),
  }),
);

export type UpdateTimeEntryInput = z.input<typeof updateTimeEntryInputSchema>;

export const deleteTimeEntryInputSchema = z.object({ id: idSchema });

export type DeleteTimeEntryInput = z.infer<typeof deleteTimeEntryInputSchema>;

export const weekActionInputSchema = z.object({
  /** Monday of the target week (snapped server-side if needed). */
  weekStart: isoDateSchema,
});

export type WeekActionInput = z.infer<typeof weekActionInputSchema>;

/**
 * "Copiar semana anterior": the modal collects a single week-level description
 * applied to every copied entry. When omitted/blank, each entry keeps its source
 * description.
 */
export const copyPreviousWeekInputSchema = z.object({
  weekStart: isoDateSchema,
  description: z
    .string()
    .trim()
    .max(500, "Descrição deve ter no máximo 500 caracteres.")
    .optional(),
});

export type CopyPreviousWeekInput = z.infer<typeof copyPreviousWeekInputSchema>;

export const saveTimesheetDefaultInputSchema = refineClock(
  z.object({
    allocationId: idSchema,
    activityType: z.enum(ACTIVITY_TYPES),
    ...clockFields,
    weekdays: z
      .array(weekdaySchema)
      .min(1, "Selecione ao menos um dia.")
      .max(7, "Selecione no maximo sete dias."),
    description: descriptionSchema,
    billable: z.boolean(),
  }),
);

export type SaveTimesheetDefaultInput = z.infer<
  typeof saveTimesheetDefaultInputSchema
>;

export const applyTimesheetDefaultInputSchema = z.object({
  allocationId: idSchema,
  weekStart: isoDateSchema,
});

export type ApplyTimesheetDefaultInput = z.infer<
  typeof applyTimesheetDefaultInputSchema
>;

/** Marker used by actions to map the comment issue to COMMENT_REQUIRED. */
export const COMMENT_REQUIRED_MESSAGE =
  "Comentário é obrigatório para reprovar.";

export const decideHoursSchema = z
  .object({
    entryIds: z.array(idSchema).min(1, "Selecione ao menos um lançamento."),
    // APPROVED/REJECTED are decisions; SUBMITTED reopens a decided entry back
    // to the pending queue (counts as a fresh MANUAL decision — see actions).
    decision: z.enum(["APPROVED", "REJECTED", "SUBMITTED"]),
    comment: z.string(),
  })
  .superRefine((value, ctx) => {
    if (value.decision === "REJECTED" && value.comment.trim().length === 0) {
      ctx.addIssue({
        code: "custom",
        path: ["comment"],
        message: COMMENT_REQUIRED_MESSAGE,
      });
    }
  });

export type DecideHoursInput = z.infer<typeof decideHoursSchema>;

/** Statuses a `decideHours` transition may legally start FROM, per target. */
export const DECIDE_HOURS_SOURCE_STATUS: Record<
  DecideHoursInput["decision"],
  readonly string[]
> = {
  // Decide a pending entry, or switch a previously decided one directly.
  APPROVED: ["SUBMITTED", "REJECTED"],
  REJECTED: ["SUBMITTED", "APPROVED"],
  // Reopen: an APPROVED/REJECTED entry goes back to the pending queue. CLOSED
  // is intentionally absent (terminal — guarded again at the action level).
  SUBMITTED: ["APPROVED", "REJECTED"],
};
