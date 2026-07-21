"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useSyncExternalStore,
} from "react";
import { usePathname, useRouter } from "next/navigation";
import {
  createNathaliaActions,
  type NathaliaActionContext,
  type NathaliaActionRuntime,
  type NathaliaActionRunner,
} from "./nathaliaActions";
import { contextForPath, getNathaliaContext } from "./nathaliaContext";
import { setNathaliaActive } from "./nathaliaRuntime";
import { canExecuteAction } from "./nathaliaPermissions";
import { nathaliaCopy } from "./nathaliaCopy";
import { defaultNathaliaBrain } from "./intelligence/brain";
import { defaultProactiveEngine } from "./intelligence/proactive";
import type { NathaliaSignals } from "./intelligence/proactive/signals";
import { voiceNathaliaCached, voiceNathaliaReply } from "./nathaliaSpeech";
import { NATHALIA_WELCOME_VOICE } from "./nathaliaVoiceLibrary";
import {
  getNathaliaServerSnapshot,
  getNathaliaSnapshot,
  notifyNathalia,
  presentNudge,
  sayNathalia,
  setNathaliaAccessory,
  setNathaliaContext,
  setNathaliaFollowUps,
  setNathaliaState,
  setNathaliaUser,
  startNathaliaTour,
  subscribeNathalia,
} from "./nathaliaStore";
import type {
  NathaliaActionId,
  NathaliaState,
  NathaliaSuggestion,
  NathaliaUser,
} from "./nathaliaTypes";

/** Helpers that need a host runtime (router, DOM) and so cannot be bare setters. */
interface NathaliaActionsApi {
  /** Run an action by id, enforcing RBAC. Returns whether it ran. */
  runAction: (id: NathaliaActionId, ctx?: NathaliaActionContext) => boolean;
  /** Handle a suggestion chip: mock reply + optional action. */
  runSuggestion: (suggestion: NathaliaSuggestion) => void;
  /** Send a free-text user message and produce a mocked reply. */
  sendMessage: (text: string) => void;
}

const NathaliaActionsContext = createContext<NathaliaActionsApi | null>(null);

export interface NathaliaProviderProps {
  /** Current authenticated user for RBAC (null while unknown). */
  user?: NathaliaUser | null;
  /**
   * Real operational signals the host computes (hours, approvals, late
   * activities, productivity delta). Drives the contextual signal nudges.
   */
  signals?: NathaliaSignals;
  children: React.ReactNode;
}

/**
 * Provides the Nathal.IA action runtime and keeps the store in sync with the
 * current user (RBAC) and route (context engine). The reactive *state* lives in
 * the external store (`nathaliaStore`); this provider only supplies the
 * host-bound behaviors that need the Next router or the DOM.
 */
