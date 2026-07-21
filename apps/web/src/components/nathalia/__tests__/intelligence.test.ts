/**
 * Fase 8 — Nathal.IA local intelligence layer.
 *
 * Covers the deterministic, LLM-free brain: intent detection, RBAC filtering in
 * the FAQ + knowledge layers, the brain orchestration flow, visual intelligence
 * and proactive de-duplication.
 */
import { describe, it, expect } from "vitest";
import {
  ProactiveEngine,
  awarenessForContext,
  defaultFaqEngine,
  defaultKnowledgeProvider,
  defaultNathaliaBrain,
  detectIntent,
  visualForIntent,
} from "@jumpflow/character-nathalia";

const CONSULTANT = { id: "c", name: "C", roles: ["CONSULTANT"] };
const ADMIN = { id: "a", name: "A", roles: ["ADMIN"] };

describe("IntentEngine", () => {
  it("detects a greeting only when it leads a short message", () => {
    expect(detectIntent("oi").kind).toBe("greeting");
  });

  it("detects navigation with a named target", () => {
    const intent = detectIntent("ir para projetos");
    expect(intent.kind).toBe("navigate");
    expect(intent.targetContext).toBe("projects");
  });

  it("detects a procedural how-to as teach", () => {
    expect(detectIntent("Como lançar horas?").kind).toBe("teach");
  });

  it("detects a conceptual question as explain", () => {
    expect(detectIntent("o que é alocação?").kind).toBe("explain");
  });
});

describe("FAQ RBAC", () => {
  it("hides approval FAQs from a consultant", () => {
    // RBAC must keep approvals entries out of the consultant's results entirely,
    // even if an unrelated (allowed) entry happens to match on a shared word.
    const matches = defaultFaqEngine.match("o que é aprovação automática?", {
      roles: CONSULTANT.roles,
    });
    expect(matches.every((m) => m.entry.context !== "approvals")).toBe(true);
  });

  it("surfaces approval FAQs for an approver", () => {
    const match = defaultFaqEngine.best("o que é aprovação automática?", {
      roles: ADMIN.roles,
    });
    expect(match?.entry.context).toBe("approvals");
  });
});

describe("Knowledge RBAC", () => {
  it("never returns finance docs to a consultant", () => {
    const hits = defaultKnowledgeProvider.search("fechamento financeiro", {
      roles: CONSULTANT.roles,
    });
    expect(hits.every((h) => h.document.context !== "finance")).toBe(true);
  });

  it("returns the finance doc for a finance profile", () => {
    const hits = defaultKnowledgeProvider.search("fechamento financeiro", {
      roles: ["FINANCE"],
    });
    expect(hits.some((h) => h.document.context === "finance")).toBe(true);
  });
});

describe("NathaliaBrain", () => {
  it("answers a hours how-to from the FAQ", () => {
    const res = defaultNathaliaBrain.ask({
      question: "Como lançar horas?",
      context: "hours",
      user: CONSULTANT,
    });
    expect(res.source).toBe("faq");
    expect(res.answer.toLowerCase()).toContain("período");
    expect(res.visual.state).toBe("explaining");
  });

  it("offers a navigation tool when asked to go somewhere allowed", () => {
    const res = defaultNathaliaBrain.ask({
      question: "ir para horas",
      context: "general",
      user: CONSULTANT,
    });
    expect(res.source).toBe("navigation");
    expect(res.tool?.id).toBe("navigateToHours");
  });

  it("blocks navigation to a restricted screen", () => {
    const res = defaultNathaliaBrain.ask({
      question: "ir para acessos",
      context: "general",
      user: CONSULTANT,
    });
    expect(res.source).toBe("blocked");
    expect(res.tool).toBeUndefined();
  });

  it("falls back honestly when nothing matches", () => {
    const res = defaultNathaliaBrain.ask({
      question: "zzz qwerty asdf",
      context: "general",
      user: CONSULTANT,
    });
    expect(res.source).toBe("fallback");
  });
});

describe("Visual intelligence", () => {
  it("maps a teach intent on hours to explaining + clipboard + Explaining", () => {
    const visual = visualForIntent("teach", { context: "hours" });
    expect(visual.state).toBe("explaining");
    expect(visual.accessory).toBe("clipboard");
    expect(visual.clip).toBe("Explaining");
  });
});

describe("Context awareness", () => {
  it("gives a screen-specific hours message", () => {
    const awareness = awarenessForContext("hours", { roles: CONSULTANT.roles });
    expect(awareness.message.toLowerCase()).toContain("horas");
    expect(awareness.suggestedQuestions.length).toBeGreaterThan(0);
  });

  it("omits restricted suggestions for a consultant on approvals", () => {
    const awareness = awarenessForContext("approvals", { roles: CONSULTANT.roles });
    expect(awareness.suggestedQuestions.length).toBe(0);
  });
});

describe("ProactiveEngine", () => {
  it("fires a first-visit nudge once and then de-duplicates", () => {
    const engine = new ProactiveEngine();
    const signal = {
      trigger: "first-visit" as const,
      context: "general" as const,
      user: CONSULTANT,
      isOpen: false,
      roles: CONSULTANT.roles,
    };
    expect(engine.evaluate(signal)?.trigger).toBe("first-visit");
    expect(engine.evaluate(signal)).toBeNull();
  });

  it("never nudges while the panel is open", () => {
    const engine = new ProactiveEngine();
    const nudge = engine.evaluate({
      trigger: "first-visit",
      context: "general",
      user: CONSULTANT,
      isOpen: true,
      roles: CONSULTANT.roles,
    });
    expect(nudge).toBeNull();
  });
});
