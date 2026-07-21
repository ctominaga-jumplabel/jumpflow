/**
 * Lightweight external store powering Nathal.IA's "emotion engine".
 *
 * Why not Context-only or Zustand? The project has no Zustand dependency and
 * the requested API is a set of bare imperative setters
 * (`setNathaliaState("thinking")`, `openNathalia()`, ...) callable from
 * anywhere. A tiny `useSyncExternalStore`-compatible store gives us exactly
 * that: module-level setters plus a React hook, with no extra dependency.
 *
 * This module is framework-agnostic (no React import) and holds no JSX, so it
 * is safe to import from server code, tests, or client components alike.
 */
import { getNathaliaContext } from "./nathaliaContext";
import { getNathaliaState } from "./nathaliaStates";
import { nathaliaCopy } from "./nathaliaCopy";
import { nathaliaWelcome } from "./nathaliaWelcome";
import type { NathaliaAccessoryKey } from "./nathaliaAccessories";
import type { ProactiveNudge } from "./intelligence/proactive/ProactiveEngine";
import type {
  NathaliaContextKey,
  NathaliaMessage,
  NathaliaState,
  NathaliaStateKey,
  NathaliaUser,
  NathaliaWidgetMode,
} from "./nathaliaTypes";

const initialState: NathaliaState = {
  open: false,
  widgetMode: "minimized",
  state: "idle",
  context: "general",
  message: nathaliaCopy.genericGreeting,
  hasNotification: false,
  messages: [],
  user: null,
  activeTour: null,
  tourStep: 0,
  accessory: null,
  followUps: [],
  speaking: false,
  viseme: null,
  activeNudge: null,
  celebrating: false,
};

let state: NathaliaState = initialState;
const listeners = new Set<() => void>();
let messageSeq = 0;
let speakingTimer: ReturnType<typeof setTimeout> | null = null;
let celebrateTimer: ReturnType<typeof setTimeout> | null = null;

function emit() {
  for (const listener of listeners) listener();
}

function set(partial: Partial<NathaliaState>) {
  state = { ...state, ...partial };
  emit();
}

