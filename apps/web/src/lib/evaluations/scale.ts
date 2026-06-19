import {
  skillLevelOrder,
  skillLevelWeight,
  type SkillLevel,
} from "@/lib/competencies/types";

/**
 * DP-06 — Conversão entre a escala de SCORE da avaliação (inteiro 1–5) e a
 * escala de NÍVEL de skill (BASIC..SPECIALIST, peso 0–3) usada pelo perfil de
 * competência (`CompetencyProfileItem.requiredLevel`).
 *
 * Decisão (documentada e isolada para ser testável):
 *
 *   - O score vive em [1, 5]; o peso de nível vive em [0, 3] (4 níveis).
 *   - Mapeamento linear afim: peso = (score - 1) / 4 * 3.
 *       score 1 → 0.0 (BASIC),   score 3 → 1.5 (entre INTERMEDIATE/ADVANCED),
 *       score 5 → 3.0 (SPECIALIST). Linear preserva a ordem e a proporção, o
 *       que mantém o gap (requiredWeight − assessedWeight) comparável ao gap da
 *       matriz de Competências (que opera em pesos de nível).
 *   - O inverso (peso → score esperado) serve para sobrepor o "alvo" no radar
 *       (que está na escala 1–5): score = peso / 3 * 4 + 1.
 *
 * Mantemos a conversão aqui, pura e única, para que radar (1–5) e gap (pesos)
 * usem exatamente a mesma régua e nunca divirjam.
 */

/** Limites da escala de score da avaliação. */
export const SCORE_MIN = 1;
export const SCORE_MAX = 5;

/** Maior peso de nível (SPECIALIST). 4 níveis → índices 0..3. */
const MAX_LEVEL_WEIGHT = skillLevelOrder.length - 1; // 3

/** Limita um número ao intervalo [min, max]. */
function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

/**
 * Converte uma média de score (1–5) para o peso equivalente na escala de nível
 * (0–3). Fora do intervalo é truncado para os limites (defensivo; o score já é
 * validado 1–5 no servidor).
 */
export function scoreToLevelWeight(score: number): number {
  const s = clamp(score, SCORE_MIN, SCORE_MAX);
  return ((s - SCORE_MIN) / (SCORE_MAX - SCORE_MIN)) * MAX_LEVEL_WEIGHT;
}

/**
 * Converte o peso de um nível requerido (0–3) para o score esperado (1–5).
 * Usado para desenhar o "alvo" sobre o radar, que está na escala 1–5.
 */
export function levelWeightToScore(weight: number): number {
  const w = clamp(weight, 0, MAX_LEVEL_WEIGHT);
  return (w / MAX_LEVEL_WEIGHT) * (SCORE_MAX - SCORE_MIN) + SCORE_MIN;
}

/** Atalho: nível requerido (enum) → score esperado (1–5). */
export function requiredLevelToExpectedScore(level: SkillLevel): number {
  return levelWeightToScore(skillLevelWeight(level));
}

/** Atalho: nível requerido (enum) → peso (0–3). */
export function requiredLevelWeight(level: SkillLevel): number {
  return skillLevelWeight(level);
}
