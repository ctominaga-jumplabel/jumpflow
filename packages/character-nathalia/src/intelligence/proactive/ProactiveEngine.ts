/**
 * ProactiveEngine — gentle, safe nudges for Nathal.IA (Fase 8, Etapa 8).
 *
 * Design constraints (from the brief): only SAFE events, never aggressive, no
 * excessive interruption. The engine is a pure decision function — it does NOT
 * read the clock, DOM or network. The host fires explicit signals (first visit,
 * first time on a screen, user seems lost, a tour is available) and the engine
 * decides whether a *single, de-duplicated* nudge is warranted.
 *
 * It never produces a nudge while the panel is open (no interrupting an active
 * conversation), and each nudge id fires at most once per engine instance
 * (per session in practice).
 */
import { awarenessForContext } from "../context/contextAwareness";
import { canAskAboutApprovals, canAskAboutFinance } from "../../nathaliaPermissions";
import type { NathaliaActionId, NathaliaContextKey, NathaliaStateKey, NathaliaUser } from "../../nathaliaTypes";
import type { NathaliaSignals } from "./signals";

export type ProactiveTrigger =
  | "first-visit"
  | "first-screen-visit"
  | "user-lost"
  | "tour-available"
  | "signal";

/**
 * A single call-to-action offered alongside a nudge. `action` is restricted to
 * already-existing safe/navigation action ids — never a new or sensitive id.
 */
export interface ProactiveCta {
  /** Short pt-BR label. */
  label: string;
  /** Visual/semantic kind. `dismiss` simply closes the nudge. */
  kind: "primary" | "dismiss";
  /** Existing action id to run (omit for a pure dismiss). */
  action?: NathaliaActionId;
}

export interface ProactiveNudge {
  /** Stable id — also the de-dup key. */
  id: string;
  trigger: ProactiveTrigger;
  /** Short, friendly message (pt-BR). */
  message: string;
  /** Visual state to show on the minimized widget. */
  state: NathaliaStateKey;
  /** Optional safe tool/tour to offer (never sensitive). */
  action?: NathaliaActionId;
  /** Optional contextual CTAs (Nível 2 card). */
  ctas?: ProactiveCta[];
  /** Always gentle in this phase. */
  priority: "gentle";
}

export interface ProactiveSignal {
  trigger: ProactiveTrigger;
  context: NathaliaContextKey;
  user: NathaliaUser | null;
  /** Whether the panel is currently open (suppresses nudges). */
  isOpen: boolean;
  /** Roles, used to keep suggestions within RBAC. */
  roles?: string[];
}

/** Contexts that have a guided tour, and the tool that starts it. */
const TOURS: Partial<Record<NathaliaContextKey, NathaliaActionId>> = {
  hours: "startHoursTour",
  approvals: "startApprovalsTour",
};

export class ProactiveEngine {
  private readonly seen = new Set<string>();

  /** Forget all fired nudges (mainly for tests / a fresh session). */
  reset(): void {
    this.seen.clear();
  }

  /** Whether a nudge id has already fired. */
  hasFired(id: string): boolean {
    return this.seen.has(id);
  }

  /**
   * Evaluate a signal. Returns a nudge to show, or null when nothing should
   * fire (panel open, already shown, or no rule matches). Marks the nudge as
   * fired so it won't repeat.
   */
  evaluate(signal: ProactiveSignal): ProactiveNudge | null {
    if (signal.isOpen) return null;
    if (!signal.user) return null;

    const nudge = this.build(signal);
    if (!nudge) return null;
    if (this.seen.has(nudge.id)) return null;

    this.seen.add(nudge.id);
    return nudge;
  }

  /**
   * Evaluate real operational signals for the current screen. Returns a single
   * gentle nudge matching `signal.context`, or null. Same guards as `evaluate`:
   * suppressed while the panel is open or without a user, and de-duplicated by
   * the same `seen` Set so each signal nudge fires at most once per session.
   */
  evaluateSignals(signals: NathaliaSignals, signal: ProactiveSignal): ProactiveNudge | null {
    if (signal.isOpen) return null;
    if (!signal.user) return null;

    const nudge = this.buildSignal(signals, signal);
    if (!nudge) return null;
    if (this.seen.has(nudge.id)) return null;

    this.seen.add(nudge.id);
    return nudge;
  }

