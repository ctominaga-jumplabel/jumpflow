"use client";

import type { NathaliaContextKey, NathaliaStateKey } from "./nathaliaTypes";

export interface NathaliaSpeechPoint {
  /** Stable id for analytics, testing and future audio cache filenames. */
  id: string;
  /** Product area where this line is useful. */
  context: NathaliaContextKey;
  /** Optional DOM anchor highlighted by a guided tour. */
  targetId?: string;
  /** Visual state/video used while the line is presented. */
  state: NathaliaStateKey;
  /** Short visible title. */
  title: string;
  /** Short speech-bubble text. */
  message: string;
  /** Natural TTS script. Defaults to `message` when omitted. */
  voiceText?: string;
  /** Optional cached natural voice generated offline. */
  audioSrc?: string;
}

const NATH_CUSTOM_REVIEW_AUDIO_BASE_URL = "/nathalia/audio/nath-custom-review";
const NATH_CUSTOM_REVIEW_AUDIO_VERSION = "v=nath-20260706-ui2";

export const nathaliaSpeechPoints: Partial<Record<NathaliaContextKey, NathaliaSpeechPoint[]>> = {
  hours: [
    {
      id: "hours-period",
      context: "hours",
      targetId: "horas-periodo",
      state: "pointing",
      title: "1 - Período",
      message: "Escolha aqui a semana que deseja revisar.",
      voiceText: "Escolha aqui a semana que deseja revisar.",
      audioSrc: `${NATH_CUSTOM_REVIEW_AUDIO_BASE_URL}/01-hours-period.mp3?${NATH_CUSTOM_REVIEW_AUDIO_VERSION}`,
    },
    {
      id: "hours-new-entry",
      context: "hours",
      targetId: "horas-novo",
      state: "pointing",
      title: "2 - Novo lançamento",
      message: "Clique aqui para criar um novo lançamento.",
      voiceText: "Clique aqui para criar um novo lançamento.",
      audioSrc: `${NATH_CUSTOM_REVIEW_AUDIO_BASE_URL}/02-hours-new-entry.mp3?${NATH_CUSTOM_REVIEW_AUDIO_VERSION}`,
    },
    {
      id: "hours-grid",
      context: "hours",
      targetId: "horas-grade",
      state: "pointing",
      title: "3 - Lançamentos",
      message: "Revise aqui os lançamentos salvos da semana.",
      voiceText: "Revise aqui os lançamentos salvos da semana.",
      audioSrc: `${NATH_CUSTOM_REVIEW_AUDIO_BASE_URL}/03-hours-grid.mp3?${NATH_CUSTOM_REVIEW_AUDIO_VERSION}`,
    },
    {
      id: "hours-status",
      context: "hours",
      targetId: "horas-status",
      state: "success",
      title: "4 - Status",
      message: "Pronto. Agora acompanhe o status dos apontamentos.",
      voiceText: "Pronto. Agora acompanhe o status dos apontamentos.",
      audioSrc: `${NATH_CUSTOM_REVIEW_AUDIO_BASE_URL}/04-hours-status.mp3?${NATH_CUSTOM_REVIEW_AUDIO_VERSION}`,
    },
  ],
  approvals: [
    {
      id: "approvals-queue",
      context: "approvals",
      targetId: "aprovacoes-fila",
      state: "pointing",
      title: "1 - Fila",
      message: "Analise aqui os itens enviados para aprovação.",
      voiceText: "Analise aqui os itens enviados para aprovação.",
      audioSrc: `${NATH_CUSTOM_REVIEW_AUDIO_BASE_URL}/05-approvals-queue.mp3?${NATH_CUSTOM_REVIEW_AUDIO_VERSION}`,
    },
    {
      id: "approvals-actions",
      context: "approvals",
      targetId: "aprovacoes-acoes",
      state: "success",
      title: "2 - Decisão",
      message: "Finalize usando aprovar ou reprovar. Tudo fica registrado.",
      voiceText: "Finalize usando aprovar ou reprovar. Tudo fica registrado.",
      audioSrc: `${NATH_CUSTOM_REVIEW_AUDIO_BASE_URL}/06-approvals-actions.mp3?${NATH_CUSTOM_REVIEW_AUDIO_VERSION}`,
    },
  ],
};

export function speechPointsForContext(context: NathaliaContextKey): NathaliaSpeechPoint[] {
  return nathaliaSpeechPoints[context] ?? [];
}

export function speechPointForTourStep(
  tourId: string,
  stepIndex: number,
): NathaliaSpeechPoint | undefined {
  const points = nathaliaSpeechPoints[tourId as NathaliaContextKey];
  return points?.[stepIndex];
}

export function textToVoice(point: NathaliaSpeechPoint): string {
  return point.voiceText ?? point.message;
}

export function audioForSpeechPoint(point: NathaliaSpeechPoint): string | undefined {
  return point.audioSrc;
}
