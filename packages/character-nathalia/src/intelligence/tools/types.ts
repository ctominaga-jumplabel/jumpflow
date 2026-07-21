/**
 * Tool Layer types for Nathal.IA (Fase 8, Etapa 5).
 *
 * Tools are the *only* things Nathal.IA can "do". In this phase every tool is
 * mocked/navigational — there are NO write tools, no data mutations and no
 * sensitive actions. Each tool maps to an existing bound `NathaliaActionId`
 * (see `nathaliaActions.ts`) so the runtime/RBAC already in place is reused.
 */
import type {
  NathaliaActionId,
  NathaliaActionSensitivity,
  NathaliaContextKey,
} from "../../nathaliaTypes";

/** Coarse tool category, used for UI affordances and visual intelligence. */
export type NathaliaToolKind = "navigation" | "ui" | "tour";

export interface NathaliaTool {
  /** Stable tool id (equals the underlying action id today). */
  id: NathaliaActionId;
  kind: NathaliaToolKind;
  /** pt-BR label shown on an offer chip. */
  label: string;
  /** What the tool does (human description). */
  description: string;
  /** Sensitivity tier (mirrors the action). All current tools are safe/navigation. */
  sensitivity: NathaliaActionSensitivity;
  /** Whether running it needs explicit user confirmation. */
  requiresConfirmation: boolean;
  /** Target screen, for navigation/tour tools (drives visual intelligence). */
  targetContext?: NathaliaContextKey;
}