export function NathaliaProvider({ user = null, signals = {}, children }: NathaliaProviderProps) {
  const router = useRouter();
  const pathname = usePathname();
  const snapshot = useNathaliaSnapshot();

  // Mark Nathal.IA as live while the provider is mounted. The provider only
  // mounts when the server-side NATHALIA_ENABLED master switch is on, so this is
  // the single client-side source of truth for product seams (e.g. timesheet
  // cues) deciding whether to fire voice/celebrate. Off => seams no-op.
  useEffect(() => {
    setNathaliaActive(true);
    return () => setNathaliaActive(false);
  }, []);

  // Keep the store's user in sync for RBAC.
  useEffect(() => {
    setNathaliaUser(user);
  }, [user]);

  // Context engine: derive the area from the route.
  useEffect(() => {
    setNathaliaContext(contextForPath(pathname));
  }, [pathname]);

  // Proactive layer (gentle): a single, de-duplicated welcome nudge per session.
  // Never opens the panel or interrupts — only flags the minimized widget.
  useEffect(() => {
    if (!user) return;
    const nudge = defaultProactiveEngine.evaluate({
      trigger: "first-visit",
      context: contextForPath(pathname),
      user,
      isOpen: getNathaliaSnapshot().open,
      roles: user.roles,
    });
    if (nudge) notifyNathalia(nudge.message);
  }, [user, pathname]);

  // Signal layer (gentle): turn real operational signals into a single,
  // de-duplicated contextual nudge for the current screen. Never opens the
  // panel; `presentNudge` is a no-op while it is open.
  useEffect(() => {
    if (!user) return;
    const context = contextForPath(pathname);
    const nudge = defaultProactiveEngine.evaluateSignals(signals ?? {}, {
      trigger: "signal",
      context,
      user,
      isOpen: getNathaliaSnapshot().open,
      roles: user.roles,
    });
    if (nudge) presentNudge(nudge);
  }, [signals, pathname, user]);

  // Spoken welcome: the first time the panel is opened in a fresh session (empty
  // log), Nathal.IA greets aloud with her recorded voice. Opening is a user
  // gesture, so autoplay is allowed; muting is respected downstream. Runs once.
  const spokeWelcomeRef = useRef(false);
  useEffect(() => {
    if (!snapshot.open || spokeWelcomeRef.current) return;
    if (snapshot.messages.length > 0) return;
    spokeWelcomeRef.current = true;
    voiceNathaliaCached(NATHALIA_WELCOME_VOICE.text, NATHALIA_WELCOME_VOICE.audioSrc);
  }, [snapshot.open, snapshot.messages.length]);

  const runtime = useMemo<NathaliaActionRuntime>(
    () => ({
      navigate: (path) => router.push(path),
      highlight: (elementId) => highlightElement(elementId),
      startTour: (tourId) => startNathaliaTour(tourId),
      say: (text, state) => sayNathalia(text, "nathalia", state),
      setState: (state) => setNathaliaState(state),
    }),
    [router],
  );

  const boundActions = useMemo<Record<NathaliaActionId, NathaliaActionRunner>>(
    () => createNathaliaActions(runtime),
    [runtime],
  );

  // `user` from the store snapshot is the source of truth for RBAC decisions.
  const currentUser = snapshot.user;

  const runAction = useCallback(
    (id: NathaliaActionId, ctx?: NathaliaActionContext) => {
      const permission = canExecuteAction(currentUser, id);
      if (!permission.allowed) {
        sayNathalia(permission.reason ?? nathaliaCopy.blockedByPermission, "nathalia", "warning");
        return false;
      }
      boundActions[id]?.(ctx);
      return true;
    },
    [boundActions, currentUser],
  );

  const runSuggestion = useCallback(
    (suggestion: NathaliaSuggestion) => {
      sayNathalia(suggestion.label, "user");
      // Mock "thinking" beat, then reply. No timers needed for correctness;
      // we set thinking then immediately reply so the log stays deterministic.
      setNathaliaState("thinking");
      sayNathalia(suggestion.mockReply, "nathalia", "explaining");
      // Voice the reply: exact recorded line if any, else a navigation cue when
      // the chip navigates. Other chips stay silent unless their text matches.
      voiceNathaliaReply(suggestion.mockReply, {
        source: suggestion.action?.startsWith("navigateTo") ? "navigation" : undefined,
      });
      setNathaliaFollowUps([]);
      if (suggestion.action) runAction(suggestion.action);
    },
    [runAction],
  );

  const sendMessage = useCallback(
    (text: string) => {
      const trimmed = text.trim();
      if (!trimmed) return;
      const snap = getNathaliaSnapshot();
      sayNathalia(trimmed, "user");
      // Local, LLM-free brain: intent → FAQ/knowledge → answer + visual + tool.
      const response = defaultNathaliaBrain.ask({
        question: trimmed,
        context: snap.context,
        user: snap.user,
      });
      sayNathalia(response.answer, "nathalia", response.visual.state);
      // Speak the reply + drive lip-sync: exact recorded line, else a cue from
      // the answer source (navigation/fallback) or visual state.
      voiceNathaliaReply(response.answer, {
        source: response.source,
        state: response.visual.state,
      });
      setNathaliaAccessory(response.visual.accessory);
      setNathaliaFollowUps(response.followUps);
      // Only auto-run safe tools that need no confirmation (navigation/tour).
      // Sensitive tools are blocked upstream and would require explicit consent.
      if (response.tool && !response.tool.requiresConfirmation) {
        runAction(response.tool.id);
      }
    },
    [runAction],
  );

  const api = useMemo<NathaliaActionsApi>(
    () => ({ runAction, runSuggestion, sendMessage }),
    [runAction, runSuggestion, sendMessage],
  );

  return (
    <NathaliaActionsContext.Provider value={api}>
      {children}
    </NathaliaActionsContext.Provider>
  );
}

/** Subscribe to the reactive Nathal.IA state. */
export function useNathaliaSnapshot(): NathaliaState {
  return useSyncExternalStore(
    subscribeNathalia,
    getNathaliaSnapshot,
    getNathaliaServerSnapshot,
  );
}

/** Access the host-bound action API. Must be used under `NathaliaProvider`. */
export function useNathaliaActions(): NathaliaActionsApi {
  const ctx = useContext(NathaliaActionsContext);
  if (!ctx) {
    throw new Error("useNathaliaActions must be used within a NathaliaProvider");
  }
  return ctx;
}

/**
 * Like `useNathaliaActions` but returns `null` instead of throwing when used
 * outside a `NathaliaProvider`. Lets provider-agnostic layers (e.g. the
 * presence card rendered by `NathaliaRoot`) degrade gracefully — `NathaliaRoot`
 * is intentionally decoupled from the provider.
 */
export function useNathaliaActionsOptional(): NathaliaActionsApi | null {
  return useContext(NathaliaActionsContext);
}

/**
 * Convenience hook combining reactive state, the host-bound action API and the
 * current context definition. Most components only need this.
 */
export function useNathalia() {
  const state = useNathaliaSnapshot();
  const actions = useNathaliaActions();
  const contextDef = getNathaliaContext(state.context);
  return { ...state, ...actions, contextDef };
}

/**
 * Briefly outline an element by id without depending on app CSS. Used by the
 * `highlightElement` action and tours. Returns whether the element was found.
 */
function highlightElement(elementId: string): boolean {
  if (typeof document === "undefined") return false;
  const el = document.getElementById(elementId);
  if (!el) return false;

  el.scrollIntoView({ behavior: "smooth", block: "center" });
  const previousOutline = el.style.outline;
  const previousOffset = el.style.outlineOffset;
  el.style.outline = "3px solid var(--color-brand, #2457ff)";
  el.style.outlineOffset = "3px";
  window.setTimeout(() => {
    el.style.outline = previousOutline;
    el.style.outlineOffset = previousOffset;
  }, 2200);
  return true;
}
