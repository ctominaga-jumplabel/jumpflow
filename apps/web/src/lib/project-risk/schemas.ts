import { z } from "zod";

/**
 * Server-side validation for the IA de Risco query (§8.3). Shared by the page
 * (search params) and the read function. Pure (no server-only imports). O
 * requisitante pode filtrar por um projeto específico (detalhe) — caso contrário
 * a lista de projetos do seu escopo é avaliada.
 */

// Entity ids são strings opacas (cuids ou ids legíveis de seed — ver MEMORY:
// seed ids não são cuids). Validamos o formato, não o cuid.
const entityId = z
  .string()
  .trim()
  .min(1)
  .max(64)
  .regex(/^[A-Za-z0-9_-]+$/, "Identificador inválido.");

export const projectRiskQuerySchema = z.object({
  /** Projeto-alvo para o detalhe; ausente = lista do escopo do requisitante. */
  projectId: entityId.optional().nullable(),
});

export type ProjectRiskQueryInput = z.infer<typeof projectRiskQuerySchema>;
