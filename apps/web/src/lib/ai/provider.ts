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

/**
 * Claude models em uso. Os ids sao COMPLETOS como estao — nunca acrescente
 * sufixo de data (`claude-haiku-4-5`, nunca `claude-haiku-4-5-20251001`), que a
 * API rejeita.
 */
export const AI_MODELS = {
  /** Highest quality, highest cost/latency. */
  OPUS: "claude-opus-5",
  /** Balanced default for most narratives. */
  SONNET: "claude-sonnet-5",
  /** Cheapest/fastest — good for short sentiment/labels. */
  HAIKU: "claude-haiku-4-5",
} as const;

export type AiModel = (typeof AI_MODELS)[keyof typeof AI_MODELS];

/** Qual provider concreto usar; vazio/desconhecido -> noop desligado. */
export type AiProviderKind = "anthropic" | "gemini";

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
  /**
   * Pede ao provider que force saida JSON quando ele souber fazer isso
   * nativamente (o Gemini tem `responseMimeType`). E uma DICA: o chamador
   * continua obrigado a tolerar prosa/cercas e a validar o que voltou.
   */
  json?: boolean;
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

// ---------------------------------------------------------------------------
// Google Gemini
// ---------------------------------------------------------------------------

/**
 * Modelo default do Gemini para leitura de documento. Precisa ser multimodal
 * (aceitar PDF em `inline_data`).
 *
 * ATENCAO: nome de modelo Gemini e ALVO MOVEL — `gemini-2.0-flash` ja foi
 * descontinuado e a API passou a responder 404. Se a leitura de curriculo parar,
 * liste os modelos da chave em uso (`GET /v1beta/models`) e aponte
 * `GEMINI_AI_MODEL` para um vivo — corrige por env, sem deploy. Mesmo cuidado
 * que o provider de transcricao ja documenta.
 */
const DEFAULT_GEMINI_MODEL = "gemini-3.8-flash";

const GEMINI_API_BASE =
  "https://generativelanguage.googleapis.com/v1beta/models";

/** Ler um curriculo inteiro demora mais que transcrever fala curta. */
const GEMINI_TIMEOUT_MS = 90_000;

/**
 * Aceita o nome documentado e o alias que costuma aparecer.
 *
 * Trata string VAZIA como ausente de proposito: `??` sozinho nao faz isso, e o
 * `.env.example` distribui `GOOGLE_API_KEY=""`. Quem copiasse o arquivo e
 * preenchesse so `GEMINI_API_KEY` ficaria com a IA silenciosamente desligada.
 */
function geminiApiKey(): string | undefined {
  const candidates = [process.env.GOOGLE_API_KEY, process.env.GEMINI_API_KEY];
  return candidates.map((value) => value?.trim()).find(Boolean);
}

function geminiModel(): string {
  return process.env.GEMINI_AI_MODEL?.trim() || DEFAULT_GEMINI_MODEL;
}

type GeminiPart =
  | { text: string }
  | { inline_data: { mime_type: string; data: string } };

interface GeminiResponse {
  candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
}

/**
 * Provider Google Gemini (chamada real via `fetch` portatil, sem SDK).
 *
 * Mesmo contrato seguro do noop: em QUALQUER falha (sem chave, HTTP != 2xx,
 * timeout, candidato vazio) loga uma linha enxuta e devolve `null`, para o
 * chamador degradar honestamente. A chave e o conteudo do documento NUNCA vao
 * para log.
 *
 * `opts.model` e IGNORADO de proposito: `AI_MODELS` carrega ids da Anthropic, e
 * mandar um deles ao Gemini daria 404. O modelo aqui vem sempre de
 * `GEMINI_AI_MODEL` (ou do default acima).
 */
class GeminiAiTextProvider implements AiTextProvider {
  constructor(private readonly apiKey: string) {}

  async complete(
    prompt: string,
    opts?: AiCompleteOptions,
  ): Promise<string | null> {
    return this.request([{ text: prompt }], opts, 1024);
  }

  async completeWithDocument(
    prompt: string,
    document: AiDocumentSource,
    opts?: AiCompleteOptions,
  ): Promise<string | null> {
    return this.request(
      [
        {
          inline_data: {
            mime_type: document.mediaType,
            data: document.dataBase64,
          },
        },
        { text: prompt },
      ],
      opts,
      4096,
    );
  }

