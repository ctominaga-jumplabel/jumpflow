import { z } from "zod";

/**
 * Shared justification ("justificativa obrigatoria") primitives.
 *
 * Several flows demand a mandatory reason and optionally allow an attachment:
 * rejecting hours/expenses, marking an entry as NON-billable (Melhoria #9) and
 * reverting a billing release back to operation (Melhoria #16). Keep the
 * message and the base validation here so every schema/UI stays consistent.
 *
 * This module exports plain values only (no `"use server"`), so it is safe to
 * import from both server actions and client components.
 */

export const JUSTIFICATION_REQUIRED_MESSAGE =
  "A justificativa e obrigatoria.";

export const JUSTIFICATION_MIN_LENGTH = 3;
export const JUSTIFICATION_MAX_LENGTH = 2000;

/** A trimmed, non-empty justification string within sane bounds. */
export const justificationSchema = z
  .string()
  .trim()
  .min(JUSTIFICATION_MIN_LENGTH, JUSTIFICATION_REQUIRED_MESSAGE)
  .max(JUSTIFICATION_MAX_LENGTH);

/**
 * Optional justification metadata for an attached file. Storage upload itself
 * is handled by the expense/on-call storage providers; this only validates the
 * descriptor a client may send alongside the reason.
 */
export const justificationAttachmentSchema = z.object({
  fileName: z.string().trim().min(1).max(255),
  contentType: z.string().trim().min(1).max(150),
  size: z.number().int().positive(),
});

export type JustificationAttachmentInput = z.infer<
  typeof justificationAttachmentSchema
>;
