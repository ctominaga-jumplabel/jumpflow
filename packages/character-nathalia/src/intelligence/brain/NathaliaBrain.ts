/**
 * NathaliaBrain — the local, LLM-free orchestrator (Fase 8).
 *
 * `ask(question, { context, user })` runs the pipeline:
 *   intent → (navigation/tour ⇒ tool) | (FAQ ⇒ knowledge ⇒ fallback)
 * then derives the visual composition and assembles a `BrainResponse`. It reads
 * only curated content (FAQ + knowledge) and never live data. Every restricted
 * topic and tool is gated by the existing RBAC helpers, so nothing the user's
 * profile cannot access is ever surfaced.
 *
 * Pure and SSR-safe: no React, no `window`, no `three`. The React layer applies
 * the response to the store; the brain just decides.
 */
import { defaultFaqEngine, type NathaliaFAQEngine } from "../faq";
import {
  defaultKnowledgeProvider,
  type KnowledgeProvider,
} from "../knowledge";
import { detectIntent, type DetectedIntent } from "../intent";
import { defaultToolRegistry, ToolRegistry, type NathaliaTool } from "../tools";
import { visualForIntent, type VisualIntelligence } from "../visual/visualIntelligence";
import { awarenessForContext } from "../context/contextAwareness";
import { canAccessContext } from "../../nathaliaPermissions";
import { nathaliaCopy } from "../../nathaliaCopy";
import type { NathaliaContextKey, NathaliaUser } from "../../nathaliaTypes";

export type BrainAnswerSource =
  | "faq"
  | "knowledge"
  | "navigation"
  | "tour"
  | "greeting"
  | "blocked"
  | "fallback";

export interface BrainRequest {
  question: string;
  context: NathaliaContextKey;
  user: NathaliaUser | null;
}

export interface BrainResponse {
  /** The answer text to speak (pt-BR). */
  answer: string;
  /** The detected intent (exposed for the lab / analytics). */
  intent: DetectedIntent;
  /** Visual composition to apply (state + accessory + clip). */
  visual: VisualIntelligence;
  /** Where the answer came from. */
  source: BrainAnswerSource;
  /** A safe tool to run/offer, already RBAC-approved (or omitted). */
  tool?: NathaliaTool;
  /** Related knowledge document id ("saiba mais"), when applicable. */
  relatedDocId?: string;
  /** Suggested follow-up questions (RBAC-filtered). */
  followUps: string[];
}

export interface NathaliaBrainDeps {
  faqEngine?: NathaliaFAQEngine;
  knowledge?: KnowledgeProvider;
  toolRegistry?: ToolRegistry;
}

/** The concrete part of a response produced by tool resolution. */
type ToolOutcome = Pick<BrainResponse, "answer" | "source" | "visual"> & {
  tool?: NathaliaTool;
};

export class NathaliaBrain {
  private readonly faq: NathaliaFAQEngine;
  private readonly knowledge: KnowledgeProvider;
  private readonly tools: ToolRegistry;

  constructor(deps: NathaliaBrainDeps = {}) {
    this.faq = deps.faqEngine ?? defaultFaqEngine;
    this.knowledge = deps.knowledge ?? defaultKnowledgeProvider;
    this.tools = deps.toolRegistry ?? defaultToolRegistry;
  }

