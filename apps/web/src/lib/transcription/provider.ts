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
    // TODO(#3): implement OpenAI call (see class doc). Until then, degrade
    // honestly: the provider contract requires NOT throwing (callers treat null
    // as "no transcription available"), so return null instead of an error.
    return null;
  }
}

/** Default Gemini model for transcription; must accept audio inline_data. */
const DEFAULT_GEMINI_MODEL = TRANSCRIPTION_MODELS.GEMINI_FLASH;

/** Request timeout for the Gemini call (ms). Speech is short; fail fast. */
const GEMINI_TIMEOUT_MS = 30_000;

/** Base host for the Gemini REST API (generateContent). */
const GEMINI_API_BASE =
  "https://generativelanguage.googleapis.com/v1beta/models";

/**
 * Inline audio is capped by the request payload size. Gemini's `inline_data`
 * path is meant for SMALL audio (the whole request must stay under ~20 MB, and
 * is billed/encoded as base64, so the practical audio ceiling is a few MB). For
 * anything larger the Gemini File API (`media.upload` + `file_data`) is the
 * supported route.
 *
 * TODO(#3): add a File API path for audio above `GEMINI_INLINE_MAX_BYTES`
 * (upload → poll ACTIVE → reference via `file_data.file_uri`). Until then we
 * degrade honestly (return `null`) for oversized inline audio.
 */
export const GEMINI_INLINE_MAX_BYTES = 18 * 1024 * 1024;

/** Shape of the env knobs the Gemini provider reads (kept tiny and explicit). */
function geminiApiKey(): string | undefined {
  // Accept either name; GOOGLE_API_KEY is the documented one, GEMINI_API_KEY is
  // a common alias developers reach for.
  return process.env.GOOGLE_API_KEY ?? process.env.GEMINI_API_KEY;
}

function geminiModel(override?: string): string {
  const fromEnv = process.env.GEMINI_TRANSCRIPTION_MODEL?.trim();
  return override?.trim() || fromEnv || DEFAULT_GEMINI_MODEL;
}

/** Normalize any accepted audio input into a base64 string for inline_data. */
function toBase64(audio: TranscriptionInput["audio"], isBase64?: boolean): string {
  if (typeof audio === "string") {
    return isBase64 ? audio : Buffer.from(audio, "utf8").toString("base64");
  }
  return Buffer.from(audio).toString("base64");
}

/** Decoded byte length of the audio (to enforce the inline ceiling). */
function decodedByteLength(base64: string): number {
  const trimmed = base64.replace(/=+$/, "");
  return Math.floor((trimmed.length * 3) / 4);
}

/** Minimal typing of the Gemini generateContent response we read from. */
interface GeminiResponse {
  candidates?: Array<{
    content?: { parts?: Array<{ text?: string }> };
  }>;
}

/**
 * Google Gemini transcription provider (real call, portable `fetch` — no SDK).
 *
 * Sends the audio as an inline_data part (mime_type + base64) plus a text part
 * instructing a verbatim pt-BR transcription, and reads back
 * `candidates[0].content.parts[*].text`. Reads the key from `GOOGLE_API_KEY`
 * (or `GEMINI_API_KEY`) and the model from `GEMINI_TRANSCRIPTION_MODEL` (default
 * `gemini-2.0-flash`). Applies a 30s AbortController timeout. Degrades honestly:
 * on ANY failure (no key, oversized inline audio, HTTP error, timeout, empty
 * candidate) it returns `null` so the caller falls back to manual typing.
 */
export class GeminiTranscriptionProvider implements TranscriptionProvider {
  async transcribe(input: TranscriptionInput): Promise<TranscriptionResult | null> {
    const apiKey = geminiApiKey();
    if (!apiKey) {
      // No credential — never throw, degrade like the disabled provider.
      return null;
    }

    const base64 = toBase64(input.audio, input.audioIsBase64);
    if (decodedByteLength(base64) > GEMINI_INLINE_MAX_BYTES) {
      // Too large for the inline path; the File API route is a future TODO.
      console.warn(
        "[transcription] audio exceeds Gemini inline limit; File API not wired yet",
      );
      return null;
    }

    const model = geminiModel(input.model);
    const language = input.languageHint?.trim() || "pt-BR";
    const prompt =
      `Transcreva o áudio em ${language === "pt-BR" ? "português do Brasil" : language}. ` +
      "Retorne SOMENTE a transcrição literal do que foi falado, sem comentários, " +
      "sem aspas e sem rótulos.";

    const body = {
      contents: [
        {
          role: "user",
          parts: [
            { text: prompt },
            {
              inline_data: {
                mime_type: input.mimeType,
                data: base64,
              },
            },
          ],
        },
      ],
      // Deterministic, transcription-oriented decoding.
      generationConfig: { temperature: 0 },
    };

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), GEMINI_TIMEOUT_MS);
    try {
      const response = await fetch(
        `${GEMINI_API_BASE}/${encodeURIComponent(model)}:generateContent`,
        {
          method: "POST",
          // Key in a header (not the URL) so it never lands in request logs.
          headers: {
            "Content-Type": "application/json",
            "x-goog-api-key": apiKey,
          },
          body: JSON.stringify(body),
          signal: controller.signal,
        },
      );

      if (!response.ok) {
        console.error(
          `[transcription] Gemini HTTP ${response.status} ${response.statusText}`,
        );
        return null;
      }

      const json = (await response.json()) as GeminiResponse;
      const parts = json.candidates?.[0]?.content?.parts ?? [];
      const text = parts
        .map((part) => part.text ?? "")
        .join("")
        .trim();

      if (!text) {
        return null;
      }
      return { text, language, model };
    } catch (error) {
      // Timeout (AbortError) or network failure — degrade honestly.
      console.error("[transcription] Gemini request failed", error);
      return null;
    } finally {
      clearTimeout(timeout);
    }
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
  // gemini — accept GOOGLE_API_KEY (documented) or GEMINI_API_KEY (alias).
  return Boolean(process.env.GOOGLE_API_KEY ?? process.env.GEMINI_API_KEY);
}

/**
 * Whether a real transcription provider is configured AND has its credential.
 * Analogous to `isAiProviderConfigured`. The Gemini provider is now a real call;
 * OpenAI is still a stub.
 */
export function isTranscriptionConfigured(): boolean {
  const kind = resolveProviderKind();
  return kind !== null && hasCredential(kind);
}

/**
 * Factory + injection point. Returns the disabled noop unless a known provider
 * is selected via `TRANSCRIPTION_PROVIDER` AND its credential env is present.
 *
 * `gemini` returns the real `GeminiTranscriptionProvider` (a portable `fetch`
 * call); `openai` is still a stub. When neither the provider kind nor the
 * matching credential is configured the disabled noop is returned, so the
 * transcription path is safe-by-default.
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
