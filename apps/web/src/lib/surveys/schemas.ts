import { z } from "zod";
import { NPS_MAX, NPS_MIN, SCALE_MAX, SCALE_MIN } from "./types";

/**
 * Server-side validation schemas for the Pesquisa de Clima / NPS module
 * (EP 7.1). Shared by the server actions and the UI. Pure (no server-only
 * imports). See docs/roadmap-talentos-gcpec.md §7.1.
 */

// Entity ids são strings opacas (cuids para linhas novas, ids legíveis em seeds
// — ver MEMORY: seed ids não são cuids). Validamos o formato, não o cuid.
const entityId = z
  .string()
  .trim()
  .min(1)
  .max(64)
  .regex(/^[A-Za-z0-9_-]+$/, "Identificador invalido.");

const surveyType = z.enum([
  "CLIMATE",
  "NPS",
  "SATISFACTION",
  "LEADERSHIP",
  "PULSE",
]);

const questionType = z.enum(["SCALE", "NPS", "TEXT", "CHOICE"]);

// Datas chegam como ISO yyyy-mm-dd (input date). Opcionais (período).
const optionalIsoDate = z
  .string()
  .trim()
  .optional()
  .transform((v) => (v ? v : undefined))
  .refine(
    (v) => v === undefined || /^\d{4}-\d{2}-\d{2}$/.test(v),
    "Data inválida.",
  );

// ── Criar pesquisa (gestão) ─────────────────────────────────────────────────

const questionInputSchema = z
  .object({
    text: z.string().trim().min(2, "Escreva a pergunta.").max(500),
    type: questionType,
    /** Alternativas (CHOICE). Vazio para os demais tipos. */
    options: z.array(z.string().trim().min(1).max(200)).max(20).default([]),
  })
  .superRefine((q, ctx) => {
    if (q.type === "CHOICE" && q.options.length < 2) {
      ctx.addIssue({
        code: "custom",
        message: "Perguntas de escolha exigem ao menos 2 alternativas.",
        path: ["options"],
      });
    }
  });

export const surveyCreateSchema = z
  .object({
    title: z.string().trim().min(2).max(160),
    description: z
      .string()
      .trim()
      .max(2000)
      .optional()
      .transform((v) => (v ? v : undefined)),
    type: surveyType,
    /** Anônima por padrão (anonimato é o caso central). */
    anonymous: z.boolean().default(true),
    periodStart: optionalIsoDate,
    periodEnd: optionalIsoDate,
    questions: z
      .array(questionInputSchema)
      .min(1, "Adicione ao menos uma pergunta.")
      .max(50),
  })
  .refine(
    (v) =>
      !v.periodStart || !v.periodEnd || v.periodStart <= v.periodEnd,
    { message: "O início deve ser anterior ao fim.", path: ["periodEnd"] },
  );

export type SurveyCreateInput = z.infer<typeof surveyCreateSchema>;

// ── Transição de status (DRAFT→OPEN→CLOSED) ─────────────────────────────────

export const surveyTransitionSchema = z.object({
  id: entityId,
  to: z.enum(["OPEN", "CLOSED"]),
});

export type SurveyTransitionInput = z.infer<typeof surveyTransitionSchema>;

// ── Submeter resposta (consultor convidado) ─────────────────────────────────

/**
 * Uma resposta por questão. Carrega só o valor; o tipo é validado contra a
 * questão real no servidor (defensivo — o cliente não é confiável). Note que
 * NÃO há qualquer campo de identidade aqui (anonimato).
 */
const answerSubmitSchema = z.object({
  questionId: entityId,
  scoreValue: z
    .number()
    .int()
    .min(Math.min(SCALE_MIN, NPS_MIN))
    .max(Math.max(SCALE_MAX, NPS_MAX))
    .optional(),
  choiceValue: z
    .string()
    .trim()
    .max(200)
    .optional()
    .transform((v) => (v ? v : undefined)),
  textValue: z
    .string()
    .trim()
    .max(4000)
    .optional()
    .transform((v) => (v ? v : undefined)),
});

export const surveySubmitSchema = z.object({
  invitationId: entityId,
  answers: z.array(answerSubmitSchema).min(1).max(200),
});

export type SurveySubmitInput = z.infer<typeof surveySubmitSchema>;
export type SurveyAnswerSubmit = z.infer<typeof answerSubmitSchema>;
