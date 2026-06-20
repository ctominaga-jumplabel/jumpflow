/**
 * Feature flags for the Prioridade 3 "Inteligência" layer (LLM enrichment only).
 *
 * Mirrors the style of `lib/feedback/flags.ts`: edge-safe, only reads
 * `process.env` (NEXT_PUBLIC_* so they are inlined for the client too). All
 * default to OFF.
 *
 * IMPORTANT: the deterministic CORE of allocation suggestion, project risk and
 * consultant score does NOT depend on these flags. These gate ONLY the optional
 * LLM enrichment (natural-language explanation/narrative, comment sentiment).
 * When off, the engines still run on existing data; only the prose layer is
 * absent and the UI shows the structured factors alone.
 *
 * To enable locally, set in the env (requires a real AI provider configured too,
 * see lib/ai/provider.ts — otherwise the noop provider returns null gracefully):
 *   NEXT_PUBLIC_AI_ALLOCATION=true       # explicação em linguagem natural da sugestão de alocação
 *   NEXT_PUBLIC_AI_RISK_SENTIMENT=true   # análise de sentimento de comentários para o risco
 *   NEXT_PUBLIC_AI_SCORE_NARRATIVE=true  # narrativa do score do consultor
 */

function isEnabled(value: string | undefined): boolean {
  return value === "true" || value === "1";
}

/** 8.2 — explicação em linguagem natural da sugestão de alocação (off por padrão). */
export function isAiAllocationEnabled(): boolean {
  return isEnabled(process.env.NEXT_PUBLIC_AI_ALLOCATION);
}

/** 8.3 — análise de sentimento de comentários para o risco de projeto (off por padrão). */
export function isAiRiskSentimentEnabled(): boolean {
  return isEnabled(process.env.NEXT_PUBLIC_AI_RISK_SENTIMENT);
}

/** 8.4 — narrativa em linguagem natural do score do consultor (off por padrão). */
export function isAiScoreNarrativeEnabled(): boolean {
  return isEnabled(process.env.NEXT_PUBLIC_AI_SCORE_NARRATIVE);
}

export interface AiFlags {
  allocation: boolean;
  riskSentiment: boolean;
  scoreNarrative: boolean;
}

export function getAiFlags(): AiFlags {
  return {
    allocation: isAiAllocationEnabled(),
    riskSentiment: isAiRiskSentimentEnabled(),
    scoreNarrative: isAiScoreNarrativeEnabled(),
  };
}
