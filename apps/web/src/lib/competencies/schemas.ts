import { z } from "zod";

/**
 * Server-side validation schemas for the Competências module (catálogo de
 * skills + perfis de competência). Shared by the server actions and the UI.
 * Pure (no server-only imports). See docs/backlog-talentos.md EP12/EP13.
 */

// Entity ids are opaque strings (cuids for new rows, readable ids for seeds —
// see MEMORY: seed ids are not cuids). Validate shape, not the cuid format.
const entityId = z
  .string()
  .trim()
  .min(1)
  .max(64)
  .regex(/^[A-Za-z0-9_-]+$/, "Identificador invalido.");

const skillLevel = z.enum([
  "BASIC",
  "INTERMEDIATE",
  "ADVANCED",
  "SPECIALIST",
]);

const skillType = z.enum(["TECHNICAL", "BEHAVIORAL"]);

const skillStatus = z.enum(["ACTIVE", "INACTIVE"]);

const competencyScope = z.enum(["SENIORITY", "ROLE", "AREA"]);

const optionalCategory = z
  .string()
  .trim()
  .max(80)
  .optional()
  .transform((value) => (value ? value : undefined));

// ── Catálogo de skills (EP12) ──────────────────────────────────────────────

export const skillCreateSchema = z.object({
  name: z.string().trim().min(2).max(120),
  category: optionalCategory,
  type: skillType,
});

export const skillUpdateSchema = z.object({
  id: entityId,
  name: z.string().trim().min(2).max(120),
  category: optionalCategory,
  type: skillType,
  status: skillStatus,
});

export const skillSetStatusSchema = z.object({
  id: entityId,
  status: skillStatus,
});

export type SkillCreateInput = z.infer<typeof skillCreateSchema>;
export type SkillUpdateInput = z.infer<typeof skillUpdateSchema>;
export type SkillSetStatusInput = z.infer<typeof skillSetStatusSchema>;

// ── Perfis de competência (EP13) ───────────────────────────────────────────

// referenceKey é uma chave lógica livre (ex.: "SENIOR", "TECH_LEAD", "DATA").
// Normalizada para MAIÚSCULAS para casar de forma estável com a senioridade do
// consultor (enum) e tornar a unicidade (scope, referenceKey) previsível.
const referenceKey = z
  .string()
  .trim()
  .min(1)
  .max(64)
  .regex(/^[A-Za-z0-9 _-]+$/, "Referência inválida.")
  .transform((value) => value.toUpperCase());

export const profileCreateSchema = z.object({
  name: z.string().trim().min(2).max(120),
  scope: competencyScope,
  referenceKey,
});

export const profileUpdateSchema = z.object({
  id: entityId,
  name: z.string().trim().min(2).max(120),
  scope: competencyScope,
  referenceKey,
  status: skillStatus,
});

export const profileSetStatusSchema = z.object({
  id: entityId,
  status: skillStatus,
});

export const profileItemAddSchema = z.object({
  profileId: entityId,
  skillId: entityId,
  requiredLevel: skillLevel,
});

export const profileItemUpdateSchema = z.object({
  id: entityId,
  requiredLevel: skillLevel,
});

export const profileItemRemoveSchema = z.object({
  id: entityId,
});

export type ProfileCreateInput = z.infer<typeof profileCreateSchema>;
export type ProfileUpdateInput = z.infer<typeof profileUpdateSchema>;
export type ProfileSetStatusInput = z.infer<typeof profileSetStatusSchema>;
export type ProfileItemAddInput = z.infer<typeof profileItemAddSchema>;
export type ProfileItemUpdateInput = z.infer<typeof profileItemUpdateSchema>;
export type ProfileItemRemoveInput = z.infer<typeof profileItemRemoveSchema>;
