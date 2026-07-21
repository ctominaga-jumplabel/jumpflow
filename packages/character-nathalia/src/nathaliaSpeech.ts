"use client";

/**
 * Nathal.IA voice.
 *
 * The **only real voice** is the recorded natural voice shipped as cached audio
 * files (see {@link speakNathaliaAudio} / {@link voiceNathaliaCached}). The old
 * browser-TTS ("robotic") voice has been removed from the entire application.
 *
 * A small **voice-provider seam** is kept so a real cloud voice (Azure /
 * ElevenLabs / OpenAI…) can be dropped in later with `setNathaliaVoiceProvider(...)`
 * — see `docs/nathalia/VOICE.md`. Until one is installed the default is a
 * {@link SilentVoiceProvider} that emits no audio, so lines without a recorded
 * file are voiceless (the mouth still animates via the store timer baseline)
 * instead of falling back to synthetic speech.
 *
 * The provider reports lifecycle to the store: `onStart`→speaking, `onViseme`→
 * the current mouth shape (drives precise lip-sync), `onEnd`→idle. A timer
 * baseline (in the store) still guarantees mouth movement when there is no audio.
 *
 * Client-only; every entry point guards on `typeof window`.
 */
import { setNathaliaSpeaking, setNathaliaViseme, startNathaliaSpeaking } from "./nathaliaStore";
import { visemeForChar } from "./nathaliaExpressions";
import { audioForVoiceText, clipForVoiceKey } from "./nathaliaVoiceLibrary";
import type { NathaliaStateKey } from "./nathaliaTypes";

const MUTE_KEY = "nathalia:muted";
let cachedAudio: HTMLAudioElement | null = null;
let cachedAudioTimer: ReturnType<typeof setInterval> | null = null;

interface CachedSpeechCallbacks {
  onEnd?: () => void;
  onBlocked?: () => void;
  fallbackToProvider?: boolean;
}

/** What every voice provider must implement so the avatar can speak + lip-sync. */
export interface NathaliaVoiceProvider {
  /** Whether this provider can speak in the current environment. */
  isAvailable(): boolean;
  /**
   * Speak `text`. Must call `onStart` when audio begins, `onViseme(key)` as the
   * mouth shape changes (drives lip-sync), and `onEnd` when it finishes/errors.
   */
  speak(
    text: string,
    cb: { onStart: () => void; onViseme: (viseme: string) => void; onEnd: () => void },
  ): void;
  /** Stop any current speech. */
  cancel(): void;
}

// --------------------------------------------------------------------------
// Default provider: silent. The synthetic browser-TTS voice was removed; until
// a real cloud voice is installed via `setNathaliaVoiceProvider`, lines with no
// recorded audio simply don't speak (the mouth still animates from the store
// timer baseline). This keeps the seam intact without emitting robotic speech.
// --------------------------------------------------------------------------

class SilentVoiceProvider implements NathaliaVoiceProvider {
  isAvailable(): boolean {
    return false;
  }

  speak(
    _text: string,
    _cb: { onStart: () => void; onViseme: (v: string) => void; onEnd: () => void },
  ): void {
    /* no-op: no synthetic voice */
  }

  cancel(): void {
    /* no-op */
  }
}

let provider: NathaliaVoiceProvider = new SilentVoiceProvider();

/** Swap the voice provider (e.g. a cloud TTS). See `docs/nathalia/VOICE.md`. */
export function setNathaliaVoiceProvider(next: NathaliaVoiceProvider): void {
  provider.cancel();
  provider = next;
}

/**
 * Whether Nathal.IA can voice anything in this environment — an installed voice
 * provider, or (the default) the recorded natural-voice audio files. Used to
 * decide if the mute control should be shown.
 */
export function isSpeechSupported(): boolean {
  return provider.isAvailable() || (typeof window !== "undefined" && typeof Audio !== "undefined");
}

export function isNathaliaMuted(): boolean {
  if (typeof window === "undefined") return false;
  try {
    return window.localStorage.getItem(MUTE_KEY) === "1";
  } catch {
    return false;
  }
}

export function setNathaliaMuted(muted: boolean): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(MUTE_KEY, muted ? "1" : "0");
  } catch {
    /* ignore */
  }
  if (muted) cancelNathaliaSpeech();
}

export function cancelNathaliaSpeech(): void {
  if (cachedAudioTimer) {
    clearInterval(cachedAudioTimer);
    cachedAudioTimer = null;
  }
  if (cachedAudio) {
    cachedAudio.pause();
    cachedAudio.currentTime = 0;
    cachedAudio = null;
  }
  provider.cancel();
  setNathaliaSpeaking(false);
}

/**
 * Speak a line through the active provider, driving lip-sync from the audio.
 * Returns `true` if speech started, `false` when unsupported/muted/empty.
 */
export function speakNathalia(text: string): boolean {
  const clean = text.trim();
  if (!provider.isAvailable() || isNathaliaMuted() || !clean) return false;
  provider.speak(clean, {
    onStart: () => setNathaliaSpeaking(true),
    onViseme: (v) => setNathaliaViseme(v),
    onEnd: () => setNathaliaSpeaking(false),
  });
  return true;
}

function startCachedAudioVisemes(text: string, durationMs?: number): void {
  let pos = 0;
  const chars = Math.max(1, text.trim().length);
  const intervalMs =
    typeof durationMs === "number" && Number.isFinite(durationMs) && durationMs > 0
      ? Math.min(150, Math.max(45, durationMs / chars))
      : 70;
  if (cachedAudioTimer) clearInterval(cachedAudioTimer);
  cachedAudioTimer = setInterval(() => {
    if (pos >= text.length) {
      setNathaliaViseme("rest");
      return;
    }
    setNathaliaViseme(visemeForChar(text[pos] ?? " "));
    pos += 1;
  }, intervalMs);
}

