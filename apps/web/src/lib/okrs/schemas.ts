import { z } from "zod";

/**
 * Server-side validation schemas for Metas e OKRs (EP 7.2).
 * Shared by the server actions and the UI. Pure (no server-only imports).
 */

// Entity ids são strings opacas (cuids para linhas novas, ids legíveis em seeds
// — ver MEMORY: seed ids não são cuids). Validamos o formato, não o cuid.
const entityId = z
  .string()
  .trim()
  .min(1)
  .max(64)
  .regex(/^[A-Za-z0-9_-]+$/, "Identificador invalido.");

const objectiveScope = z.enum(["CONSULTANT", "PROJECT", "AREA", "COMPANY"]);
const metricType = z.enum(["NUMBER", "PERCENT", "CURRENCY", "BOOLEAN"]);

// Datas chegam como ISO yyyy-mm-dd (input date). Coerce para Date no servidor.
const isoDate = z
  .string()
  .trim()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Data inválida.");

// autoSource: chave opaca de fonte operacional (ex.: 'hours_total'). Vazio = null
// (manual). A validação de "fonte conhecida/aplicável" é regra de negócio,
// aplicada no servidor (auto-source.ts), não no schema.
const autoSource = z
  .string()
  .trim()
  .max(64)
  .optional()
  .nullable()
  .transform((v) => (v ? v : null));

const unit = z
  .string()
  .trim()
  .max(16)
  .optional()
  .nullable()
  .transform((v) => (v ? v : null));

// Valores numéricos do KR. Aceitam negativos (ex.: alvo decrescente), finitos.
const krValue = z
  .number()
  .finite("Valor inválido.")
  .min(-1_000_000_000)
  .max(1_000_000_000);

// ── KR dentro do payload de criação ─────────────────────────────────────────

const keyResultDraftSchema = z.object({
  title: z.string().trim().min(3).max(200),
  metricType,
  startValue: krValue.default(0),
  targetValue: krValue,
  currentValue: krValue.default(0),
  unit,
  autoSource,
});

export type KeyResultDraftInput = z.infer<typeof keyResultDraftSchema>;

// ── Criar objetivo + KRs (US OKR.01) ────────────────────────────────────────

export const objectiveCreateSchema = z
  .object({
    scope: objectiveScope,
    title: z.string().trim().min(3).max(200),
    description: z
      .string()
      .trim()
      .max(1000)
      .optional()
      .nullable()
      .transform((v) => (v ? v : null)),
    // Vínculos de escopo: validados condicionalmente abaixo.
    consultantId: entityId.optional().nullable(),
    projectId: entityId.optional().nullable(),
    referenceKey: z
      .string()
      .trim()
      .max(120)
      .optional()
      .nullable()
      .transform((v) => (v ? v : null)),
    periodStart: isoDate,
    periodEnd: isoDate,
    keyResults: z.array(keyResultDraftSchema).max(20).default([]),
  })
  .refine((v) => v.periodStart < v.periodEnd, {
    message: "O início deve ser anterior ao fim.",
    path: ["periodEnd"],
  })
  .refine(
    (v) => v.scope !== "CONSULTANT" || Boolean(v.consultantId),
    { message: "Selecione o consultor.", path: ["consultantId"] },
  )
  .refine((v) => v.scope !== "PROJECT" || Boolean(v.projectId), {
    message: "Selecione o projeto.",
    path: ["projectId"],
  })
  .refine(
    (v) =>
      (v.scope !== "AREA" && v.scope !== "COMPANY") ||
      Boolean(v.referenceKey),
    { message: "Informe a referência (área/empresa).", path: ["referenceKey"] },
  );

export type ObjectiveCreateInput = z.infer<typeof objectiveCreateSchema>;

// ── Editar metadados do objetivo (US OKR.01) ────────────────────────────────

export const objectiveUpdateSchema = z.object({
  id: entityId,
  title: z.string().trim().min(3).max(200),
  description: z
    .string()
    .trim()
    .max(1000)
    .optional()
    .nullable()
    .transform((v) => (v ? v : null)),
  periodStart: isoDate,
  periodEnd: isoDate,
}).refine((v) => v.periodStart < v.periodEnd, {
  message: "O início deve ser anterior ao fim.",
  path: ["periodEnd"],
});

export type ObjectiveUpdateInput = z.infer<typeof objectiveUpdateSchema>;

// ── Transição de status do objetivo (US OKR.01) ─────────────────────────────

export const objectiveSetStatusSchema = z.object({
  id: entityId,
  status: z.enum(["DRAFT", "ACTIVE", "COMPLETED", "CANCELLED"]),
});

export type ObjectiveSetStatusInput = z.infer<typeof objectiveSetStatusSchema>;

// ── Adicionar KR a um objetivo existente (US OKR.02) ────────────────────────

export const keyResultAddSchema = keyResultDraftSchema.extend({
  objectiveId: entityId,
});

export type KeyResultAddInput = z.infer<typeof keyResultAddSchema>;

// ── Editar estrutura de um KR (gestão, US OKR.02) ───────────────────────────

export const keyResultUpdateSchema = z.object({
  id: entityId,
  title: z.string().trim().min(3).max(200),
  metricType,
  startValue: krValue,
  targetValue: krValue,
  currentValue: krValue,
  unit,
  autoSource,
});

export type KeyResultUpdateInput = z.infer<typeof keyResultUpdateSchema>;

// ── Remover KR (gestão, US OKR.02) ──────────────────────────────────────────

export const keyResultRemoveSchema = z.object({ id: entityId });
export type KeyResultRemoveInput = z.infer<typeof keyResultRemoveSchema>;

// ── Atualizar currentValue de um KR (gestão OU consultor dono, US OKR.03) ───

export const keyResultProgressSchema = z.object({
  id: entityId,
  currentValue: krValue,
});

export type KeyResultProgressInput = z.infer<typeof keyResultProgressSchema>;

// ── Recalcular currentValue a partir do autoSource (US OKR.04) ──────────────

export const keyResultSyncSchema = z.object({ id: entityId });
export type KeyResultSyncInput = z.infer<typeof keyResultSyncSchema>;
