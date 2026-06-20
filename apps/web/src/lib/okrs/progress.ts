import type { KeyResultMetric } from "./types";

/**
 * Pure progress computation for Metas e OKRs (EP 7.2).
 *
 * No I/O. Callers pass the raw KR metric values; this returns the % done (0-100,
 * inteiro). Reused by the DB read layer (lib/db/okrs.ts) to shape the read-model
 * and unit-tested directly with all metricType + edge cases.
 *
 * Convenção de progresso:
 * - BOOLEAN: binário. Atingiu o alvo (current >= target) → 100%, senão 0%. Trata
 *   target=0 como "concluir quando current=0".
 * - NUMBER / PERCENT / CURRENCY: proporcional entre start e target.
 *   progress = (current - start) / (target - start), saturado em [0, 100].
 *
 * Bordas tratadas:
 * - start == target: progresso indefinido proporcionalmente → 0% até atingir o
 *   alvo (current >= target → 100%). Evita divisão por zero.
 * - current além do target: satura em 100% (não passa de 100).
 * - current antes do start (ou alvo decrescente): satura em 0%.
 * - alvo decrescente (target < start, ex.: "reduzir incidentes"): a direção é
 *   inferida do sinal de (target - start); a fórmula proporcional já cobre.
 */
export interface KeyResultProgressInput {
  metricType: KeyResultMetric;
  startValue: number;
  targetValue: number;
  currentValue: number;
}

/** Clampa um número em [0, 100] e arredonda para inteiro. */
function clampPercent(value: number): number {
  if (!Number.isFinite(value)) return 0;
  if (value <= 0) return 0;
  if (value >= 100) return 100;
  return Math.round(value);
}

export function computeKeyResultProgress(kr: KeyResultProgressInput): number {
  const { metricType, startValue, targetValue, currentValue } = kr;

  if (metricType === "BOOLEAN") {
    // Binário: concluído quando atinge o alvo. target tipicamente 1 (atingir) ou
    // 0 (manter zerado). current >= target → 100%.
    return currentValue >= targetValue ? 100 : 0;
  }

  const span = targetValue - startValue;
  if (span === 0) {
    // start == target: sem faixa proporcional. Concluído só ao bater o alvo.
    return currentValue >= targetValue ? 100 : 0;
  }

  // Proporção respeitando a direção (alvo crescente ou decrescente). Para alvo
  // decrescente, span < 0 e (current - start) também fica negativo conforme o
  // current cai, então a razão cresce de 0 a 1 corretamente.
  const ratio = (currentValue - startValue) / span;
  return clampPercent(ratio * 100);
}

/**
 * Rollup do objetivo: média simples dos progressos dos KRs (0-100, inteiro).
 * Objetivo sem KR → 0% (nada medido ainda). Decisão: média simples (todos os KRs
 * pesam igual) — sem peso por enquanto, mantém o cálculo transparente.
 */
export function computeObjectiveProgress(
  keyResults: ReadonlyArray<KeyResultProgressInput>,
): number {
  if (keyResults.length === 0) return 0;
  const sum = keyResults.reduce(
    (acc, kr) => acc + computeKeyResultProgress(kr),
    0,
  );
  return Math.round(sum / keyResults.length);
}
