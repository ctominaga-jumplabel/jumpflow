/**
 * Animation registry for Nathal.IA.
 *
 *  - 2D motion — `motion/react` variant hints used by the SVG avatar.
 *  - Clip names — symbolic animation labels still surfaced by the local brain as
 *    `BrainResponse.visual.clip` (a plain string). The 3D rig that once consumed
 *    them is gone (legacy); the labels are harmless metadata.
 *
 * The values are deliberately data-only (no `motion` import) so this module is
 * safe to import anywhere, including server code and tests.
 */
import type { NathaliaStateKey } from "./nathaliaTypes";

/** Loop behaviour for a clip. */
export type NathaliaClipLoop = "loop" | "once" | "pingpong";

export interface NathaliaAnimationDefinition {
  /** Clip key (referenced by `nathaliaStates[*].animation`). */
  key: string;
  /** Expected clip name inside the 3D rig. */
  clip: string;
  loop: NathaliaClipLoop;
  /** Suggested duration in seconds for the 3D clip / fallback. */
  durationSec: number;
  /**
   * 2D fallback hint consumed by `NathaliaAvatar`. Maps to a simple transform
   * loop so reduced-motion users still get a calm, legible avatar.
   */
  fallback: {
    /** y bob amplitude in px (0 = none). */
    bob: number;
    /** rotation amplitude in degrees (0 = none). */
    tilt: number;
    /** scale pulse amplitude (0 = none). */
    pulse: number;
  };
}

export const nathaliaAnimations: Record<string, NathaliaAnimationDefinition> = {
  idleBreath: {
    key: "idleBreath",
    clip: "Idle",
    loop: "loop",
    durationSec: 4,
    fallback: { bob: 3, tilt: 0, pulse: 0.01 },
  },
  wave: {
    key: "wave",
    clip: "Wave",
    loop: "once",
    durationSec: 1.6,
    fallback: { bob: 2, tilt: 4, pulse: 0.02 },
  },
  nod: {
    key: "nod",
    clip: "Nod",
    loop: "loop",
    durationSec: 1.4,
    fallback: { bob: 4, tilt: 0, pulse: 0 },
  },
  thinking: {
    key: "thinking",
    clip: "Thinking",
    loop: "loop",
    durationSec: 2.2,
    fallback: { bob: 1, tilt: 6, pulse: 0 },
  },
  search: {
    key: "search",
    clip: "LookAround",
    loop: "loop",
    durationSec: 2,
    fallback: { bob: 2, tilt: 8, pulse: 0 },
  },
  explain: {
    key: "explain",
    clip: "Explain",
    loop: "loop",
    durationSec: 2.4,
    fallback: { bob: 2, tilt: 3, pulse: 0.01 },
  },
  point: {
    key: "point",
    clip: "Point",
    loop: "once",
    durationSec: 1.2,
    fallback: { bob: 0, tilt: 10, pulse: 0 },
  },
  happy: {
    key: "happy",
    clip: "Happy",
    loop: "once",
    durationSec: 1.4,
    fallback: { bob: 5, tilt: 2, pulse: 0.04 },
  },
  warn: {
    key: "warn",
    clip: "Warn",
    loop: "once",
    durationSec: 1.2,
    fallback: { bob: 0, tilt: 5, pulse: 0.03 },
  },
  shrug: {
    key: "shrug",
    clip: "Shrug",
    loop: "once",
    durationSec: 1.2,
    fallback: { bob: 0, tilt: 4, pulse: 0 },
  },
  thumbsUp: {
    key: "thumbsUp",
    clip: "ThumbsUp",
    loop: "once",
    durationSec: 1.3,
    fallback: { bob: 4, tilt: 0, pulse: 0.03 },
  },
  celebrate: {
    key: "celebrate",
    clip: "Celebrate",
    loop: "once",
    durationSec: 2,
    fallback: { bob: 8, tilt: 6, pulse: 0.06 },
  },
};