/**
 * Play a cached natural voice file. Falls back to Web Speech when the file is
 * unavailable or autoplay is blocked.
 */
export function speakNathaliaAudio(text: string, audioSrc: string): boolean {
  return speakNathaliaAudioWithCallbacks(text, audioSrc);
}

export function speakNathaliaAudioWithCallbacks(
  text: string,
  audioSrc: string,
  cb?: CachedSpeechCallbacks,
): boolean {
  const clean = text.trim();
  if (typeof window === "undefined" || isNathaliaMuted() || !clean || !audioSrc) return false;
  cancelNathaliaSpeech();
  const audio = new Audio(audioSrc);
  cachedAudio = audio;
  audio.preload = "auto";
  audio.onplay = () => {
    setNathaliaSpeaking(true);
    const durationMs =
      Number.isFinite(audio.duration) && audio.duration > 0 ? audio.duration * 1000 : undefined;
    startCachedAudioVisemes(clean, durationMs);
  };
  const finish = () => {
    if (cachedAudioTimer) {
      clearInterval(cachedAudioTimer);
      cachedAudioTimer = null;
    }
    if (cachedAudio === audio) cachedAudio = null;
    setNathaliaSpeaking(false);
    cb?.onEnd?.();
  };
  audio.onended = finish;
  audio.onerror = () => {
    finish();
    if (cb?.fallbackToProvider !== false) speakNathalia(clean);
  };
  const result = audio.play();
  if (typeof result?.catch === "function") {
    void result.catch(() => {
      finish();
      cb?.onBlocked?.();
      if (cb?.fallbackToProvider !== false) speakNathalia(clean);
    });
  }
  return true;
}

/**
 * Named voice cues for product events (fired while Nathal.IA is open/interacting).
 * Each maps to a recorded clip in the natural-voice pack.
 */
export type NathaliaVoiceCue =
  | "success" // action completed
  | "warning" // attention / pending
  | "not-found" // couldn't resolve the request
  | "navigation"; // taking the user somewhere

const CUE_CLIP: Record<NathaliaVoiceCue, string> = {
  success: "25-sucesso",
  warning: "26-atencao-pendencia",
  "not-found": "12-nao-encontrei",
  navigation: "08-deixa-comigo",
};

/** Brain answer sources that map to a spoken cue (else the line is silent). */
const SOURCE_CUE: Record<string, NathaliaVoiceCue> = {
  navigation: "navigation",
  fallback: "not-found",
};

/** Visual states that map to a spoken cue (affirmations layered over the reply). */
const STATE_CUE: Partial<Record<NathaliaStateKey, NathaliaVoiceCue>> = {
  success: "success",
  happy: "success",
  celebrate: "success",
  warning: "warning",
  error: "not-found",
};

/**
 * Play a recorded voice cue for a product event (success, warning, …). No-op
 * when the clip is missing or Nathal.IA is muted. The mouth animates for the
 * clip's duration. Use at real interaction moments (e.g. after submitting).
 */
export function voiceNathaliaCue(cue: NathaliaVoiceCue): void {
  const clip = clipForVoiceKey(CUE_CLIP[cue]);
  if (!clip) return;
  voiceNathaliaCachedWithCallbacks(clip.text, clip.audioSrc, { fallbackToProvider: false });
}

/** Hint describing a chat reply, so the right recorded voice can be chosen. */
export interface NathaliaReplyVoiceHint {
  /** Visual state the reply adopts. */
  state?: NathaliaStateKey;
  /** Where the answer came from (brain `source`). */
  source?: string;
}

/**
 * Voice a chat reply with the recorded natural voice. Resolution order:
 *   1) an exact recorded line for the text (keeps bubble == audio);
 *   2) a cue implied by the answer `source` (navigation/fallback);
 *   3) a cue implied by the visual `state` (success/warning/error);
 * otherwise it stays silent (mouth still animates via the timer baseline).
 */
export function voiceNathaliaReply(text: string, hint: NathaliaReplyVoiceHint = {}): void {
  const clean = text.trim();
  const exact = audioForVoiceText(clean);
  if (exact) {
    voiceNathaliaCachedWithCallbacks(clean, exact, { fallbackToProvider: false });
    return;
  }
  const cue =
    (hint.source ? SOURCE_CUE[hint.source] : undefined) ??
    (hint.state ? STATE_CUE[hint.state] : undefined);
  if (cue) {
    voiceNathaliaCue(cue);
    return;
  }
  startNathaliaSpeaking(Math.min(3500, Math.max(800, clean.length * 42)));
  speakNathalia(clean);
}

/**
 * Voice a reply. If the line matches a recorded natural-voice clip
 * ({@link audioForVoiceText}) it plays that audio; otherwise it stays silent
 * (the removed synthetic voice never returns). Either way a timer baseline keeps
 * the mouth moving even with no audio (muted / no recording / headless).
 */
export function voiceNathalia(text: string): void {
  voiceNathaliaReply(text);
}

export function voiceNathaliaCached(text: string, audioSrc?: string): void {
  voiceNathaliaCachedWithCallbacks(text, audioSrc);
}

export function voiceNathaliaCachedWithCallbacks(
  text: string,
  audioSrc?: string,
  cb?: CachedSpeechCallbacks,
): void {
  const clean = text.trim();
  startNathaliaSpeaking(Math.min(3500, Math.max(800, clean.length * 42)));
  if (!audioSrc || !speakNathaliaAudioWithCallbacks(clean, audioSrc, cb)) {
    if (cb?.fallbackToProvider !== false) speakNathalia(clean);
  }
}
