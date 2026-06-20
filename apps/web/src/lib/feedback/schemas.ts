import { z } from "zod";

/**
 * Server-side validation schemas for the Feedback Contínuo module (EP15).
 * Shared by the server actions and the UI. Pure (no server-only imports).
 */

// Entity ids are opaque strings (cuids for new rows, readable ids for seeds —
// see MEMORY: seed ids are not cuids). Validate shape, not the cuid format.
const entityId = z
  .string()
  .trim()
  .min(1)
  .max(64)
  .regex(/^[A-Za-z0-9_-]+$/, "Identificador invalido.");

const feedbackType = z.enum(["PRAISE", "GUIDANCE", "RECOGNITION", "CONCERN"]);
const feedbackSource = z.enum(["INTERNAL", "CLIENT", "PEER"]);
const feedbackVisibility = z.enum(["PRIVATE", "SHARED"]);

// Aceita ausência, string vazia (UI manda "" quando o usuário não escolhe) ou
// um id válido. Normaliza vazio → undefined antes de validar o formato.
const optionalRelation = z
  .string()
  .trim()
  .max(64)
  .optional()
  .transform((value) => (value ? value : undefined))
  .refine(
    (value) => value === undefined || /^[A-Za-z0-9_-]+$/.test(value),
    "Identificador invalido.",
  );

export const feedbackCreateSchema = z.object({
  subjectConsultantId: entityId,
  type: feedbackType,
  source: feedbackSource,
  visibility: feedbackVisibility,
  body: z.string().trim().min(3, "Escreva o feedback.").max(4000),
  relatedProjectId: optionalRelation,
  relatedClientId: optionalRelation,
});

/** Edit body and/or visibility (US15.03). Reason is required for the audit. */
export const feedbackUpdateSchema = z.object({
  id: entityId,
  visibility: feedbackVisibility,
  body: z.string().trim().min(3, "Escreva o feedback.").max(4000),
  reason: z.string().trim().max(280).optional(),
});

/** Change visibility only (PRIVATE↔SHARED) — lightweight path from the timeline. */
export const feedbackVisibilitySchema = z.object({
  id: entityId,
  visibility: feedbackVisibility,
  reason: z.string().trim().max(280).optional(),
});

export type FeedbackCreateInput = z.infer<typeof feedbackCreateSchema>;
export type FeedbackUpdateInput = z.infer<typeof feedbackUpdateSchema>;
export type FeedbackVisibilityInput = z.infer<typeof feedbackVisibilitySchema>;
