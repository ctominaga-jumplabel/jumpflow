import { z } from "zod";

/**
 * Validação no servidor para a Universidade Jump (EP 7.3). Compartilhada por
 * actions e UI. Pura (sem imports server-only).
 */

// Ids opacos (cuids para linhas novas, ids legíveis em seeds — ver MEMORY).
const entityId = z
  .string()
  .trim()
  .min(1)
  .max(64)
  .regex(/^[A-Za-z0-9_-]+$/, "Identificador invalido.");

const learningStatus = z.enum(["ACTIVE", "INACTIVE"]);

const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .optional()
    .nullable()
    .transform((v) => (v ? v : null));

// ── Curadoria: Trilha ───────────────────────────────────────────────────────

export const trackCreateSchema = z.object({
  title: z.string().trim().min(3).max(200),
  description: optionalText(1000),
  category: optionalText(80),
});
export type TrackCreateInput = z.infer<typeof trackCreateSchema>;

export const trackUpdateSchema = trackCreateSchema.extend({ id: entityId });
export type TrackUpdateInput = z.infer<typeof trackUpdateSchema>;

export const trackSetStatusSchema = z.object({
  id: entityId,
  status: learningStatus,
});
export type TrackSetStatusInput = z.infer<typeof trackSetStatusSchema>;

// ── Curadoria: Curso ────────────────────────────────────────────────────────

// hours: carga horária do curso. Aceita decimal positivo, ou vazio → null.
const hours = z
  .number()
  .finite("Carga horária inválida.")
  .min(0)
  .max(10000)
  .optional()
  .nullable()
  .transform((v) => (v === undefined || v === null ? null : v));

// URL opcional. Vazio → null; quando presente, precisa ser http(s).
const externalUrl = z
  .string()
  .trim()
  .max(2000)
  .optional()
  .nullable()
  .transform((v) => (v ? v : null))
  .refine(
    (v) => v === null || /^https?:\/\//i.test(v),
    "Informe uma URL http(s) válida.",
  );

export const courseCreateSchema = z.object({
  title: z.string().trim().min(3).max(200),
  trackId: entityId.optional().nullable(),
  provider: optionalText(120),
  hours,
  externalUrl,
  skillId: entityId.optional().nullable(),
});
export type CourseCreateInput = z.infer<typeof courseCreateSchema>;

export const courseUpdateSchema = courseCreateSchema.extend({ id: entityId });
export type CourseUpdateInput = z.infer<typeof courseUpdateSchema>;

export const courseSetStatusSchema = z.object({
  id: entityId,
  status: learningStatus,
});
export type CourseSetStatusInput = z.infer<typeof courseSetStatusSchema>;

// ── Consultor: matrícula e progresso ────────────────────────────────────────

export const enrollSchema = z.object({ courseId: entityId });
export type EnrollInput = z.infer<typeof enrollSchema>;

export const enrollmentProgressSchema = z.object({
  enrollmentId: entityId,
  progressPct: z.number().int().min(0).max(100),
  hoursCompleted: z
    .number()
    .finite("Horas inválidas.")
    .min(0)
    .max(10000)
    .default(0),
});
export type EnrollmentProgressInput = z.infer<typeof enrollmentProgressSchema>;

export const cancelEnrollmentSchema = z.object({ enrollmentId: entityId });
export type CancelEnrollmentInput = z.infer<typeof cancelEnrollmentSchema>;