  private async request(
    parts: GeminiPart[],
    opts: AiCompleteOptions | undefined,
    defaultMaxTokens: number,
  ): Promise<string | null> {
    const model = geminiModel();
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), GEMINI_TIMEOUT_MS);
    try {
      const response = await fetch(
        `${GEMINI_API_BASE}/${encodeURIComponent(model)}:generateContent`,
        {
          method: "POST",
          // Chave em header (nao na URL) para nunca cair em log de request.
          headers: {
            "Content-Type": "application/json",
            "x-goog-api-key": this.apiKey,
          },
          body: JSON.stringify({
            contents: [{ role: "user", parts }],
            ...(opts?.system
              ? { systemInstruction: { parts: [{ text: opts.system }] } }
              : {}),
            generationConfig: {
              temperature: 0,
              maxOutputTokens: opts?.maxTokens ?? defaultMaxTokens,
              // Extracao estruturada: pede JSON nativo, o que elimina a prosa
              // em volta. O chamador ainda valida o que voltou.
              ...(opts?.json ? { responseMimeType: "application/json" } : {}),
            },
          }),
          signal: controller.signal,
        },
      );

      if (!response.ok) {
        if (response.status === 404) {
          console.error(
            `[ai] Gemini: modelo "${model}" nao existe (HTTP 404). ` +
              "Provavelmente foi descontinuado — confira GET /v1beta/models " +
              "com a chave em uso e ajuste GEMINI_AI_MODEL.",
          );
          return null;
        }
        // Status apenas — nunca a chave nem o corpo da resposta.
        console.error("[ai] gemini request failed", response.status);
        return null;
      }

      const json = (await response.json()) as GeminiResponse;
      const text = (json.candidates?.[0]?.content?.parts ?? [])
        .map((part) => part.text ?? "")
        .join("")
        .trim();
      return text.length > 0 ? text : null;
    } catch (error) {
      console.error(
        "[ai] gemini request error",
        error instanceof Error ? error.message : "unknown",
      );
      return null;
    } finally {
      clearTimeout(timeout);
    }
  }
}

// ---------------------------------------------------------------------------
// Selecao do provider
// ---------------------------------------------------------------------------

/** Normaliza o provider configurado; null quando ausente/desconhecido. */
function resolveAiProviderKind(): AiProviderKind | null {
  const raw = process.env.AI_PROVIDER?.trim().toLowerCase();
  return raw === "anthropic" || raw === "gemini" ? raw : null;
}

/** Se o provider escolhido tem a credencial correspondente presente. */
function hasAiCredential(kind: AiProviderKind): boolean {
  if (kind === "anthropic") {
    return Boolean(process.env.ANTHROPIC_API_KEY?.trim());
  }
  return Boolean(geminiApiKey());
}

/**
 * Se ha um provider de IA real configurado E com credencial. Os gates de
 * feature (ex.: `isCurriculumAiImportEnabled`) dependem disto para nunca
 * mostrar uma funcionalidade de IA que na pratica nao roda.
 */
export function isAiProviderConfigured(): boolean {
  const kind = resolveAiProviderKind();
  return kind !== null && hasAiCredential(kind);
}

/**
 * Nome do modelo que DE FATO seria usado agora. Serve para auditoria/log nao
 * mentir: os call sites passam `AI_MODELS.*` (ids Claude), mas com o Gemini
 * selecionado quem responde e o modelo do Gemini.
 */
export function getConfiguredAiModel(): string {
  const kind = resolveAiProviderKind();
  if (kind === "gemini") return geminiModel();
  if (kind === "anthropic") return AI_MODELS.SONNET;
  return "none";
}

/**
 * Factory + ponto de injecao. Devolve o noop desligado a menos que
 * `AI_PROVIDER` selecione um provider conhecido E a credencial dele exista —
 * assim o caminho de IA e seguro por padrao.
 */
export function getAiTextProvider(): AiTextProvider {
  const kind = resolveAiProviderKind();
  if (kind === null || !hasAiCredential(kind)) {
    return disabledProvider;
  }
  if (kind === "anthropic") {
    return new AnthropicAiTextProvider(
      (process.env.ANTHROPIC_API_KEY as string).trim(),
    );
  }
  return new GeminiAiTextProvider((geminiApiKey() as string).trim());
}
