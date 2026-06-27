/**
 * Audit point for AI usage. A real AiTextProvider calls this whenever it makes
 * an LLM request, so every enrichment is traceable (which feature, which entity,
 * success/failure). Reuses the existing `IntegrationEvent` model.
 *
 * Schema decision: there is NO dedicated `AI` value in `IntegrationProviderKind`
 * yet, and we deliberately do not add one in this design phase (see
 * docs/p3-inteligencia-design.md §4 — no new schema). When the first real
 * provider lands, add `AI` to the enum in a single small migration and call this
 * helper from the provider. Until then this is a typed no-op placeholder so the
 * domain/provider code can already reference the audit contract without a
 * schema change.
 */

export type AiLlmFeature =
  | "ALLOCATION_EXPLANATION"
  | "RISK_SENTIMENT"
  | "SCORE_NARRATIVE"
  // Melhoria #4 (Checkpoint Intelligence, F4): extração de insights do corpo
  // do checkpoint (skills/oportunidades/cases) para curadoria humana.
  | "CHECKPOINT_EXTRACTION";

export interface AiUsageLog {
  feature: AiLlmFeature;
  model: string;
  entityType?: string;
  entityId?: string;
  status: "SUCCESS" | "FAILED";
  error?: string;
}

/**
 * Records an AI usage event. No-op until the `AI` provider enum value + a real
 * provider exist; kept as the single seam so we don't scatter logging logic.
 *
 * Intentionally async and never throws: logging must never break a request.
 */
export async function recordAiUsage(log: AiUsageLog): Promise<void> {
  // Placeholder: real implementation will create an IntegrationEvent with
  // provider="AI", operation=feature, status, entityType/entityId.
  void log;
  return;
}
