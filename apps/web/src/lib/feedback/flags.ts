/**
 * Feature flags for the Feedback Contínuo voice/AI increments (US15.04/15.05).
 *
 * Edge-safe: only reads `process.env` (NEXT_PUBLIC_* so they are inlined for the
 * client too). Both default to OFF — when off, the UI shows the prepared
 * controls as "em breve" / disabled and no real transcription/AI runs. The
 * Prisma columns `audioStorageKey`/`transcription`/`transcriptionStatus` already
 * exist; the provider logic stays out of this module until the flag is enabled.
 *
 * To enable locally, set in the env:
 *   NEXT_PUBLIC_FEEDBACK_VOICE=true   # US15.04 — registrar feedback por voz
 *   NEXT_PUBLIC_FEEDBACK_AI=true      # US15.05 — polir feedback com IA
 */

function isEnabled(value: string | undefined): boolean {
  return value === "true" || value === "1";
}

/** US15.04 — feedback por voz com transcrição (atrás de flag, off por padrão). */
export function isFeedbackVoiceEnabled(): boolean {
  return isEnabled(process.env.NEXT_PUBLIC_FEEDBACK_VOICE);
}

/** US15.05 — polir feedback com IA (atrás de flag, off por padrão). */
export function isFeedbackAiEnabled(): boolean {
  return isEnabled(process.env.NEXT_PUBLIC_FEEDBACK_AI);
}

export interface FeedbackFlags {
  voice: boolean;
  ai: boolean;
}

export function getFeedbackFlags(): FeedbackFlags {
  return { voice: isFeedbackVoiceEnabled(), ai: isFeedbackAiEnabled() };
}
