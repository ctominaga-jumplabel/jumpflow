/**
 * Contextual Visual States for Nathal.IA (Fase 7, Etapa 10).
 *
 * Defines how the character should *present herself* on each screen: which
 * resting emotional state, which body clip and which accessory. This is the
 * single source of truth that turns "where am I in the app" into "how does
 * Nathal.IA look here", consumed by the widget/panel and documented in
 * `docs/nathalia/CONTEXTUAL_VISUAL_STATES.md`.
 *
 * It composes the existing layers (it does not replace them): the context
 * engine still owns greetings/suggestions (`nathaliaContext.ts`), the state
 * catalogue still owns expression intent (`nathaliaStates.ts`), and the clip /
 * morph maps still translate a state to the GLB (`nathaliaAnimations.ts`). This
 * file only pins the per-screen *visual* composition.
 *
 * Pure and three-free — safe to import anywhere.
 */
import type { NathaliaAccessoryKey } from "./nathaliaAccessories";
import { accessoryForContext } from "./nathaliaAccessories";
import type { Nathalia3DClip } from "./nathaliaAnimations";
import type { NathaliaContextKey, NathaliaStateKey } from "./nathaliaTypes";

export interface NathaliaVisualState {
  /** Resting emotional state for this screen. */
  state: NathaliaStateKey;
  /** Optional explicit body clip (else derived from `state`). */
  clip?: Nathalia3DClip;
  /** Optional accessory to show (else derived from the context). */
  accessory: NathaliaAccessoryKey | null;
}

/**
 * Per-context visual composition. `accessory` defaults to `accessoryForContext`
 * but can be pinned explicitly. Keep entries aligned with `nathaliaContexts`.
 */
const visualStates: Record<NathaliaContextKey, NathaliaVisualState> = {
  general: { state: "idle", accessory: null },
  dashboard: { state: "explaining", clip: "Explaining", accessory: "chart" },
  hours: { state: "explaining", clip: "Explaining", accessory: "clipboard" },
  expenses: { state: "explaining", clip: "Explaining", accessory: "clipboard" },
  projects: { state: "explaining", clip: "Explaining", accessory: "kanban" },
  clients: { state: "explaining", clip: "Explaining", accessory: null },
  consultants: { state: "explaining", clip: "Explaining", accessory: null },
  approvals: { state: "pointing", clip: "Pointing", accessory: "approval_stamp" },
  reports: { state: "explaining", clip: "Explaining", accessory: "report" },
  finance: { state: "explaining", clip: "Explaining", accessory: "chart" },
  settings: { state: "explaining", clip: "Explaining", accessory: null },
};

/** Resolve the visual composition for a context (safe fallback to `general`). */
export function visualStateForContext(
  context: NathaliaContextKey,
): NathaliaVisualState {
  const found = visualStates[context];
  if (found) return found;
  return { state: "idle", accessory: accessoryForContext(context) };
}
