import { z } from "zod";

/**
 * Server-side validation schemas for the Avaliação de Desempenho module (EP16).
 * Shared by the server actions and the UI. Pure (no server-only imports).
 * See docs/backlog-talentos.md EP16.
 */

// Entity ids são strings opacas (cuids para linhas novas, ids legíveis em seeds
// — ver MEMORY: seed ids não são cuids). Validamos o formato, não o cuid.
const entityId = z
  .string()
  .trim()
  .min(1)
  .max(64)
  .regex(/^[A-Za-z0-9_-]+$/, "Identificador invalido.");

const evaluationType = z.enum(["SELF_90", "MANAGER_180", "FULL_360"]);

// Datas chegam como ISO yyyy-mm-dd (input date). Coerce para Date no servidor.
const isoDate = z
  .string()
  .trim()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Data inválida.");

// ── Criar ciclo (US16.01) ───────────────────────────────────────────────────

export const cycleCreateSchema = z
  .object({
    name: z.string().trim().min(2).max(120),
    type: evaluationType,
    periodStart: isoDate,
    periodEnd: isoDate,
  })
  .refine((v) => v.periodStart < v.periodEnd, {
    message: "O início deve ser anterior ao fim.",
    path: ["periodEnd"],
  });

export type CycleCreateInput = z.infer<typeof cycleCreateSchema>;

// ── Transição de status (DRAFT→OPEN→CLOSED) ─────────────────────────────────

export const cycleTransitionSchema = z.object({
  id: entityId,
  to: z.enum(["OPEN", "CLOSED"]),
});

export type CycleTransitionInput = z.infer<typeof cycleTransitionSchema>;

// ── Salvar/submeter resposta (US16.03) ──────────────────────────────────────

const answerSchema = z.object({
  skillId: entityId,
  // score inteiro 1-5.
  score: z.number().int().min(1).max(5),
  comment: z
    .string()
    .trim()
    .max(2000)
    .optional()
    .transform((v) => (v ? v : undefined)),
});

export const responseSaveSchema = z.object({
  responseId: entityId,
  /** true = submeter (status COMPLETED + submittedAt); false = salvar rascunho. */
  submit: z.boolean(),
  answers: z.array(answerSchema).max(200),
});

export type ResponseSaveInput = z.infer<typeof responseSaveSchema>;
