/**
 * Nathal.IA expression library (Fase 9 — 2D expressivo).
 *
 * Maps the assistant's emotional **state** and the current **screen context** to
 * one of the hand-illustrated expression busts cropped from the official
 * reference sheets (`docs/nathalia/expressions/`, served from
 * `/nathalia/expressions/*.png`). Pure + SSR-safe: no React, no `window`.
 *
 * Resolution order (see {@link expressionFor}):
 *   1. an explicit override,
 *   2. an *active* emotional state (welcome/thinking/success/warning/…),
 *   3. the resting expression for the current screen,
 *   4. a friendly default.
 *
 * This is why the face changes both as the user **navigates** (context) and as
 * the assistant **reacts** (state).
 */
import type { NathaliaContextKey, NathaliaStateKey } from "./nathaliaTypes";

export const NATHALIA_EXPRESSIONS = [
  // Novas feições
  "preocupada", "alerta", "comemorando", "empolgada", "pensativa", "curiosa", "surpresa",
  // Expressões adicionais
  "confiante", "satisfeita", "grata", "animada", "triste", "zangada", "focada",
  "eureka", "duvida", "encorajando",
] as const;
export type NathaliaExpressionKey = (typeof NATHALIA_EXPRESSIONS)[number];

export const NATHALIA_VISEMES = [
  "a", "e", "i", "o", "u", "s", "m", "l", "fv", "r", "tdn", "rest",
] as const;
export type NathaliaVisemeKey = (typeof NATHALIA_VISEMES)[number];

/**
 * Screen objects, as idealized in the reference sheet's capability cards
 * (Horas→relógio, Projetos→quadro, Aprovações→carimbo, Relatórios→gráfico).
 * Shown as a small badge on the avatar for the matching screen.
 */
export const NATHALIA_OBJECTS = ["horas", "projetos", "aprovacoes", "relatorios"] as const;
export type NathaliaObjectKey = (typeof NATHALIA_OBJECTS)[number];

const CONTEXT_OBJECT: Partial<Record<NathaliaContextKey, NathaliaObjectKey>> = {
  hours: "horas",
  projects: "projetos",
  approvals: "aprovacoes",
  reports: "relatorios",
};

/** The screen's object badge, if the current context has one idealized. */
export function objectForContext(context: NathaliaContextKey): NathaliaObjectKey | null {
  return CONTEXT_OBJECT[context] ?? null;
}

/**
 * Map a single pt-BR grapheme to a mouth shape (viseme), for audio-driven
 * lip-sync. Approximate (grapheme, not true phoneme) but reads well at avatar
 * size. Unknown/space/punctuation → "rest".
 */
export function visemeForChar(ch: string): NathaliaVisemeKey {
  const c = ch.toLowerCase();
  if ("aáàâã".includes(c)) return "a";
  if ("eéê".includes(c)) return "e";
  if ("ií".includes(c)) return "i";
  if ("oóôõ".includes(c)) return "o";
  if ("uúü".includes(c)) return "u";
  if ("mbp".includes(c)) return "m";
  if ("fv".includes(c)) return "fv";
  if ("szçxjg".includes(c)) return "s";
  if (c === "l") return "l";
  if (c === "r") return "r";
  if ("tdn".includes(c)) return "tdn";
  if ("kqwhcy".includes(c)) return "e"; // soft consonants → light open
  return "rest";
}

export function objectImageUrl(
  key: NathaliaObjectKey,
  baseUrl: string = NATHALIA_EXPRESSIONS_BASE_URL,
): string {
  return `${baseUrl}/icon-${key}.webp`;
}

/**
 * Active emotional states → expression. States NOT listed (idle, explaining)
 * are "neutral": they defer to the screen's resting expression so navigation
 * still changes the face.
 *
 * Deliberately **positive-leaning**: Nathal.IA never blames or sulks (Character
 * Bible). Even warning/error stay attentive/reassuring — sad/angry faces
 * (`triste`, `zangada`, `preocupada`, `duvida`) are NOT auto-mapped; they remain
 * available only as explicit overrides.
 */
const STATE_EXPRESSION: Partial<Record<NathaliaStateKey, NathaliaExpressionKey>> = {
  welcome: "animada",
  listening: "curiosa",
  thinking: "pensativa",
  searching: "focada",
  pointing: "alerta",
  happy: "satisfeita",
  warning: "alerta", // heads-up, attentive — not worried
  error: "encorajando", // "vamos resolver juntos" — supportive, never blaming
  success: "empolgada",
  celebrate: "comemorando",
};

/** Resting expression per screen — gives each area its own (positive) personality. */
const CONTEXT_EXPRESSION: Record<NathaliaContextKey, NathaliaExpressionKey> = {
  general: "animada",
  dashboard: "confiante",
  hours: "focada",
  expenses: "focada",
  projects: "curiosa",
  clients: "grata",
  consultants: "encorajando",
  approvals: "confiante",
  reports: "eureka",
  finance: "confiante",
  settings: "confiante",
};

const DEFAULT_EXPRESSION: NathaliaExpressionKey = "confiante";

/** Resolve the expression to show for a given state + screen (+ optional override). */
export function expressionFor(
  state: NathaliaStateKey,
  context: NathaliaContextKey = "general",
  explicit?: NathaliaExpressionKey | null,
): NathaliaExpressionKey {
  if (explicit && NATHALIA_EXPRESSIONS.includes(explicit)) return explicit;
  return STATE_EXPRESSION[state] ?? CONTEXT_EXPRESSION[context] ?? DEFAULT_EXPRESSION;
}

/** Whether a state maps to an active (non-neutral) expression. */
export function isActiveExpressionState(state: NathaliaStateKey): boolean {
  return state in STATE_EXPRESSION;
}

/**
 * Whether the expressive (illustrated) 2D avatar is used for the 2D path.
 * On by default; set `NEXT_PUBLIC_NATHALIA_2D_EXPR=false` to fall back to the
 * dependency-free SVG avatar.
 */
export function isExpressive2DEnabled(): boolean {
  return process.env.NEXT_PUBLIC_NATHALIA_2D_EXPR !== "false";
}

export const NATHALIA_EXPRESSIONS_BASE_URL = "/nathalia/expressions";

export function expressionImageUrl(
  key: NathaliaExpressionKey,
  baseUrl: string = NATHALIA_EXPRESSIONS_BASE_URL,
): string {
  return `${baseUrl}/${key}.webp`;
}

export function visemeImageUrl(
  key: NathaliaVisemeKey,
  baseUrl: string = NATHALIA_EXPRESSIONS_BASE_URL,
): string {
  return `${baseUrl}/vis-${key}.webp`;
}

/** The distinct expressions actually reachable from states + contexts (for preload). */
export function reachableExpressions(): NathaliaExpressionKey[] {
  const set = new Set<NathaliaExpressionKey>([DEFAULT_EXPRESSION]);
  Object.values(STATE_EXPRESSION).forEach((e) => e && set.add(e));
  Object.values(CONTEXT_EXPRESSION).forEach((e) => set.add(e));
  return [...set];
}