  ask(request: BrainRequest): BrainResponse {
    const { question, context, user } = request;
    const roles = user?.roles;
    const intent = detectIntent(question, { context });

    const followUps = this.followUps(context, roles, question);
    const base = { intent, followUps };

    // 1) Greeting.
    if (intent.kind === "greeting") {
      const awareness = awarenessForContext(context, { roles });
      return {
        ...base,
        answer: awareness.message,
        source: "greeting",
        visual: visualForIntent("greeting", { context }),
      };
    }

    // 2) Navigation / tour → propose a safe tool (RBAC-gated).
    if (intent.kind === "navigate" || intent.kind === "tour") {
      const target = intent.targetContext ?? context;
      const navResult = this.resolveTool(intent.kind, target, context, user);
      if (navResult) return { ...base, ...navResult };
      // No tool resolved → fall through to knowledge/FAQ.
    }

    // 3) FAQ — the curated, highest-precision answer.
    const faqMatch = this.faq.best(question, { context, roles });
    if (faqMatch) {
      const entry = faqMatch.entry;
      const tool = entry.action ? this.allowedTool(entry.action, user, entry.context) : undefined;
      return {
        ...base,
        answer: entry.answer,
        source: "faq",
        relatedDocId: entry.relatedDocId,
        visual: visualForIntent(intent.kind === "unknown" ? "explain" : intent.kind, {
          context,
          targetContext: intent.targetContext,
        }),
        tool,
      };
    }

    // 4) Knowledge base — broader curated content.
    const hits = this.knowledge.search(question, { context, roles, limit: 1 });
    if (hits.length > 0) {
      const doc = hits[0].document;
      return {
        ...base,
        answer: doc.body,
        source: "knowledge",
        relatedDocId: doc.id,
        visual: visualForIntent("explain", { context }),
      };
    }

    // 5) Honest fallback (no LLM yet).
    return {
      ...base,
      answer: nathaliaCopy.mockNotice,
      source: "fallback",
      visual: visualForIntent("unknown", { context }),
    };
  }

  /** Resolve a navigation/tour tool for a target, enforcing RBAC. */
  private resolveTool(
    kind: "navigate" | "tour",
    target: NathaliaContextKey,
    context: NathaliaContextKey,
    user: NathaliaUser | null,
  ): ToolOutcome | null {
    // Block navigating to a screen the profile cannot access.
    if (!canAccessContext(user, target)) {
      return {
        answer: nathaliaCopy.blockedByPermission,
        source: "blocked",
        visual: visualForIntent("explain", { context }),
      };
    }

    const candidate =
      kind === "tour"
        ? this.tools.list().find((t) => t.kind === "tour" && t.targetContext === target)
        : this.tools.forContext(target);
    if (!candidate) return null;

    const permission = this.tools.canRun(user, candidate.id);
    if (!permission.allowed) {
      return {
        answer: permission.reason ?? nathaliaCopy.blockedByPermission,
        source: "blocked",
        visual: visualForIntent("explain", { context }),
      };
    }

    const answer =
      kind === "tour"
        ? "Encontrei alguns pontos importantes para revisar."
        : `Te levo para ${candidate.targetContext ? labelFor(candidate.targetContext) : "lá"}. 👇`;
    return {
      answer,
      source: kind === "tour" ? "tour" : "navigation",
      visual: visualForIntent(kind, { context, targetContext: target }),
      tool: candidate,
    };
  }

  /** Return a tool only if the user may run it; otherwise undefined. */
  private allowedTool(
    id: NathaliaTool["id"],
    user: NathaliaUser | null,
    targetContext: NathaliaContextKey,
  ): NathaliaTool | undefined {
    const tool = this.tools.get(id);
    if (!tool) return undefined;
    if (!canAccessContext(user, targetContext)) return undefined;
    return this.tools.canRun(user, id).allowed ? tool : undefined;
  }

  private followUps(
    context: NathaliaContextKey,
    roles: string[] | undefined,
    question: string,
  ): string[] {
    const q = question.trim().toLowerCase();
    return awarenessForContext(context, { roles })
      .suggestedQuestions.filter((s) => s.toLowerCase() !== q)
      .slice(0, 3);
  }
}

function labelFor(context: NathaliaContextKey): string {
  const labels: Record<NathaliaContextKey, string> = {
    general: "o início",
    dashboard: "o Dashboard",
    hours: "Horas",
    expenses: "Despesas",
    projects: "Projetos",
    clients: "Clientes",
    consultants: "Consultores",
    approvals: "Aprovações",
    reports: "Relatórios",
    finance: "Financeiro",
    settings: "Acessos",
  };
  return labels[context] ?? "lá";
}

/** Shared default brain (bundled FAQ + knowledge + tools). */
export const defaultNathaliaBrain = new NathaliaBrain();
