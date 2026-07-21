/**
 * Animation registry for the layered 2D avatar (`Nathalia2DAvatar`).
 *
 * Declares the named **animation states** the avatar can play and, for each, how
 * it composes the character (which emotional face, whether it speaks) and the
 * **motion profile** (breathe / sway / tilt amplitudes). It deliberately reuses
 * the existing emotional-state vocabulary (`NathaliaStateKey`) for face
 * resolution via `expressionFor()` — this module only adds the *animation*
 * layer on top.
 *
 * Pure data + pure functions: no React, no `window`. Safe to import anywhere and
 * to unit test. See `docs/nathalia/2D_ANIMATION_ARCHITECTURE.md`.
 */
import type { NathaliaStateKey } from "./nathaliaTypes";

/** The named animation states required by the 2D layered avatar. */
export const NATHALIA_ANIMATION_STATES = [
  "idle",
  "idle_blink",
  "listening",
  "talking",
  "thinking",
  "success",
  "error",
  "alert",
  "celebrate",
  "wave",
] as const;
export type NathaliaAnimationState = (typeof NATHALIA_ANIMATION_STATES)[number];

/** Motion "feel" applied by the controller — maps to keyframe amplitudes. */
export type NathaliaMotionProfile = "still" | "calm" | "talk" | "attentive" | "emphatic";

export interface NathaliaAnimationDef {
  key: NathaliaAnimationState;
  /** Emotional state used to resolve the face expression (via `expressionFor`). */
  stateKey: NathaliaStateKey;
  /** Whether the mouth animates (lip-sync face-swap) while this state plays. */
  speaking: boolean;
  /** Motion profile driving the breathe/sway/tilt keyframes. */
  motion: NathaliaMotionProfile;
  /** Ambient looping state vs a one-shot reaction (the latter auto-returns to idle). */
  loop: boolean;
  /** Whether involuntary micro-life (blink/side-glance) runs in this state. */
  blink: boolean;
  /** Human label (pt-BR) for the Lab and tooling. */
  label: string;
}

const DEFS: Record<NathaliaAnimationState, NathaliaAnimationDef> = {
  idle: { key: "idle", stateKey: "idle", speaking: false, motion: "calm", loop: true, blink: true, label: "Repouso" },
  idle_blink: { key: "idle_blink", stateKey: "idle", speaking: false, motion: "calm", loop: true, blink: true, label: "Repouso (piscar)" },
  listening: { key: "listening", stateKey: "listening", speaking: false, motion: "attentive", loop: true, blink: true, label: "Ouvindo" },
  talking: { key: "talking", stateKey: "explaining", speaking: true, motion: "talk", loop: true, blink: false, label: "Falando" },
  thinking: { key: "thinking", stateKey: "thinking", speaking: false, motion: "calm", loop: true, blink: true, label: "Pensando" },
  success: { key: "success", stateKey: "success", speaking: false, motion: "emphatic", loop: false, blink: true, label: "Sucesso" },
  error: { key: "error", stateKey: "error", speaking: false, motion: "attentive", loop: false, blink: true, label: "Erro (acolhedor)" },
  alert: { key: "alert", stateKey: "warning", speaking: false, motion: "attentive", loop: false, blink: true, label: "Alerta" },
  celebrate: { key: "celebrate", stateKey: "celebrate", speaking: false, motion: "emphatic", loop: false, blink: false, label: "Comemorando" },
  wave: { key: "wave", stateKey: "welcome", speaking: false, motion: "emphatic", loop: false, blink: true, label: "Acenando" },
};

/** Resolve the definition for an animation state (falls back to idle). */
export function getAnimationDef(state: NathaliaAnimationState): NathaliaAnimationDef {
  return DEFS[state] ?? DEFS.idle;
}

/**
 * Map an emotional `NathaliaStateKey` (the avatar's public prop) to the
 * animation state that best expresses it. Keeps the public API identical to the
 * other avatars while letting the layered renderer pick a richer motion.
 */
const STATE_TO_ANIMATION: Record<NathaliaStateKey, NathaliaAnimationState> = {
  idle: "idle",
  welcome: "wave",
  listening: "listening",
  thinking: "thinking",
  searching: "thinking",
  explaining: "talking",
  pointing: "alert",
  happy: "success",
  warning: "alert",
  error: "error",
  success: "success",
  celebrate: "celebrate",
};

export function layeredAnimationFor(state: NathaliaStateKey): NathaliaAnimationState {
  return STATE_TO_ANIMATION[state] ?? "idle";
}

/** Keyframes for a motion profile, scaled to the avatar size (px). Pure. */
export interface NathaliaMotionKeyframes {
  y: number[];
  rotate: number[];
  scale?: number[];
  durationSec: number;
}

export function motionKeyframes(
  profile: NathaliaMotionProfile,
  size: number,
): NathaliaMotionKeyframes {
  const u = Math.max(24, size); // amplitude scales with size; floor avoids 0 at tiny sizes
  switch (profile) {
    case "still":
      return { y: [0, 0, 0], rotate: [0, 0, 0], durationSec: 6 };
    case "talk":
      // Gentle nod — the mouth frames already carry the "talking" energy.
      return { y: [0, -u * 0.014, 0], rotate: [-0.25, 0.25, -0.25], durationSec: 1.4 };
    case "attentive":
      return { y: [0, -u * 0.03, 0], rotate: [-2, 2, -2], durationSec: 2.2 };
    case "emphatic":
      return { y: [0, -u * 0.06, 0], rotate: [-3, 3, -3], scale: [1, 1.04, 1], durationSec: 1.1 };
    case "calm":
    default:
      return { y: [0, -u * 0.02, 0], rotate: [-1.1, 1.1, -1.1], durationSec: 6 };
  }
}
