/**
 * Agnostic audio-transcription provider abstraction (Melhoria #3).
 *
 * Same shape as the other provider seams in `lib/` (ai, cnpj, bank, nfse):
 * an interface, a default "disabled/noop" implementation that returns `null`
 * when the feature is off or no credential is present, and a single factory
 * that the domain code calls. NO real network call lives here yet — when a real
 * OpenAI/Gemini provider is added it implements `TranscriptionProvider` and the
 * factory selects it by env.
 *
 * Portability: this module deliberately knows nothing about Supabase, Horas, or
 * any specific vendor SDK. The core stays vendor-agnostic; concrete providers
 * are plugged in behind `getTranscriptionProvider()`.
 *
 * Contract: transcription is ALWAYS optional. Callers must treat `null` as
 * "no transcription available" and degrade gracefully (e.g. keep the manual
 * text input). The provider MUST NOT throw on missing credentials — it returns
 * `null` so the caller degrades, same philosophy as DisabledAiTextProvider.
 */

/** Known transcription models, for the future real providers (not used by noop). */
export const TRANSCRIPTION_MODELS = {
  /** OpenAI speech-to-text (Whisper family / gpt-4o-transcribe). */
  OPENAI_WHISPER: "whisper-1",
  OPENAI_GPT4O_TRANSCRIBE: "gpt-4o-transcribe",
  /** Google Gemini multimodal audio understanding. */
  GEMINI_FLASH: "gemini-2.0-flash",
} as const;

export type TranscriptionModel =
  (typeof TRANSCRIPTION_MODELS)[keyof typeof TRANSCRIPTION_MODELS];

/** Which concrete provider to use; empty/unknown -> disabled noop. */
export type TranscriptionProviderKind = "openai" | "gemini";

export interface TranscriptionInput {
  /**
   * Raw audio. Accepts a Node Buffer/Uint8Array or a base64-encoded string.
   * Concrete providers normalize this before sending it to the vendor API.
   */
  audio: Buffer | Uint8Array | string;
  /** Whether `audio` is a base64 string. Defaults to false (binary buffer). */
  audioIsBase64?: boolean;
  /** MIME type of the audio, e.g. "audio/webm", "audio/mpeg". */
  mimeType: string;
  /** Optional BCP-47 language hint, e.g. "pt-BR", to bias recognition. */
  languageHint?: string;
  /** Optional model override; otherwise the provider picks a sensible default. */
  model?: TranscriptionModel;
  /** Optional correlation ids for future audit logging. */
  entityType?: string;
  entityId?: string;
}

export interface TranscriptionResult {
  /** The recognized text. */
  text: string;
  /** Detected/used language (BCP-47), when the provider reports it. */
  language?: string;
  /** Audio duration in seconds, when the provider reports it. */
  durationSec?: number;
  /** Model that produced the transcription, for traceability. */
  model?: string;
}

export interface TranscriptionProvider {
  /**
   * Returns the transcription, or `null` when disabled/unconfigured/failed.
   * Implementations MUST NOT throw on missing credentials — return `null` so
   * the caller degrades gracefully.
   */
  transcribe(input: TranscriptionInput): Promise<TranscriptionResult | null>;
}

/**
 * No-op provider: returns `null` for everything. Used whenever no real provider
 * is configured. Keeps the transcription path safe-by-default.
 */
export class DisabledTranscriptionProvider implements TranscriptionProvider {
  async transcribe(): Promise<TranscriptionResult | null> {
    return null;
  }
}

const disabledProvider = new DisabledTranscriptionProvider();

