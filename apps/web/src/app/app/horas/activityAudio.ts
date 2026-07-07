/**
 * Constantes/tipos da transcrição por voz da descrição de Horas, partilhados
 * entre o arquivo de actions (`"use server"`) e seus testes. Mantidos FORA de
 * `actions.ts` porque um módulo `"use server"` só pode exportar funções async —
 * uma const em runtime ali quebra o módulo na avaliação no servidor
 * ("A \"use server\" file can only export async functions, found number").
 * Mesmo padrão de `lib/auth/messages.ts`.
 */

/** Resultado da transcrição devolvido ao cliente (não é um ActionResult). */
export type TranscribeActivityAudioResult =
  | { ok: true; text: string }
  | { ok: false; reason: string; message: string };

/**
 * Teto específico desta feature (descrição de Horas), MENOR que o
 * `MAX_AUDIO_BYTES` (25 MB) do seam: a fala de uma descrição é curta, e o
 * caminho inline do Gemini rejeita áudio grande (gerando um NO_RESULT confuso).
 * Cortamos AQUI, antes de materializar/encodar o buffer, com uma mensagem clara.
 * 10 MB de áudio comprimido (webm/opus) cobre vários minutos de fala.
 */
export const ACTIVITY_AUDIO_MAX_BYTES = 10 * 1024 * 1024;
