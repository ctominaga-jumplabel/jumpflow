/**
 * Feature flag for the agnostic audio-transcription seam (Melhoria #3).
 *
 * Edge-safe: only reads `process.env`. Off by default — when off, no real
 * transcription runs and `transcribeAudio` returns an honest
 * `{ ok: false, reason: "DISABLED" }` (not an error). The UI integration (e.g.
 * Horas) lives in a separate PR and is responsible for hiding/disabling its
 * voice controls when this flag is off.
 *
 * To enable locally, set in the env:
 *   NEXT_PUBLIC_TRANSCRIPTION=true   # turn the seam on
 *   TRANSCRIPTION_PROVIDER=openai    # or "gemini" (server-only)
 *   OPENAI_API_KEY=...               # or GOOGLE_API_KEY=... (server-only)
 */

function isEnabled(value: string | undefined): boolean {
  return value === "true" || value === "1";
}

/** Whether the transcription seam is enabled (off by default, edge-safe). */
export function isTranscriptionEnabled(): boolean {
  return isEnabled(process.env.NEXT_PUBLIC_TRANSCRIPTION);
}
