/**
 * Reusable audio-transcription entry point (Melhoria #3).
 *
 * Not coupled to Horas or any specific feature: any server caller can use it.
 * Responsibilities:
 *  - check the feature flag (off -> honest DISABLED result, NOT an error);
 *  - validate the audio mimeType and size before touching any provider;
 *  - delegate to the configured provider via `getTranscriptionProvider()`;
 *  - return a discriminated result so callers degrade gracefully.
 *
 * SECURITY: this function does NOT authenticate. The caller is responsible for
 * calling `requireUser()` (and any role/permission check) BEFORE invoking
 * `transcribeAudio`, exactly like the other server-side lib helpers.
 */

import { isTranscriptionEnabled } from "./flags";
import {
  getTranscriptionProvider,
  type TranscriptionInput,
  type TranscriptionResult,
} from "./provider";

/** 25 MB — aligned with common provider upload limits (e.g. OpenAI Whisper). */
export const MAX_AUDIO_BYTES = 25 * 1024 * 1024;

/** Audio MIME types accepted by the seam. */
export const ALLOWED_AUDIO_MIME_TYPES = [
  "audio/webm",
  "audio/mpeg",
  "audio/mp3",
  "audio/wav",
  "audio/x-wav",
  "audio/mp4",
  "audio/m4a",
  "audio/x-m4a",
  "audio/ogg",
] as const;

export type TranscribeReason =
  /** Feature flag is off — degrade gracefully, this is not an error. */
  | "DISABLED"
  /** mimeType not in the allow-list. */
  | "INVALID_TYPE"
  /** audio missing/empty or above MAX_AUDIO_BYTES. */
  | "INVALID_SIZE"
  /** Provider returned null (unconfigured/failed) — no transcription available. */
  | "NO_RESULT";

export type TranscribeOutcome =
  | { ok: true; text: string; language?: string; durationSec?: number; model?: string }
  | { ok: false; reason: TranscribeReason; message: string };

/** Computes the byte length of the incoming audio without copying when possible. */
function audioByteLength(input: TranscriptionInput): number {
  const { audio, audioIsBase64 } = input;
  if (typeof audio === "string") {
    if (audioIsBase64) {
      // Approximate decoded size from base64 length (4 chars -> 3 bytes).
      const trimmed = audio.replace(/=+$/, "");
      return Math.floor((trimmed.length * 3) / 4);
    }
    return Buffer.byteLength(audio, "utf8");
  }
  return audio.byteLength;
}

/**
 * Transcribes audio through the configured provider.
 *
 * Returns a discriminated outcome — never throws for the expected cases
 * (disabled / invalid input / no provider). Callers must authenticate first.
 */
export async function transcribeAudio(
  input: TranscriptionInput,
): Promise<TranscribeOutcome> {
  // 1. Flag gate — honest, not an error.
  if (!isTranscriptionEnabled()) {
    return {
      ok: false,
      reason: "DISABLED",
      message: "Transcrição de áudio está desativada.",
    };
  }

  // 2. Validate MIME type.
  const mimeType = input.mimeType?.trim().toLowerCase();
  if (!mimeType || !ALLOWED_AUDIO_MIME_TYPES.includes(mimeType as never)) {
    return {
      ok: false,
      reason: "INVALID_TYPE",
      message: `Tipo de áudio não suportado: "${input.mimeType ?? ""}". Aceitos: ${ALLOWED_AUDIO_MIME_TYPES.join(", ")}.`,
    };
  }

  // 3. Validate size (non-empty and within the cap).
  const bytes = audioByteLength(input);
  if (bytes <= 0) {
    return {
      ok: false,
      reason: "INVALID_SIZE",
      message: "Áudio vazio.",
    };
  }
  if (bytes > MAX_AUDIO_BYTES) {
    return {
      ok: false,
      reason: "INVALID_SIZE",
      message: `Áudio excede o limite de ${Math.floor(MAX_AUDIO_BYTES / (1024 * 1024))} MB.`,
    };
  }

  // 4. Delegate to the provider (disabled noop by default).
  const provider = getTranscriptionProvider();
  const result: TranscriptionResult | null = await provider.transcribe({
    ...input,
    mimeType,
  });

  if (!result) {
    return {
      ok: false,
      reason: "NO_RESULT",
      message: "Nenhuma transcrição disponível.",
    };
  }

  return {
    ok: true,
    text: result.text,
    language: result.language,
    durationSec: result.durationSec,
    model: result.model,
  };
}
