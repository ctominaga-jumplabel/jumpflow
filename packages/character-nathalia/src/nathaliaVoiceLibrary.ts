"use client";

/**
 * Nathal.IA recorded-voice library.
 *
 * The natural voice shipped for Nathal.IA is a set of pre-recorded clips (the
 * `nath-custom-review` pack). This module is the single source of truth that
 * maps **what she says** to **which recorded file plays**, so any spoken line
 * whose text matches a recording is voiced with her real voice — no synthetic
 * TTS. Lines with no recording stay silent (the mouth still animates).
 *
 * Texts here are the exact transcripts from
 * `public/nathalia/audio/nath-custom-review/manifest.json`. To voice a new
 * moment, make the spoken/displayed text equal one of these lines (or add a new
 * clip + entry here). Matching is done on a normalized form (case/emoji/spacing
 * insensitive) so small cosmetic differences still resolve.
 *
 * Clips 01–06 are the guided-tour steps (also wired via `nathaliaSpeechCatalog`).
 * Clip 27 (voice-consent) is intentionally excluded — it is a recording-session
 * artifact, never a product line.
 */

const BASE_URL = "/nathalia/audio/nath-custom-review";
/** Cache-busting version, kept in sync with `nathaliaSpeechCatalog.ts`. */
const VERSION = "v=nath-20260706-ui2";

export interface NathaliaVoiceClip {
  /** Stable key (matches the audio file stem). */
  key: string;
  /** Exact transcript of the recording. */
  text: string;
  /** Public URL of the recorded audio (with cache-busting version). */
  audioSrc: string;
}

function clip(file: string, text: string): NathaliaVoiceClip {
  return { key: file, text, audioSrc: `${BASE_URL}/${file}.mp3?${VERSION}` };
}

/** The recorded voice pack (excludes the consent clip #27). */
export const NATHALIA_VOICE_CLIPS: readonly NathaliaVoiceClip[] = [
  clip("01-hours-period", "Escolha aqui a semana que deseja revisar."),
  clip("02-hours-new-entry", "Clique aqui para criar um novo lançamento."),
  clip("03-hours-grid", "Revise aqui os lançamentos salvos da semana."),
  clip("04-hours-status", "Pronto. Agora acompanhe o status dos apontamentos."),
  clip("05-approvals-queue", "Analise aqui os itens enviados para aprovação."),
  clip("06-approvals-actions", "Finalize usando aprovar ou reprovar. Tudo fica registrado."),
  clip("07-welcome-jumpflow", "Oi, eu sou a Nathal.IA. Vou te ajudar a navegar pelo JumpFlow."),
  clip("08-deixa-comigo", "Pode deixar comigo. Vou te mostrar o caminho."),
  clip("09-pontos-importantes", "Encontrei alguns pontos importantes para revisar."),
  clip("10-conferir-informacoes", "Antes de continuar, vale conferir essas informações."),
  clip("11-tudo-certo", "Tudo certo por aqui. Você pode seguir com segurança."),
  clip("12-nao-encontrei", "Hmm, não encontrei isso agora. Quer tentar de outro jeito?"),
  clip("13-rascunho", "Esse lançamento ainda está em rascunho."),
  clip("14-semana-apontamentos", "A semana selecionada já possui apontamentos salvos."),
  clip("15-revisar-detalhes", "Você pode revisar os detalhes antes de enviar."),
  clip("16-status-aprovacao", "Quando terminar, acompanhe o status da aprovação."),
  clip("17-projeto-fechamento", "Esse projeto precisa de atenção no fechamento."),
  clip("18-filtros", "Os filtros ajudam a encontrar exatamente o que você precisa."),
  clip("19-fila-aprovacao", "A fila de aprovação mostra os itens pendentes."),
  clip("20-relatorios", "Os relatórios consolidam horas, despesas e indicadores."),
  clip("21-explicar-partes", "Vou explicar em partes, bem rápido."),
  clip("22-primeiro-periodo", "Primeiro, confira o período selecionado."),
  clip("23-depois-dados", "Depois, revise os dados principais."),
  clip("24-por-fim-salve", "Por fim, salve ou envie quando estiver tudo certo."),
  clip("25-sucesso", "Boa! A ação foi concluída com sucesso."),
  clip("26-atencao-pendencia", "Atenção: existe uma pendência antes de continuar."),
];

/** Convenience: the spoken welcome line played on first open. */
export const NATHALIA_WELCOME_VOICE = NATHALIA_VOICE_CLIPS.find(
  (c) => c.key === "07-welcome-jumpflow",
) as NathaliaVoiceClip;

/**
 * Normalize a line for matching: lowercase, strip emoji/symbols, drop most
 * punctuation and collapse whitespace. Keeps letters (incl. accents), digits
 * and spaces so "Bora! Vou destacar... 👇" and "bora vou destacar" compare equal.
 */
export function normalizeVoiceText(text: string): string {
  return text
    .toLowerCase()
    .normalize("NFC")
    // Keep letters (unicode), numbers and whitespace; drop everything else.
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

const BY_NORMALIZED_TEXT: ReadonlyMap<string, string> = new Map(
  NATHALIA_VOICE_CLIPS.map((c) => [normalizeVoiceText(c.text), c.audioSrc]),
);

const BY_KEY: ReadonlyMap<string, NathaliaVoiceClip> = new Map(
  NATHALIA_VOICE_CLIPS.map((c) => [c.key, c]),
);

/**
 * Recorded audio URL for a spoken line, or `undefined` when nothing matches
 * (caller should then stay silent / fall back to the active voice provider).
 */
export function audioForVoiceText(text: string): string | undefined {
  return BY_NORMALIZED_TEXT.get(normalizeVoiceText(text));
}

/** The full clip (text + audio) for a stable key, or `undefined`. */
export function clipForVoiceKey(key: string): NathaliaVoiceClip | undefined {
  return BY_KEY.get(key);
}
