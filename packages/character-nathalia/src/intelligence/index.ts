/**
 * Nathal.IA Intelligence Layer (Fase 8) — the local, LLM-free "brain".
 *
 * Everything here is pure, deterministic and SSR-safe (no React, no `window`,
 * no `three`). It reads only curated content and never live user data. See
 * `docs/nathalia/INTELLIGENCE_ARCHITECTURE.md`.
 */

// Orchestrator
export {
  NathaliaBrain,
  defaultNathaliaBrain,
} from "./brain";
export type {
  BrainAnswerSource,
  BrainRequest,
  BrainResponse,
  NathaliaBrainDeps,
} from "./brain";

// Intent Engine
export { detectIntent } from "./intent";
export type { DetectedIntent, IntentOptions, NathaliaIntentKind } from "./intent";

// Knowledge Layer
export {
  KnowledgeRegistry,
  searchKnowledge,
  LocalKnowledgeProvider,
  defaultKnowledgeProvider,
  knowledgeDocuments,
} from "./knowledge";
export type {
  KnowledgeDocument,
  KnowledgeHit,
  KnowledgeProvider,
  KnowledgeSearchOptions,
} from "./knowledge";

// FAQ Engine
export {
  NathaliaFAQEngine,
  defaultFaqEngine,
  nathaliaFaqEntries,
} from "./faq";
export type { FaqQueryOptions, NathaliaFaqEntry, NathaliaFaqMatch } from "./faq";

// Tool Layer
export { ToolRegistry, defaultToolRegistry, nathaliaTools } from "./tools";
export type { NathaliaTool, NathaliaToolKind } from "./tools";

// Context Awareness V2
export { awarenessForContext, awarenessForPath } from "./context/contextAwareness";
export type { ContextAwareness, AwarenessOptions } from "./context/contextAwareness";

// Visual Intelligence
export { visualForIntent } from "./visual/visualIntelligence";
export type { VisualIntelligence, VisualIntelOptions } from "./visual/visualIntelligence";

// Proactive Layer
export { ProactiveEngine, defaultProactiveEngine, EMPTY_SIGNALS } from "./proactive";
export type {
  NathaliaSignals,
  ProactiveCta,
  ProactiveNudge,
  ProactiveSignal,
  ProactiveTrigger,
} from "./proactive";

// Text utilities (shared, deterministic)
export { normalizeText, tokenize, overlapScore } from "./text";
