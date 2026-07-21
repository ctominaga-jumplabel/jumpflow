/**
 * NathaliaStateEngine — the spec-shaped behavior facade.
 *
 * The product spec describes a single "state engine" object with `setContext`,
 * `speak`, `celebrate`, `alert`, `reset` and getters for the current mood,
 * context, message and message queue. Internally Nathal.IA already has a tiny
 * imperative store (`nathaliaStore.ts`) exposing those capabilities as bare
 * functions; this class is a thin, additive wrapper that presents them under
 * the documented contract. It adds no new state — the store stays the single
 * source of truth — so callers can use either API interchangeably.
 *
 * Framework-agnostic (no React/JSX), safe to call from anywhere on the client.
 */
import {
  celebrateNathalia,
  getNathaliaSnapshot,
  notifyNathalia,
  resetNathalia,
  sayNathalia,
  setNathaliaContext,
  setNathaliaMessage,
  setNathaliaState,
  startNathaliaSpeaking,
  subscribeNathalia,
} from "./nathaliaStore";
import {
  moodToState,
  stateToMood,
  type NathaliaContext,
  type NathaliaMood,
} from "./nathaliaSpecAliases";
import type { NathaliaContextKey, NathaliaMessage } from "./nathaliaTypes";

export interface NathaliaSpeakOptions {
  /** Mood to adopt while speaking (defaults to `"speaking"`). */
  mood?: NathaliaMood;
  /** How long to animate the mouth (ms) when there is no TTS to sync to. */
  durationMs?: number;
}

/** Normalize a spec or internal context into the internal key. */
function normalizeContext(
  value: NathaliaContext | NathaliaContextKey,
): NathaliaContextKey {
  return value === "home" ? "dashboard" : (value as NathaliaContextKey);
}

export class NathaliaStateEngine {
  /** Current mood (spec vocabulary), derived from the visual state. */
  get mood(): NathaliaMood {
    return stateToMood(getNathaliaSnapshot().state);
  }

  /** Current screen context (internal key). */
  get context(): NathaliaContextKey {
    return getNathaliaSnapshot().context;
  }

  /** Current headline message. */
  get message(): string {
    return getNathaliaSnapshot().message;
  }

  /** The (mocked) conversation log. */
  get queue(): NathaliaMessage[] {
    return getNathaliaSnapshot().messages;
  }

  /** Suggested next action — the first dynamic follow-up, if any. */
  get suggestedAction(): string | null {
    return getNathaliaSnapshot().followUps[0] ?? null;
  }

  /** Set the current mood (spec vocabulary). */
  setMood(mood: NathaliaMood): this {
    setNathaliaState(moodToState(mood));
    return this;
  }

  /** Switch the contextual area (accepts spec or internal context). */
  setContext(context: NathaliaContext | NathaliaContextKey): this {
    setNathaliaContext(normalizeContext(context));
    return this;
  }

  /** Set the headline message without appending to the conversation log. */
  setMessage(message: string): this {
    setNathaliaMessage(message);
    return this;
  }

  /**
   * Say a line: append it to the log, adopt the speaking mood and animate the
   * mouth (simulated lip-sync via viseme swap). Client-only for the animation.
   */
  speak(text: string, options: NathaliaSpeakOptions = {}): this {
    const mood = options.mood ?? "speaking";
    sayNathalia(text, "nathalia", moodToState(mood));
    startNathaliaSpeaking(options.durationMs);
    return this;
  }

  /** Celebrate a positive moment (transient `celebrate` visual + confetti cue). */
  celebrate(message?: string, durationMs?: number): this {
    celebrateNathalia(message, durationMs);
    return this;
  }

  /** Raise an attention cue: adopt the alert mood and flag a notification. */
  alert(message?: string): this {
    setNathaliaState(moodToState("alert"));
    notifyNathalia(message);
    return this;
  }

  /** Reset everything to the initial idle state. */
  reset(): this {
    resetNathalia();
    return this;
  }

  /** Subscribe to store changes; returns an unsubscribe function. */
  subscribe(listener: () => void): () => void {
    return subscribeNathalia(listener);
  }
}

/** Default shared engine instance. */
export const nathaliaEngine = new NathaliaStateEngine();