/** Subscribe to store changes. Returns an unsubscribe function. */
export function subscribeNathalia(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** Current immutable snapshot (stable reference between changes). */
export function getNathaliaSnapshot(): NathaliaState {
  return state;
}

/** Server snapshot — store starts closed/idle, identical to the initial state. */
export function getNathaliaServerSnapshot(): NathaliaState {
  return initialState;
}

// ---------------------------------------------------------------------------
// Imperative API (the "emotion engine"). All safe to call outside React.
// ---------------------------------------------------------------------------

/** Set the current visual/emotional state. */
export function setNathaliaState(next: NathaliaStateKey) {
  const mode: NathaliaWidgetMode =
    next === "thinking" || next === "searching"
      ? "thinking"
      : next === "error"
        ? "error"
        : state.open
          ? "expanded"
          : "minimized";
  set({ state: next, widgetMode: mode });
}

/** Set the headline message (bubble + panel header line). */
export function setNathaliaMessage(message: string) {
  set({ message });
}

/** Set (or clear) the accessory the assistant is currently presenting. */
export function setNathaliaAccessory(accessory: NathaliaAccessoryKey | null) {
  set({ accessory });
}

/** Replace the dynamic follow-up question suggestions. */
export function setNathaliaFollowUps(followUps: string[]) {
  set({ followUps });
}

/**
 * Apply a visual composition in one shot (Fase 8): emotional state + accessory.
 * Reuses `setNathaliaState`'s widget-mode logic, then pins the accessory.
 */
export function setNathaliaVisual(
  next: NathaliaStateKey,
  accessory: NathaliaAccessoryKey | null = null,
) {
  setNathaliaState(next);
  set({ accessory });
}

/**
 * Switch contextual area. Updates the default state and greeting headline for
 * that area. Does not clear the conversation log.
 */
export function setNathaliaContext(context: NathaliaContextKey) {
  if (context === state.context) return;
  const def = getNathaliaContext(context);
  set({
    context,
    state: def.defaultState,
    // Drop any reply-specific accessory so the new screen's default applies.
    accessory: null,
    followUps: [],
    // Only refresh the headline when the panel is closed, so an ongoing
    // conversation is not interrupted by a route change behind the panel. Use a
    // contextual welcome while the log is empty; otherwise keep the screen's
    // greeting as a lightweight cue.
    message: state.open
      ? state.message
      : state.messages.length === 0
        ? nathaliaWelcome(context, state.user).full
        : def.greeting,
  });
}

/** Open the panel. */
export function openNathalia() {
  const isFresh = state.messages.length === 0;
  set({
    open: true,
    widgetMode: "expanded",
    hasNotification: false,
    // Opening dismisses any pending contextual nudge.
    activeNudge: null,
    // Greet on open with a contextual, named welcome if the log is empty.
    message: isFresh
      ? nathaliaWelcome(state.context, state.user).full
      : state.message,
    state: isFresh ? "welcome" : state.state,
  });
}

/** Close the panel (returns to the minimized widget). */
export function closeNathalia() {
  set({
    open: false,
    widgetMode: "minimized",
    state: "idle",
    accessory: null,
    followUps: [],
    activeNudge: null,
  });
}

/** Toggle the panel open/closed. */
export function toggleNathalia() {
  if (state.open) closeNathalia();
  else openNathalia();
}

/** Force a specific widget visual mode. */
export function setNathaliaWidgetMode(mode: NathaliaWidgetMode) {
  set({ widgetMode: mode });
}

/**
 * Flag a notification on the minimized widget (e.g. a proactive nudge). Becomes
 * a no-op when the panel is already open.
 */
export function notifyNathalia(message?: string) {
  if (state.open) return;
  set({
    hasNotification: true,
    widgetMode: "notifying",
    message: message ?? state.message,
  });
}

/** Append a message to the (mocked) conversation log. */
export function sayNathalia(
  text: string,
  role: NathaliaMessage["role"] = "nathalia",
  visualState?: NathaliaStateKey,
) {
  const msg: NathaliaMessage = {
    id: `nat-${messageSeq++}`,
    role,
    text,
    createdAt: Date.now(),
  };
  const next: Partial<NathaliaState> = { messages: [...state.messages, msg] };
  if (role === "nathalia") {
    next.message = text;
    if (visualState) {
      next.state = visualState;
      next.widgetMode = state.open ? "expanded" : "minimized";
    }
  }
  set(next);
}

/** Set the speaking flag directly (e.g. driven by TTS start/end). */
export function setNathaliaSpeaking(value: boolean) {
  if (speakingTimer) {
    clearTimeout(speakingTimer);
    speakingTimer = null;
  }
  const next: Partial<NathaliaState> = {};
  if (state.speaking !== value) next.speaking = value;
  // Clear the audio-driven viseme when speech stops.
  if (!value && state.viseme !== null) next.viseme = null;
  if (Object.keys(next).length) set(next);
}

/** Set the current audio-driven mouth shape (viseme key), or null to release. */
export function setNathaliaViseme(viseme: string | null) {
  if (state.viseme !== viseme) set({ viseme });
}

/**
 * Mark Nathal.IA as speaking for `durationMs`, then auto-clear. Timer-based
 * fallback for lip-sync when there is no TTS audio to sync to. Client-only.
 */
export function startNathaliaSpeaking(durationMs = 1500) {
  if (typeof window === "undefined") return;
  if (speakingTimer) clearTimeout(speakingTimer);
  set({ speaking: true });
  speakingTimer = setTimeout(() => {
    speakingTimer = null;
    set({ speaking: false });
  }, durationMs);
}

/** Stop the speaking animation immediately. */
export function stopNathaliaSpeaking() {
  if (speakingTimer) {
    clearTimeout(speakingTimer);
    speakingTimer = null;
  }
  if (state.speaking) set({ speaking: false });
}

/**
 * Present a contextual nudge (Nível 2 card) on the minimized widget. No-op when
 * the panel is open — a proactive nudge never interrupts an active conversation.
 */
export function presentNudge(nudge: ProactiveNudge) {
  if (state.open) return;
  set({
    activeNudge: nudge,
    hasNotification: true,
    widgetMode: "notifying",
    message: nudge.message,
    state: nudge.state,
  });
}

/** Dismiss the active contextual nudge (user acted on / ignored it). */
export function dismissNudge() {
  set({
    activeNudge: null,
    hasNotification: false,
    widgetMode: state.open ? "expanded" : "minimized",
  });
}

/**
 * Celebrate a positive moment (Nível 4). Client-only and timer-based, with a
 * timer separate from the speaking timer. Shows the `celebrate` visual, then
 * auto-clears: returns to `idle` only if nothing else changed the state since.
 */
export function celebrateNathalia(message?: string, durationMs = 3200) {
  if (typeof window === "undefined") return;
  if (celebrateTimer) clearTimeout(celebrateTimer);
  // Remember the pre-celebration headline so the minimized widget reverts to a
  // sensible message instead of being stuck on the celebration text afterwards.
  const previousMessage = state.message;
  set({
    celebrating: true,
    state: "celebrate",
    message: message ?? state.message,
    widgetMode: state.open ? "expanded" : "notifying",
    hasNotification: !state.open,
  });
  celebrateTimer = setTimeout(() => {
    celebrateTimer = null;
    const next: Partial<NathaliaState> = { celebrating: false };
    if (state.state === "celebrate") next.state = "idle";
    // When the panel is closed, fully retire the transient celebration cue:
    // clear the notification badge, drop back to the minimized widget and
    // restore the previous headline. (If the panel is open, leave it untouched.)
    if (!state.open) {
      next.hasNotification = false;
      next.widgetMode = "minimized";
      next.message = previousMessage;
    }
    set(next);
  }, durationMs);
}

/** Set/clear the current user (RBAC). */
export function setNathaliaUser(user: NathaliaUser | null) {
  set({ user });
}

/** Begin a named tour. */
export function startNathaliaTour(tourId: string) {
  set({ activeTour: tourId, tourStep: 0, open: false, state: "pointing" });
}

/** Advance the active tour by one step. */
export function advanceNathaliaTour() {
  set({ tourStep: state.tourStep + 1 });
}

/** Stop any running tour. */
export function stopNathaliaTour() {
  set({ activeTour: null, tourStep: 0, state: "idle" });
}

/** Reset everything (mainly for tests). */
export function resetNathalia() {
  if (speakingTimer) {
    clearTimeout(speakingTimer);
    speakingTimer = null;
  }
  if (celebrateTimer) {
    clearTimeout(celebrateTimer);
    celebrateTimer = null;
  }
  state = initialState;
  messageSeq = 0;
  emit();
}
