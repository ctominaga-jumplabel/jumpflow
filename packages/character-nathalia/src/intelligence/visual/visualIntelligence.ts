/**
 * Visual Intelligence Layer for Nathal.IA (Fase 8, Etapa 7).
 *
 * Connects an *intent* (and the screen it concerns) to how Nathal.IA should
 * present herself: emotional state → accessory → animation clip. Example:
 *   "Como lançar horas?"  →  explaining  →  clipboard  →  clip "Explaining".
 *
 * Pure and three-free. Reuses the existing maps (`clipForState`,
 * `accessoryForContext`) so the 2D/3D runtime stays the single source of truth
 * for how a state is rendered — this layer only *chooses* the composition.
 */
import { accessoryForContext, type NathaliaAccessoryKey } from "../../nathaliaAccessories";
import { clipForState, type Nathalia3DClip } from "../../nathaliaAnimations";
import type { NathaliaContextKey, NathaliaStateKey } from "../../nathaliaTypes";
import type { NathaliaIntentKind } from "../intent";

export interface VisualIntelligence {
  /** Emotional/visual state to enter. */
  state: NathaliaStateKey;
  /** Accessory to show (or null for none). */
  accessory: NathaliaAccessoryKey | null;
  /** 3D clip to play (derived from the state). */
  clip: Nathalia3DClip;
}

/** Resting state chosen per intent. */
const intentState: Record<NathaliaIntentKind, NathaliaStateKey> = {
  greeting: "welcome",
  navigate: "pointing",
  tour: "pointing",
  teach: "explaining",
  explain: "explaining",
  question: "explaining",
  unknown: "thinking",
};

export interface VisualIntelOptions {
  /** Screen the user is currently on. */
  context?: NathaliaContextKey;
  /** Screen the intent targets (navigation/tour), if any. */
  targetContext?: NathaliaContextKey;
}

/**
 * Map an intent to a full visual composition. Teach/explain reinforce the topic
 * with the clipboard when the screen has no more specific prop; navigation and
 * tours point toward the target screen's accessory.
 */
export function visualForIntent(
  kind: NathaliaIntentKind,
  options: VisualIntelOptions = {},
): VisualIntelligence {
  const { context = "general", targetContext } = options;
  const state = intentState[kind] ?? "explaining";

  let accessory: NathaliaAccessoryKey | null = null;
  if (kind === "navigate" || kind === "tour") {
    accessory = accessoryForContext(targetContext ?? context);
  } else if (kind === "teach" || kind === "explain" || kind === "question") {
    accessory = accessoryForContext(context) ?? "clipboard";
  }

  return { state, accessory, clip: clipForState(state) };
}
