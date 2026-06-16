import { z } from "zod";
import { ACTIVITY_TYPES } from "./types";
import { parseIsoDateUtc } from "./week";

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

const hoursSchema = z
  .number()
  .gt(0, "Informe horas maiores que zero.")
  .lte(24, "Informe no máximo 24 horas por dia.")
  .refine((value) => Math.abs(value * 100 - Math.round(value * 100)) < 1e-9, {
    message: "Use no máximo 2 casas decimais.",
  });

const descriptionSchema = z
  .string()
  .trim()
  .max(500, "Descrição deve ter no máximo 500 caracteres.")
  .optional();

export const timeEntryInputSchema = z.object({
  projectId: idSchema,
  activityType: z.enum(ACTIVITY_TYPES),
  date: isoDateSchema,
  hours: hoursSchema,
  description: descriptionSchema,
  billable: z.boolean(),
});

export type TimeEntryInput = z.infer<typeof timeEntryInputSchema>;

const weekdaySchema = z
  .number()
  .int("Dia da semana invalido.")
  .min(1, "Dia da semana invalido.")
  .max(7, "Dia da semana invalido.");

export const weeklyTimeEntryInputSchema = z.object({
  projectId: idSchema,
  activityType: z.enum(ACTIVITY_TYPES),
  weekStart: isoDateSchema,
  hoursPerDay: hoursSchema,
  weekdays: z
    .array(weekdaySchema)
    .min(1, "Selecione ao menos um dia.")
    .max(7, "Selecione no maximo sete dias."),
  description: descriptionSchema,
  billable: z.boolean(),
});

export type WeeklyTimeEntryInput = z.infer<typeof weeklyTimeEntryInputSchema>;

export const updateTimeEntryInputSchema = z.object({
  id: idSchema,
  hours: hoursSchema,
  description: descriptionSchema,
  billable: z.boolean(),
  /** Optional move to another day of the SAME week. */
  date: isoDateSchema.optional(),
});

export type UpdateTimeEntryInput = z.infer<typeof updateTimeEntryInputSchema>;

export const deleteTimeEntryInputSchema = z.object({ id: idSchema });

export type DeleteTimeEntryInput = z.infer<typeof deleteTimeEntryInputSchema>;

export const weekActionInputSchema = z.object({
  /** Monday of the target week (snapped server-side if needed). */
  weekStart: isoDateSchema,
});

export type WeekActionInput = z.infer<typeof weekActionInputSchema>;

export const saveTimesheetDefaultInputSchema = z.object({
  allocationId: idSchema,
  activityType: z.enum(ACTIVITY_TYPES),
  hoursPerDay: hoursSchema,
  weekdays: z
    .array(weekdaySchema)
    .min(1, "Selecione ao menos um dia.")
    .max(7, "Selecione no maximo sete dias."),
  description: descriptionSchema,
  billable: z.boolean(),
});

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
