"use client";

export interface NathaliaVoiceReferenceAsset {
  format: "mp3" | "opus" | "wav";
  src: string;
  mimeType: string;
}

export interface NathaliaVoiceReference {
  id: string;
  displayName: string;
  sourceFile: string;
  durationMs: number;
  sampleRateHz: number;
  channels: 1 | 2;
  assets: NathaliaVoiceReferenceAsset[];
  consentRequired: true;
  usage: "reference-sample";
}

const NATH_REFERENCE_AUDIO_BASE_URL = "/nathalia/audio/nath-reference";

export const nathaliaVoiceReference: NathaliaVoiceReference = {
  id: "nath-ptt-20250610-wa0002",
  displayName: "Voz da Nath - amostra 2025-06-10",
  sourceFile: "audios/PTT-20250610-WA0002.wav",
  durationMs: 37214,
  sampleRateHz: 48000,
  channels: 1,
  consentRequired: true,
  usage: "reference-sample",
  assets: [
    {
      format: "mp3",
      src: `${NATH_REFERENCE_AUDIO_BASE_URL}/PTT-20250610-WA0002.mp3`,
      mimeType: "audio/mpeg",
    },
    {
      format: "opus",
      src: `${NATH_REFERENCE_AUDIO_BASE_URL}/PTT-20250610-WA0002.opus`,
      mimeType: "audio/ogg; codecs=opus",
    },
    {
      format: "wav",
      src: `${NATH_REFERENCE_AUDIO_BASE_URL}/PTT-20250610-WA0002.wav`,
      mimeType: "audio/wav",
    },
  ],
};

export function preferredNathaliaVoiceReferenceAsset(): NathaliaVoiceReferenceAsset {
  return nathaliaVoiceReference.assets[0];
}
