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

/**
 * A document attached to the request as CONTEXT for the model (e.g. an uploaded
 * PDF). Carries the raw bytes as base64 with no `data:` prefix — the provider
 * wraps it in the Messages API `document` content block.
 */
export interface AiDocumentSource {
  /** Only PDF is supported today (the CV upload). */
  mediaType: "application/pdf";
  /** Raw file bytes encoded as base64 (no `data:` URI prefix). */
  dataBase64: string;
}

export interface AiTextProvider {
  /**
   * Returns generated text, or `null` when disabled/unconfigured/failed.
   * Implementations MUST NOT throw on missing credentials — return null so the
   * caller degrades gracefully (same philosophy as DisabledCnpjProvider).
   */
  complete(prompt: string, opts?: AiCompleteOptions): Promise<string | null>;
  /**
   * Same contract as {@link complete}, but with a document (PDF) attached as
   * context. Returns `null` when disabled/unconfigured/failed or when the
   * provider cannot read documents. NEVER throws.
   */
  completeWithDocument(
    prompt: string,
    document: AiDocumentSource,
    opts?: AiCompleteOptions,
  ): Promise<string | null>;
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
  async completeWithDocument(): Promise<string | null> {
    return null;
  }
}

const disabledProvider = new DisabledAiTextProvider();

const ANTHROPIC_MESSAGES_URL = "https://api.anthropic.com/v1/messages";
const ANTHROPIC_VERSION = "2023-06-01";

type AnthropicContentBlock =
  | { type: "text"; text: string }
  | {
      type: "document";
      source: { type: "base64"; media_type: string; data: string };
    };

/**
 * Real Claude provider over the Anthropic Messages API via plain `fetch` (no
 * SDK). It implements the SAME safe contract as the noop: on any failure it logs
 * a terse, secret-free line and returns `null`, so the caller always degrades
 * gracefully. Governance: the model only PROPOSES text/structured suggestions —
 * persistence and validation are always a separate, human-confirmed step.
 *
 * Security: the API key and the raw document/response bodies are NEVER logged.
 */
class AnthropicAiTextProvider implements AiTextProvider {
  constructor(private readonly apiKey: string) {}

  async complete(
    prompt: string,
    opts?: AiCompleteOptions,
  ): Promise<string | null> {
    return this.request([{ type: "text", text: prompt }], opts, 1024);
  }

  async completeWithDocument(
    prompt: string,
    document: AiDocumentSource,
    opts?: AiCompleteOptions,
  ): Promise<string | null> {
    return this.request(
      [
        {
          type: "document",
          source: {
            type: "base64",
            media_type: document.mediaType,
            data: document.dataBase64,
          },
        },
        { type: "text", text: prompt },
      ],
      opts,
      4096,
    );
  }

  private async request(
    content: AnthropicContentBlock[],
    opts: AiCompleteOptions | undefined,
    defaultMaxTokens: number,
  ): Promise<string | null> {
    try {
      const response = await fetch(ANTHROPIC_MESSAGES_URL, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-api-key": this.apiKey,
          "anthropic-version": ANTHROPIC_VERSION,
        },
        body: JSON.stringify({
          model: opts?.model ?? AI_MODELS.SONNET,
          max_tokens: opts?.maxTokens ?? defaultMaxTokens,
          ...(opts?.system ? { system: opts.system } : {}),
          messages: [{ role: "user", content }],
        }),
      });
      if (!response.ok) {
        // Log the status only — never the key or the response body.
        console.error("[ai] anthropic request failed", response.status);
        return null;
      }
      const json = (await response.json()) as {
        content?: Array<{ type: string; text?: string }>;
      };
      const text = (json.content ?? [])
        .filter(
          (block) => block.type === "text" && typeof block.text === "string",
        )
        .map((block) => block.text as string)
        .join("\n")
        .trim();
      return text.length > 0 ? text : null;
    } catch (error) {
      console.error(
        "[ai] anthropic request error",
        error instanceof Error ? error.message : "unknown",
      );
      return null;
    }
  }
}

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
  if (isAiProviderConfigured() && process.env.AI_PROVIDER === "anthropic") {
    return new AnthropicAiTextProvider(
      (process.env.ANTHROPIC_API_KEY as string).trim(),
    );
  }
  // No real provider configured — degrade to the safe noop.
  return disabledProvider;
}
