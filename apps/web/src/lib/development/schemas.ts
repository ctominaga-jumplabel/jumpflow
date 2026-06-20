import { z } from "zod";

/**
 * Server-side validation schemas for the PDI module (EP17).
 * Shared by the server actions and the UI. Pure (no server-only imports).
 * See docs/backlog-talentos.md EP17.
 */

// Entity ids são strings opacas (cuids para linhas novas, ids legíveis em seeds
// — ver MEMORY: seed ids não são cuids). Validamos o formato, não o cuid.
const entityId = z
  .string()
  .trim()
  .min(1)
  .max(64)
  .regex(/^[A-Za-z0-9_-]+$/, "Identificador invalido.");

const actionType = z.enum([
  "TRAINING",
  "MENTORSHIP",
  "CERTIFICATION",
  "PROJECT",
  "READING",
]);

const actionStatus = z.enum([
  "PLANNED",
  "IN_PROGRESS",
  "DONE",
  "CANCELLED",
]);

// Datas chegam como ISO yyyy-mm-dd (input date). Coerce para Date no servidor.
const isoDate = z
  .string()
  .trim()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Data inválida.");

// ── Ação dentro do payload de criação (rascunho revisado) ───────────────────

const actionDraftSchema = z.object({
  type: actionType,
  targetSkillId: entityId.optional().nullable(),
  description: z.string().trim().min(3).max(500),
  dueAt: isoDate.optional().nullable(),
});

// ── Criar PDI a partir do gap (US17.01) ─────────────────────────────────────

export const planCreateSchema = z
  .object({
    consultantId: entityId,
    cycleId: entityId.optional().nullable(),
    periodStart: isoDate,
    periodEnd: isoDate,
    /** Ações já revisadas pelo humano (sugestões editadas/removidas). */
    actions: z.array(actionDraftSchema).max(50).default([]),
  })
  .refine((v) => v.periodStart < v.periodEnd, {
    message: "O início deve ser anterior ao fim.",
    path: ["periodEnd"],
  });

export type PlanCreateInput = z.infer<typeof planCreateSchema>;

// ── Transição de status do PLANO (US17.01) ──────────────────────────────────

export const planSetStatusSchema = z.object({
  id: entityId,
  status: z.enum(["ACTIVE", "COMPLETED", "CANCELLED"]),
});

export type PlanSetStatusInput = z.infer<typeof planSetStatusSchema>;

// ── Adicionar ação a um PDI existente (US17.02) ─────────────────────────────

export const actionAddSchema = z.object({
  planId: entityId,
  type: actionType,
  targetSkillId: entityId.optional().nullable(),
  description: z.string().trim().min(3).max(500),
  dueAt: isoDate.optional().nullable(),
});

export type ActionAddInput = z.infer<typeof actionAddSchema>;

// ── Editar estrutura da ação (gestão, US17.02) ──────────────────────────────

export const actionUpdateSchema = z.object({
  id: entityId,
  type: actionType,
  targetSkillId: entityId.optional().nullable(),
  description: z.string().trim().min(3).max(500),
  dueAt: isoDate.optional().nullable(),
});

export type ActionUpdateInput = z.infer<typeof actionUpdateSchema>;

// ── Remover ação (gestão, US17.02) ──────────────────────────────────────────

export const actionRemoveSchema = z.object({ id: entityId });
export type ActionRemoveInput = z.infer<typeof actionRemoveSchema>;

// ── Atualizar progresso da ação (gestão OU consultor dono, US17.02/03) ──────

export const actionProgressSchema = z.object({
  id: entityId,
  status: actionStatus,
  evidenceNote: z
    .string()
    .trim()
    .max(1000)
    .optional()
    .nullable()
    .transform((v) => (v ? v : null)),
});

export type ActionProgressInput = z.infer<typeof actionProgressSchema>;
