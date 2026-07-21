/** Knowledge Layer barrel (Fase 8). Pure, LLM-free, SSR-safe. */
export { KnowledgeRegistry } from "./KnowledgeRegistry";
export { searchKnowledge } from "./KnowledgeSearch";
export { LocalKnowledgeProvider, defaultKnowledgeProvider } from "./KnowledgeProvider";
export { knowledgeDocuments } from "./documents";
export type {
  KnowledgeDocument,
  KnowledgeHit,
  KnowledgeProvider,
  KnowledgeSearchOptions,
} from "./types";