  private buildSignal(signals: NathaliaSignals, signal: ProactiveSignal): ProactiveNudge | null {
    switch (signal.context) {
      case "hours": {
        const hours = signals.hours;
        if (!hours || hours.loggedToday >= hours.expectedToday) return null;
        const missing = hours.expectedToday - hours.loggedToday;
        return {
          id: "signal:hours",
          trigger: "signal",
          message: `Você lançou apenas ${hours.loggedToday}h hoje. Faltam ${missing}h para completar sua jornada.`,
          state: "warning",
          priority: "gentle",
          ctas: [
            { label: "Lançar agora", kind: "primary", action: "navigateToHours" },
            { label: "Lembrar depois", kind: "dismiss" },
          ],
        };
      }

      case "approvals": {
        const pending = signals.approvals?.pending ?? 0;
        if (pending <= 0) return null;
        // RBAC defense-in-depth: the host already gates the approvals signal, but
        // the engine is public/reusable — never surface the pending count to a
        // user who cannot approve.
        if (!canAskAboutApprovals(signal.user)) return null;
        return {
          id: "signal:approvals",
          trigger: "signal",
          message: `Existem ${pending} lançamentos aguardando aprovação.`,
          state: "pointing",
          priority: "gentle",
          ctas: [
            { label: "Revisar agora", kind: "primary", action: "navigateToApprovals" },
            { label: "Agora não", kind: "dismiss" },
          ],
        };
      }

      case "projects": {
        const late = signals.projects?.lateActivities ?? 0;
        if (late <= 0) return null;
        return {
          id: "signal:projects",
          trigger: "signal",
          message: `Há ${late} ${late === 1 ? "atividade atrasada" : "atividades atrasadas"} nos projetos.`,
          state: "explaining",
          priority: "gentle",
          ctas: [
            { label: "Ver projetos", kind: "primary", action: "navigateToProjects" },
            { label: "Ok", kind: "dismiss" },
          ],
        };
      }

      case "reports":
      case "finance": {
        const delta = signals.reports?.productivityDeltaPct;
        if (delta === undefined || delta === 0) return null;
        // RBAC: productivity/financial insight is finance-gated.
        if (!canAskAboutFinance(signal.user)) return null;
        const sign = delta > 0 ? "+" : "-";
        const abs = Math.abs(delta);
        return {
          id: "signal:reports",
          trigger: "signal",
          message: `Identifiquei ${sign}${abs}% de produtividade no período.`,
          state: delta > 0 ? "happy" : "explaining",
          priority: "gentle",
          ctas: [
            { label: "Ver relatórios", kind: "primary", action: "navigateToReports" },
            { label: "Legal", kind: "dismiss" },
          ],
        };
      }

      default:
        return null;
    }
  }

  private build(signal: ProactiveSignal): ProactiveNudge | null {
    switch (signal.trigger) {
      case "first-visit":
        return {
          id: "first-visit",
          trigger: "first-visit",
          message:
            "Oi! Sou a Nathal.IA. Se quiser, posso te ajudar a navegar e entender cada tela.",
          state: "welcome",
          priority: "gentle",
        };

      case "first-screen-visit": {
        const awareness = awarenessForContext(signal.context, { roles: signal.roles });
        return {
          id: `screen:${signal.context}`,
          trigger: "first-screen-visit",
          message: awareness.message,
          state: "explaining",
          priority: "gentle",
        };
      }

      case "user-lost":
        return {
          id: `lost:${signal.context}`,
          trigger: "user-lost",
          message: "Precisa de uma mão por aqui? Posso explicar esta tela.",
          state: "explaining",
          priority: "gentle",
        };

      case "tour-available": {
        const action = TOURS[signal.context];
        if (!action) return null;
        return {
          id: `tour:${signal.context}`,
          trigger: "tour-available",
          message: "Quer um tour rápido desta tela? É só pedir.",
          state: "pointing",
          action,
          priority: "gentle",
        };
      }

      default:
        return null;
    }
  }
}

/** Shared default engine (one instance ≈ one session). */
export const defaultProactiveEngine = new ProactiveEngine();
