import { z } from "zod";

/**
 * Server-side validation for the Score do Consultor query (§8.4). Shared by the
 * page (search params) and the read function. Pure (no server-only imports). O
 * requisitante pode abrir o detalhe de um consultor específico — caso contrário a
 * lista do seu escopo é avaliada.
 */

// Entity ids são strings opacas (cuids ou ids legíveis de seed — ver MEMORY:
// seed ids não são cuids). Validamos o formato, não o cuid.
const entityId = z
  .string()
  .trim()
  .min(1)
  .max(64)
  .regex(/^[A-Za-z0-9_-]+$/, "Identificador inválido.");

export const consultantScoreQuerySchema = z.object({
  /** Consultor-alvo para o detalhe; ausente = lista do escopo do requisitante. */
  consultantId: entityId.optional().nullable(),
});

export type ConsultantScoreQueryInput = z.infer<
  typeof consultantScoreQuerySchema
>;
