import { z } from "zod";

/**
 * Server-side validation for the IA de Alocação query (§8.2). Shared by the page
 * (search params) and the read function. Pure (no server-only imports). The
 * requester provides EITHER a project (skills/sale rate/client derived from its
 * allocations) OR a manual set of skills + an optional period; both forms are
 * validated here, and the server resolves the rest.
 */

// Entity ids são strings opacas (cuids ou ids legíveis de seed — ver MEMORY:
// seed ids não são cuids). Validamos o formato, não o cuid.
const entityId = z
  .string()
  .trim()
  .min(1)
  .max(64)
  .regex(/^[A-Za-z0-9_-]+$/, "Identificador inválido.");

const skillLevel = z.enum(["BASIC", "INTERMEDIATE", "ADVANCED", "SPECIALIST"]);

const isoDate = z
  .string()
  .trim()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Data inválida.");

/** Uma skill exigida manualmente, com nível opcional. */
const requiredSkillSchema = z.object({
  skillId: entityId,
  requiredLevel: skillLevel.optional().nullable(),
});

export const allocationFitQuerySchema = z
  .object({
    /** Projeto-alvo: deriva cliente, skills das alocações e valor de venda. */
    projectId: entityId.optional().nullable(),
    /** Skills informadas manualmente (alternativa/complemento ao projeto). */
    skills: z.array(requiredSkillSchema).max(20).default([]),
    /** Início do período de disponibilidade (ISO yyyy-mm-dd). */
    periodStart: isoDate.optional().nullable(),
    /** Número de semanas da janela de disponibilidade (default 4). */
    weeks: z.number().int().min(1).max(26).default(4),
  })
  .refine((v) => Boolean(v.projectId) || v.skills.length > 0, {
    message: "Selecione um projeto ou informe ao menos uma skill.",
    path: ["projectId"],
  });

export type AllocationFitQueryInput = z.infer<typeof allocationFitQuerySchema>;
