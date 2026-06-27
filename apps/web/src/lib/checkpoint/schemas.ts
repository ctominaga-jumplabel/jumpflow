import { z } from "zod";

/**
 * Server-side validation schemas for Checkpoint / 1-on-1 (Melhoria #4, FATIA 2).
 * Shared by the server actions and the UI. Pure (no server-only imports).
 *
 * Espelha `lib/feedback/schemas.ts`. Voz (F3) e IA (F4) NÃO entram aqui — apenas
 * o registro manual: consultor, tipo, data, projeto relacionado, título, notas,
 * janela semanal (weekStart/weekEnd) e visibilidade.
 */

// Entity ids são strings opacas (cuids para linhas novas, ids legíveis em seeds —
// ver MEMORY: seed ids are not cuids). Validamos o shape, NÃO o formato cuid.
const entityId = z
  .string()
  .trim()
  .min(1)
  .max(64)
  .regex(/^[A-Za-z0-9_-]+$/, "Identificador invalido.");

// Aceita ausência, string vazia (a UI manda "" quando não há seleção) ou um id
// válido. Normaliza vazio → undefined antes de validar o formato.
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

const checkpointType = z.enum(["ONE_ON_ONE", "CHECKPOINT"]);
const checkpointVisibility = z.enum(["PRIVATE", "SHARED"]);

// Datas chegam como ISO string (UI) ou Date. Coerção tolerante; recusa inválida.
const occurredAt = z.coerce.date({ error: "Data invalida." });
const optionalDate = z.coerce
  .date()
  .optional()
  .or(z.literal("").transform(() => undefined));

const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .optional()
    .transform((value) => (value ? value : undefined));

export const checkpointCreateSchema = z
  .object({
    consultantId: entityId,
    type: checkpointType,
    occurredAt,
    relatedProjectId: optionalRelation,
    title: optionalText(200),
    notes: z.string().trim().max(8000).optional(),
    weekStart: optionalDate,
    weekEnd: optionalDate,
    // Nasce PRIVATE por padrão (decisão da melhoria); o gestor pode optar.
    visibility: checkpointVisibility.default("PRIVATE"),
  })
  .refine(
    (v) => !v.weekStart || !v.weekEnd || v.weekStart <= v.weekEnd,
    {
      message: "A semana informada e invalida (inicio depois do fim).",
      path: ["weekEnd"],
    },
  );

export const checkpointUpdateSchema = z
  .object({
    id: entityId,
    type: checkpointType.optional(),
    occurredAt: occurredAt.optional(),
    relatedProjectId: optionalRelation,
    title: optionalText(200),
    notes: z.string().trim().max(8000).optional(),
    weekStart: optionalDate,
    weekEnd: optionalDate,
    reason: z.string().trim().max(280).optional(),
  })
  .refine(
    (v) => !v.weekStart || !v.weekEnd || v.weekStart <= v.weekEnd,
    {
      message: "A semana informada e invalida (inicio depois do fim).",
      path: ["weekEnd"],
    },
  );

/** Mudar apenas visibilidade (PRIVATE↔SHARED) — ponto sensível, sempre auditado. */
export const checkpointVisibilitySchema = z.object({
  id: entityId,
  visibility: checkpointVisibility,
  reason: z.string().trim().max(280).optional(),
});

/** Arquivar (soft delete operacional → status ARCHIVED). */
export const checkpointArchiveSchema = z.object({
  id: entityId,
  reason: z.string().trim().max(280).optional(),
});

/**
 * Decisão humana sobre um insight extraído por IA (F4): aceitar promove o
 * candidato; descartar o arquiva. Vale para Opportunity e Case (a trilha de
 * Skills é decidida na tela de Skills existente, não aqui).
 */
export const insightDecisionSchema = z.object({
  id: entityId,
  decision: z.enum(["ACCEPTED", "DISMISSED"]),
});
export type InsightDecisionInput = z.input<typeof insightDecisionSchema>;

// Use z.input para o tipo de ENTRADA das actions: campos opcionais com
// `.optional().transform(...)` permanecem opcionais (não viram `| undefined`
// obrigatório), o que mantém o payload da UI ergonômico. O servidor consome a
// SAÍDA (result.data) via parseInput, então a coerção/normalização é garantida.
export type CheckpointCreateInput = z.input<typeof checkpointCreateSchema>;
export type CheckpointUpdateInput = z.input<typeof checkpointUpdateSchema>;
export type CheckpointVisibilityInput = z.input<
  typeof checkpointVisibilitySchema
>;
export type CheckpointArchiveInput = z.input<typeof checkpointArchiveSchema>;
