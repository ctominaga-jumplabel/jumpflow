/**
 * Minimal AI text-provider abstraction for the Prioridade 3 enrichment layer.
 *
 * Same shape as the other provider abstractions in `lib/` (cnpj, bank, nfse):
 * an interface, a default "disabled/noop" implementation that returns null when
 * the feature is off or no credential is present, and a single factory that the
 * domain code calls. NO real network call lives here yet — when a real Claude
 * provider is added it implements `AiTextProvider` and the factory selects it.
 *
 * Contract: the enrichment is ALWAYS optional. Callers must treat `null` as
 * "no narrative available" and render the deterministic factors alone. The LLM
 * never produces the score/ranking/risk number — only prose about it.
 */

/** Current Claude models (for the future real provider; not used by the noop). */
export const AI_MODELS = {
  /** Highest quality, highest cost/latency. */
  OPUS: "claude-opus-4-8",
  /** Balanced default for most narratives. */
  SONNET: "claude-sonnet-4-6",
  /** Cheapest/fastest — good for short sentiment/labels. */
  HAIKU: "claude-haiku-4-5-20251001",
} as const;

export type AiModel = (typeof AI_MODELS)[keyof typeof AI_MODELS];

export interface AiCompleteOptions {
  /** Which Claude model to use. Defaults are chosen per call site (cost vs quality). */
  model?: AiModel;
  /** Hard cap on output tokens. Keep small — these are short explanations. */
  maxTokens?: number;
  /** System prompt establishing the assistant role/guardrails. */
  system?: string;
  /** Optional correlation id for IntegrationEvent logging (entityId). */
  entityType?: string;
  entityId?: string;
}

export interface AiTextProvider {
  /**
   * Returns generated text, or `null` when disabled/unconfigured/failed.
   * Implementations MUST NOT throw on missing credentials — return null so the
   * caller degrades gracefully (same philosophy as DisabledCnpjProvider).
   */
  complete(prompt: string, opts?: AiCompleteOptions): Promise<string | null>;
}

/**
 * No-op provider: returns null for everything. Used whenever no real provider is
 * configured. This keeps the enrichment path safe-by-default and matches the
 * "IA sempre como sugestão" governance — with no provider, there is simply no
 * narrative, and the deterministic engine is unaffected.
 */
class DisabledAiTextProvider implements AiTextProvider {
  async complete(): Promise<string | null> {
    return null;
  }
}

const disabledProvider = new DisabledAiTextProvider();

/**
 * Whether a real AI provider is configured. Today always false (no real provider
 * implemented). When a Claude provider is added, this checks for the API key env.
 */
export function isAiProviderConfigured(): boolean {
  return Boolean(process.env.AI_PROVIDER) && Boolean(process.env.ANTHROPIC_API_KEY);
}

/**
 * Factory + injection point. Returns the disabled provider until a real one is
 * wired. A future Claude provider would be selected here, e.g.:
 *
 *   if (isAiProviderConfigured() && process.env.AI_PROVIDER === "anthropic") {
 *     return new AnthropicAiTextProvider();
 *   }
 *
 * The real provider is responsible for recording an IntegrationEvent per call
 * (see lib/ai/log.ts) so AI usage is auditable.
 */
export function getAiTextProvider(): AiTextProvider {
  // No real provider implemented yet — always degrade to noop.
  return disabledProvider;
}
