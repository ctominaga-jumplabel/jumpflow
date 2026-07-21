/**
 * Shared types for Nathal.IA — the JumpFlow contextual assistant.
 *
 * This module is intentionally framework-agnostic and side-effect free so it
 * can be imported by the store, the React components and (later) by any
 * server-side action that wants to reason about Nathal.IA's vocabulary.
 *
 * NOTE: No LLM is wired up in this phase. These types describe the *shape* of
 * the assistant so a future model integration has a stable contract.
 */

// Type-only import: the proactive engine is pure and side-effect free, so this
// never creates a runtime cycle with the store.
import type { ProactiveNudge } from "./intelligence/proactive/ProactiveEngine";

/**
 * Emotional/visual states Nathal.IA can be in. Each maps to an expected 3D
 * pose/animation (see `nathaliaStates.ts`) with a CSS/2D fallback today.
 */
export type NathaliaStateKey =
  | "idle"
  | "welcome"
  | "listening"
  | "thinking"
  | "searching"
  | "explaining"
  | "pointing"
  | "happy"
  | "warning"
  | "error"
  | "success"
  | "celebrate";

/**
 * High-level visual intent of a state, used to drive accent colors and the
 * widget badge without hard-coding per-state styling everywhere.
 */
export type NathaliaIntent =
  | "neutral"
  | "positive"
  | "info"
  | "attention"
  | "negative";

/** Definition of a single emotional state. */
export interface NathaliaStateDefinition {
  /** Stable key (matches `NathaliaStateKey`). */
  key: NathaliaStateKey;
  /** Human label (pt-BR) for tooling/debug surfaces. */
  label: string;
  /** What the state means and when to use it. */
  description: string;
  /** Expected 3D pose / model clip name (see assets/models). */
  pose: string;
  /** Animation clip key (see `nathaliaAnimations.ts`). */
  animation: string;
  /** Default short message shown when entering this state with no override. */
  defaultMessage: string;
  /** Visual intent, drives accent color + badge. */
  intent: NathaliaIntent;
  /** Where this state is recommended (free-form guidance). */
  recommendedContext: string;
}

/**
 * Application areas Nathal.IA understands. Keys are stable/english while the
 * route mapping (pt-BR) lives in `nathaliaContext.ts`.
 */
export type NathaliaContextKey =
  | "general"
  | "dashboard"
  | "hours"
  | "expenses"
  | "projects"
  | "clients"
  | "consultants"
  | "approvals"
  | "reports"
  | "finance"
  | "settings";

/** A quick suggestion chip shown in the panel for a given context. */
export interface NathaliaSuggestion {
  /** Stable id, unique within its context. */
  id: string;
  /** Chip label shown to the user. */
  label: string;
  /** Mocked answer used until a real LLM is connected. */
  mockReply: string;
  /** Optional action id to run instead of (or after) replying. */
  action?: NathaliaActionId;
}

/** Per-context configuration: greeting, suggestions, default state, actions. */
export interface NathaliaContextDefinition {
  key: NathaliaContextKey;
  /** Human label (pt-BR). */
  label: string;
  /** Greeting/initial message when the panel opens in this context. */
  greeting: string;
  /** Default visual state for this context. */
  defaultState: NathaliaStateKey;
  /** Quick-reply suggestions. */
  suggestions: NathaliaSuggestion[];
  /** Action ids that are *conceptually* available here (gated by RBAC). */
  availableActions: NathaliaActionId[];
}

/**
 * Internal "tools" Nathal.IA can invoke. All are mocked/navigational today;
 * none touch sensitive data or perform writes. See `nathaliaActions.ts`.
 */
export type NathaliaActionId =
  | "navigateToHours"
  | "navigateToProjects"
  | "navigateToApprovals"
  | "navigateToReports"
  | "navigateToExpenses"
  | "highlightElement"
  | "startHoursTour"
  | "startApprovalsTour"
  | "showPendingMock";

/** Sensitivity tier used by the permission layer. */
export type NathaliaActionSensitivity = "safe" | "navigation" | "sensitive";

/** Static metadata describing an action (not its implementation). */
export interface NathaliaActionDefinition {
  id: NathaliaActionId;
  label: string;
  description: string;
  sensitivity: NathaliaActionSensitivity;
  /** Whether the action requires explicit user confirmation before running. */
  requiresConfirmation: boolean;
}

/** Visual mode of the floating widget. */
export type NathaliaWidgetMode =
  | "minimized"
  | "expanded"
  | "thinking"
  | "notifying"
  | "error";

/** Direction of a chat message in the (mocked) conversation log. */
export type NathaliaMessageRole = "nathalia" | "user";

export interface NathaliaMessage {
  id: string;
  role: NathaliaMessageRole;
  text: string;
  /** Epoch ms. Provided by the caller (the store does not read the clock). */
  createdAt: number;
}

/**
 * Minimal user shape Nathal.IA needs for RBAC. Intentionally decoupled from the
 * web app's `AppUser` so the package stays portable. Roles are plain strings;
 * the host maps its `RoleName` values in directly.
 */
export interface NathaliaUser {
  id: string;
  name?: string;
  roles: string[];
}

/** Full reactive state held by the Nathal.IA store. */
export interface NathaliaState {
  /** Whether the panel is open. */
  open: boolean;
  /** Widget visual mode. */
  widgetMode: NathaliaWidgetMode;
  /** Current emotional state. */
  state: NathaliaStateKey;
  /** Current contextual area. */
  context: NathaliaContextKey;
  /** Current headline message (bubble + panel). */
  message: string;
  /** Whether there is an unseen notification while minimized. */
  hasNotification: boolean;
  /** Mocked conversation log. */
  messages: NathaliaMessage[];
  /** Current user (for RBAC); null until the provider sets it. */
  user: NathaliaUser | null;
  /** Active tour id, or null when no tour is running. */
  activeTour: string | null;
  /** Active tour step index. */
  tourStep: number;
  /**
   * Accessory the brain chose for the current reply (Fase 8). Overrides the
   * per-screen default when set; `null` falls back to the contextual accessory.
   * Stored as the accessory key string to keep the store decoupled.
   */
  accessory: string | null;
  /**
   * Dynamic follow-up questions produced by the brain for the latest answer
   * (Fase 8). Empty when there is nothing to suggest beyond the static chips.
   */
  followUps: string[];
  /**
   * Whether Nathal.IA is "speaking" a reply right now (Fase 9). Drives the 2D
   * lip-sync (viseme cycling). Set briefly when a `nathalia` message is said.
   */
  speaking: boolean;
  /**
   * Current mouth shape (viseme key) when the speech engine drives it from the
   * real audio (Fase 9.4, via `onboundary`). `null` → the avatar falls back to
   * its own cyclic viseme loop. Stored as the bare key string to keep the store
   * decoupled from the expression module.
   */
  viseme: string | null;
  /**
   * The contextual nudge (Nível 2 card) currently presented on the minimized
   * widget, or null when none. Set via `presentNudge`, cleared by `dismissNudge`
   * and when the panel opens/closes. Type-only import to avoid a runtime cycle.
   */
  activeNudge: ProactiveNudge | null;
  /**
   * Whether Nathal.IA is mid-celebration (Nível 4). Drives a transient
   * `celebrate` visual that auto-clears after a timeout.
   */
  celebrating: boolean;
}
