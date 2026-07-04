/**
 * Feature flags for Checkpoint / 1-on-1 (Melhoria #4).
 *
 * Edge-safe: only reads `process.env` (NEXT_PUBLIC_* so they are inlined for the
 * client too). All default to OFF. This mirrors `lib/feedback/flags.ts` and
 * `lib/feed/flags.ts`.
 *
 * - CHECKPOINT  gates the navigation item AND the `/app/checkpoints` route (when
 *   off, the item is hidden and the page returns notFound). This is FATIA 2.
 * - VOICE       gates the audio capture / transcription path (FATIA 3). Off here.
 * - AI          gates the insight extraction path (FATIA 4). Off here.
 *
 * To enable locally, set in the env:
 *   NEXT_PUBLIC_FEATURE_CHECKPOINT=true   # nav + rota de Checkpoints/1-on-1
 *   NEXT_PUBLIC_CHECKPOINT_VOICE=true     # F3 — registrar por voz (transcrição)
 *   NEXT_PUBLIC_CHECKPOINT_AI=true        # F4 — extrair insights por IA
 */

function isEnabled(value: string | undefined): boolean {
  return value === "true" || value === "1";
}

/** Gate de nav/rota do módulo Checkpoint / 1-on-1 (off por padrão). */
export function isCheckpointEnabled(): boolean {
  return isEnabled(process.env.NEXT_PUBLIC_FEATURE_CHECKPOINT);
}

/**
 * F3 — registrar checkpoint por voz com transcrição (atrás de flag, off).
 *
 * IMPORTANTE: esta flag gateia APENAS a UI/fluxo de voz do Checkpoint (capturar
 * áudio, exibir o player, disparar a action de transcrição). Ela NÃO liga a
 * transcrição real por si só. Para o áudio virar texto de verdade é preciso
 * TAMBÉM a flag GLOBAL de transcrição — `isTranscriptionEnabled()`
 * (`lib/transcription/flags.ts`) — e um provider selecionado via
 * `TRANSCRIPTION_PROVIDER` com a credencial correspondente. Com a voz ligada mas
 * a transcrição global desligada/sem provider, o seam `transcribeAudio` devolve
 * DISABLED/NO_RESULT e a action degrada honestamente (status → NONE,
 * `unavailable: true`), sem inventar texto.
 */
export function isCheckpointVoiceEnabled(): boolean {
  return isEnabled(process.env.NEXT_PUBLIC_CHECKPOINT_VOICE);
}

/** F4 — extrair insights (skills/oportunidades/cases) por IA (atrás de flag, off). */
export function isCheckpointAiEnabled(): boolean {
  return isEnabled(process.env.NEXT_PUBLIC_CHECKPOINT_AI);
}

export interface CheckpointFlags {
  enabled: boolean;
  voice: boolean;
  ai: boolean;
}

export function getCheckpointFlags(): CheckpointFlags {
  return {
    enabled: isCheckpointEnabled(),
    voice: isCheckpointVoiceEnabled(),
    ai: isCheckpointAiEnabled(),
  };
}
