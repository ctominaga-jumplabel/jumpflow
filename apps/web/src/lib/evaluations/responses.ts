import type { EvaluationRelationship, EvaluationType } from "./types";

/**
 * Pure rules for which rater relationships a cycle generates per Evaluation
 * (US16.02). No I/O — the DB layer materializes one `EvaluationResponse` per
 * relationship returned here when a cycle opens (DRAFT → OPEN).
 *
 * - SELF_90      = só SELF (autoavaliação).
 * - MANAGER_180  = SELF + MANAGER.
 * - FULL_360     = SELF + MANAGER + PEER + CLIENT (avaliador-cliente).
 *
 * SUBORDINATE existe no enum para evolução (avaliação de liderança), mas não é
 * gerado automaticamente no MVP; pode ser adicionado por configuração futura.
 */
export function relationshipsForType(
  type: EvaluationType,
): EvaluationRelationship[] {
  switch (type) {
    case "SELF_90":
      return ["SELF"];
    case "MANAGER_180":
      return ["SELF", "MANAGER"];
    case "FULL_360":
      return ["SELF", "MANAGER", "PEER", "CLIENT"];
  }
}

/**
 * Quantas respostas (avaliadores) cada avaliação terá, dado o tipo do ciclo.
 * Útil para conferência/contagem sem materializar.
 */
export function responseCountForType(type: EvaluationType): number {
  return relationshipsForType(type).length;
}
