/**
 * Rive avatar config + capability checks for Nathal.IA.
 *
 * Rive (https://rive.app) is the planned path to a fully interactive vector
 * avatar: real eyelid blinks, mouth visemes and gaze driven by a **state
 * machine** instead of crossfading PNG busts. This module is the **rive-free,
 * three-free contract** between the runtime integration (`NathaliaAvatarRive`)
 * and the authored `.riv` asset (see `docs/nathalia/RIVE_SPEC.md`). It is safe to
 * import anywhere (server, tests, barrel) — it never pulls in the Rive runtime.
 *
 * The `.riv` file itself is authored in the Rive editor; it cannot be generated
 * from code. The names and orderings below are the contract the `.riv` must
 * follow so the integration can drive it.
 */
import type { NathaliaStateKey } from "./nathaliaTypes";
import type { NathaliaVisemeKey } from "./nathaliaExpressions";

/** Where the authored `.riv` is served from (static public asset). */
export const NATHALIA_RIVE_SRC = "/nathalia/rive/nathalia.riv";

/** Artboard name the `.riv` must expose. */
export const NATHALIA_RIVE_ARTBOARD = "Nathalia";

/** State machine name the `.riv` must expose. */
export const NATHALIA_RIVE_STATE_MACHINE = "Nathalia";

/** Input names on the state machine (must match the authored `.riv`). */
export const NATHALIA_RIVE_INPUTS = {
  /** Number — index into {@link NATHALIA_RIVE_MOODS}. */
  mood: "mood",
  /** Boolean — true while talking (drives the mouth/visemes). */
  speaking: "speaking",
  /** Number — index into {@link NATHALIA_RIVE_VISEMES} (mouth shape). */
  viseme: "viseme",
} as const;

/**
 * Mood order — the **value of the `mood` Number input is the index here**. The
 * `.riv` state machine must map each index to the matching expression/pose.
 */
export const NATHALIA_RIVE_MOODS: readonly NathaliaStateKey[] = [
  "idle",
  "welcome",
  "listening",
  "thinking",
  "searching",
  "explaining",
  "pointing",
  "happy",
  "warning",
  "error",
  "success",
  "celebrate",
] as const;

/** Map a visual state to the `mood` input value (falls back to 0 = idle). */
export function moodToRiveIndex(state: NathaliaStateKey): number {
  const i = NATHALIA_RIVE_MOODS.indexOf(state);
  return i < 0 ? 0 : i;
}

/**
 * Viseme order — the **value of the `viseme` Number input is the index here**.
 * Index 0 (`rest`) is the closed/neutral mouth.
 */
export const NATHALIA_RIVE_VISEMES: readonly NathaliaVisemeKey[] = [
  "rest",
  "a",
  "e",
  "i",
  "o",
  "u",
  "m",
  "l",
  "fv",
  "r",
  "tdn",
] as const;

/** Map a viseme key to the `viseme` input value (falls back to 0 = rest). */
export function visemeToRiveIndex(viseme: string | null | undefined): number {
  if (!viseme) return 0;
  const i = NATHALIA_RIVE_VISEMES.indexOf(viseme as NathaliaVisemeKey);
  return i < 0 ? 0 : i;
}

/**
 * Whether the Rive avatar path is enabled. Off by default: until an authored
 * `.riv` exists at {@link NATHALIA_RIVE_SRC}, enabling it simply falls back to
 * the 2D expression avatar (the Rive runtime reports a load error and we render
 * the fallback). Set `NEXT_PUBLIC_NATHALIA_RIVE=true` to opt in.
 */
export function isNathaliaRiveEnabled(): boolean {
  return process.env.NEXT_PUBLIC_NATHALIA_RIVE === "true";
}