/**
 * STUB — OpenAI transcription provider. NOT implemented yet.
 *
 * When wiring the real call:
 *  - Read the API key from `process.env.OPENAI_API_KEY` (do NOT hardcode).
 *  - POST the audio to the OpenAI transcription endpoint
 *    (`https://api.openai.com/v1/audio/transcriptions`) as multipart/form-data
 *    with `model` (e.g. TRANSCRIPTION_MODELS.OPENAI_GPT4O_TRANSCRIBE) and the
 *    audio file built from `input.audio` + `input.mimeType`. Pass `language`
 *    derived from `input.languageHint` when present.
 *  - Apply a request TIMEOUT (e.g. AbortController, ~60s) and a small RETRY
 *    with backoff for 429/5xx; on terminal failure return `null` (never throw),
 *    so the caller degrades gracefully.
 *  - Map the response to `TranscriptionResult` ({ text, language?, durationSec?,
 *    model }). Record audit usage (a future lib/transcription/log.ts seam).
 */
export class OpenAiTranscriptionProvider implements TranscriptionProvider {
  async transcribe(_input: TranscriptionInput): Promise<TranscriptionResult | null> {
    void _input;
    // TODO(#3): implement OpenAI call (see class doc). Until then, fail safe.
    throw new Error("OpenAiTranscriptionProvider not implemented yet");
  }
}

/**
 * STUB — Google Gemini transcription provider. NOT implemented yet.
 *
 * When wiring the real call:
 *  - Read the API key from `process.env.GOOGLE_API_KEY` (do NOT hardcode).
 *  - Call the Gemini `generateContent` endpoint with an inline audio part
 *    (base64 from `input.audio` + `input.mimeType`) and a transcription prompt;
 *    use TRANSCRIPTION_MODELS.GEMINI_FLASH (or `input.model`). Bias with
 *    `input.languageHint` when present.
 *  - Apply a request TIMEOUT (AbortController) and a small RETRY/backoff for
 *    429/5xx; on terminal failure return `null` (never throw).
 *  - Map the response to `TranscriptionResult`. Record audit usage (future
 *    lib/transcription/log.ts seam).
 */
export class GeminiTranscriptionProvider implements TranscriptionProvider {
  async transcribe(_input: TranscriptionInput): Promise<TranscriptionResult | null> {
    void _input;
    // TODO(#3): implement Gemini call (see class doc). Until then, fail safe.
    throw new Error("GeminiTranscriptionProvider not implemented yet");
  }
}

/** Normalizes the configured provider kind from env, or null if none/unknown. */
function resolveProviderKind(): TranscriptionProviderKind | null {
  const raw = process.env.TRANSCRIPTION_PROVIDER?.trim().toLowerCase();
  if (raw === "openai" || raw === "gemini") {
    return raw;
  }
  return null;
}

/** Whether the configured provider also has its credential env present. */
function hasCredential(kind: TranscriptionProviderKind): boolean {
  if (kind === "openai") {
    return Boolean(process.env.OPENAI_API_KEY);
  }
  // gemini
  return Boolean(process.env.GOOGLE_API_KEY);
}

/**
 * Whether a real transcription provider is configured AND has its credential.
 * Analogous to `isAiProviderConfigured`. Today the concrete providers are stubs,
 * so even when this returns true the calls still throw "not implemented" — this
 * getter exists so the plumbing is complete and ready for the real wiring.
 */
export function isTranscriptionConfigured(): boolean {
  const kind = resolveProviderKind();
  return kind !== null && hasCredential(kind);
}

/**
 * Factory + injection point. Returns the disabled noop unless a known provider
 * is selected via `TRANSCRIPTION_PROVIDER` AND its credential env is present.
 *
 * The concrete providers are currently stubs (throw "not implemented"); the
 * factory wiring is intentionally complete so plugging in a real implementation
 * later is a one-line change inside the matching branch.
 */
export function getTranscriptionProvider(): TranscriptionProvider {
  const kind = resolveProviderKind();
  if (kind === null || !hasCredential(kind)) {
    return disabledProvider;
  }
  if (kind === "openai") {
    return new OpenAiTranscriptionProvider();
  }
  return new GeminiTranscriptionProvider();
}
