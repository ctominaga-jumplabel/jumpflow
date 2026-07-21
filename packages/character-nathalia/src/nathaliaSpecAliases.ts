/**
 * Spec-facing vocabulary aliases for Nathal.IA.
 *
 * The package's internal contract is intentionally richer than the public
 * "Digital Work Companion" spec: states (`NathaliaStateKey`) carry 12 visual
 * states, visemes are lowercase keys that match the asset filenames, and the
 * context catalog covers every JumpFlow area. This module exposes the leaner,
 * spec-named vocabulary (`NathaliaMood`, `NathaliaViseme`, `NathaliaContext`)
 * **on top of** the internal one, plus pure adapters between the two — so callers
 * can speak the documented vocabulary without us renaming anything wired up and
 * tested. Pure + side-effect free.
 */
import type { NathaliaContextKey, NathaliaStateKey } from "./nathaliaTypes";
import type { NathaliaVisemeKey } from "./nathaliaExpressions";

// ---------------------------------------------------------------------------
// Mood  (spec) ⇄  NathaliaStateKey (internal)
// ---------------------------------------------------------------------------

/** Emotional vocabulary as named in the product spec. */
export type NathaliaMood =
  | "idle"
  | "happy"
  | "thinking"
  | "worried"
  | "alert"
  | "celebrating"
  | "speaking"
  | "listening"
  | "success"
  | "error";

const MOOD_TO_STATE: Record<NathaliaMood, NathaliaStateKey> = {
  idle: "idle",
  happy: "happy",
  thinking: "thinking",
  worried: "warning", // heads-up, attentive — never blaming (Character Bible)
  alert: "pointing",
  celebrating: "celebrate",
  speaking: "explaining", // the `speaking` flag drives lip-sync separately
  listening: "listening",
  success: "success",
  error: "error",
};

const STATE_TO_MOOD: Record<NathaliaStateKey, NathaliaMood> = {
  idle: "idle",
  welcome: "happy",
  listening: "listening",
  thinking: "thinking",
  searching: "thinking",
  explaining: "speaking",
  pointing: "alert",
  happy: "happy",
  warning: "worried",
  error: "error",
  success: "success",
  celebrate: "celebrating",
};

/** Map a spec mood to the internal visual state. */
export function moodToState(mood: NathaliaMood): NathaliaStateKey {
  return MOOD_TO_STATE[mood];
}

/** Map an internal visual state to the closest spec mood. */
export function stateToMood(state: NathaliaStateKey): NathaliaMood {
  return STATE_TO_MOOD[state];
}

// ---------------------------------------------------------------------------
// Viseme  (spec, uppercase)  ⇄  NathaliaVisemeKey (internal, lowercase)
// ---------------------------------------------------------------------------

/** Mouth shapes as named in the spec (uppercase, `F` folds F/V together). */
export type NathaliaViseme =
  | "rest"
  | "A"
  | "E"
  | "I"
  | "O"
  | "U"
  | "M"
  | "F"
  | "L"
  | "R"
  | "S";

const SPEC_VISEME_TO_KEY: Record<NathaliaViseme, NathaliaVisemeKey> = {
  rest: "rest",
  A: "a",
  E: "e",
  I: "i",
  O: "o",
  U: "u",
  M: "m",
  F: "fv",
  L: "l",
  R: "r",
  S: "s",
};

const KEY_TO_SPEC_VISEME: Record<NathaliaVisemeKey, NathaliaViseme> = {
  a: "A",
  e: "E",
  i: "I",
  o: "O",
  u: "U",
  m: "M",
  l: "L",
  r: "R",
  s: "S",
  fv: "F",
  tdn: "L", // tongue shape (t/d/n) has no spec slot → nearest is L
  rest: "rest",
};

/** Map a spec viseme to the internal (asset) viseme key. */
export function specVisemeToKey(v: NathaliaViseme): NathaliaVisemeKey {
  return SPEC_VISEME_TO_KEY[v];
}

/** Map an internal viseme key to the closest spec viseme. */
export function keyToSpecViseme(v: NathaliaVisemeKey): NathaliaViseme {
  return KEY_TO_SPEC_VISEME[v];
}

// ---------------------------------------------------------------------------
// Context  (spec)  ⇄  NathaliaContextKey (internal)
// ---------------------------------------------------------------------------

/** Application areas as named in the spec. */
export type NathaliaContext =
  | "home"
  | "hours"
  | "projects"
  | "approvals"
  | "reports"
  | "settings";

const SPEC_CONTEXT_TO_KEY: Record<NathaliaContext, NathaliaContextKey> = {
  home: "dashboard",
  hours: "hours",
  projects: "projects",
  approvals: "approvals",
  reports: "reports",
  settings: "settings",
};

/** Map a spec context to the internal context key. */
export function specContextToKey(context: NathaliaContext): NathaliaContextKey {
  return SPEC_CONTEXT_TO_KEY[context];
}

/**
 * Map an internal context key to the closest spec context. Areas without a
 * direct spec slot (expenses, clients, consultants, finance, general) collapse
 * to `"home"`.
 */
export function keyToSpecContext(context: NathaliaContextKey): NathaliaContext {
  switch (context) {
    case "hours":
    case "projects":
    case "approvals":
    case "reports":
    case "settings":
      return context;
    default:
      return "home";
  }
}