/** Resolve the animation for a state, falling back to the idle breath. */
export function animationForState(
  state: NathaliaStateKey,
  animationKey: string,
): NathaliaAnimationDefinition {
  return nathaliaAnimations[animationKey] ?? nathaliaAnimations.idleBreath;
}

/**
 * 3D rig clip names present in `master_v2_preview.glb` (Fase 7): the original
 * `Idle`/`Wave`/`Thinking` plus `Pointing`, `Explaining`, `Celebrate`,
 * `Typing`, `Alert` and `Greeting`. Loading the older `master_preview.glb` (V1,
 * only 3 clips) still works — `NathaliaModel` falls back to `Idle` for any clip
 * the loaded GLB does not contain.
 */
export type Nathalia3DClip =
  | "Idle"
  | "Wave"
  | "Thinking"
  | "Pointing"
  | "Explaining"
  | "Celebrate"
  | "Typing"
  | "Alert"
  | "Greeting";

/** Loop behaviour per clip — the single source of truth for one-shot vs loop. */
export const clipLoop: Record<Nathalia3DClip, "loop" | "once"> = {
  Idle: "loop",
  Wave: "once",
  Thinking: "loop",
  Pointing: "once",
  Explaining: "loop",
  Celebrate: "once",
  Typing: "loop",
  Alert: "once",
  Greeting: "once",
};

/** Whether a clip plays once (and settles back to Idle) or loops. */
export function isOneShotClip(clip: string): boolean {
  return clipLoop[clip as Nathalia3DClip] === "once";
}

/**
 * Maps each emotional state to a clip available in the V2 runtime GLB. The
 * React API does not change when the clip set grows.
 */
export const stateToClip: Record<NathaliaStateKey, Nathalia3DClip> = {
  idle: "Idle",
  welcome: "Greeting",
  listening: "Idle",
  thinking: "Thinking",
  searching: "Thinking",
  explaining: "Explaining",
  pointing: "Pointing",
  happy: "Greeting",
  warning: "Alert",
  error: "Alert",
  success: "Celebrate",
  celebrate: "Celebrate",
};

/** Resolve the GLB clip for a state, defaulting to `Idle`. */
export function clipForState(state: NathaliaStateKey): Nathalia3DClip {
  return stateToClip[state] ?? "Idle";
}

/**
 * Morph target (shape key) names present on `Body_mesh` in the runtime GLB.
 * Driving these in runtime is a Fase 7 refinement; the names are pinned here so
 * the contract is explicit. See `docs/nathalia/SHAPE_KEYS_BLUEPRINT.md`.
 */
export type NathaliaMorphTarget =
  | "Smile"
  | "Blink_L"
  | "Blink_R"
  | "Thinking"
  | "Surprised"
  | "Sad"
  | "OpenMouth"
  | "Curious"
  | "Greeting"
  | "Celebrate";

/**
 * Desired resting shape-key weights per state (0–1). This is the *intent*; the
 * MVP model component only applies these when the mesh exposes morph targets
 * and otherwise no-ops (TODO Fase 7: blink loop + lip-sync via `OpenMouth`).
 */
export const stateToMorphTargets: Record<
  NathaliaStateKey,
  Partial<Record<NathaliaMorphTarget, number>>
> = {
  idle: { Smile: 0.15 },
  welcome: { Greeting: 0.7 },
  listening: { Smile: 0.35 },
  thinking: { Thinking: 0.7 },
  searching: { Thinking: 0.5, Curious: 0.4 },
  explaining: { Smile: 0.3, OpenMouth: 0.12 },
  pointing: { Smile: 0.25 },
  happy: { Smile: 0.75 },
  warning: { Surprised: 0.35 },
  error: { Sad: 0.55 },
  success: { Greeting: 0.6 },
  celebrate: { Celebrate: 0.85 },
};

/** Resolve the desired shape-key weights for a state. */
export function morphTargetsForState(
  state: NathaliaStateKey,
): Partial<Record<NathaliaMorphTarget, number>> {
  return stateToMorphTargets[state] ?? {};
}
