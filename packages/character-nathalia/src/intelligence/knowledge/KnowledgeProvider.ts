/**
 * LocalKnowledgeProvider — the default, LLM-free KnowledgeProvider.
 *
 * Wraps a `KnowledgeRegistry` and the deterministic keyword search. This is the
 * documented seam (D-008): a future provider backed by embeddings/an LLM would
 * implement the same `KnowledgeProvider` interface and the rest of the brain
 * would not change.
 */
import { KnowledgeRegistry } from "./KnowledgeRegistry";
import { searchKnowledge } from "./KnowledgeSearch";
import { knowledgeDocuments } from "./documents";
import type {
  KnowledgeDocument,
  KnowledgeHit,
  KnowledgeProvider,
  KnowledgeSearchOptions,
} from "./types";

export class LocalKnowledgeProvider implements KnowledgeProvider {
  readonly registry: KnowledgeRegistry;

  constructor(registry: KnowledgeRegistry = new KnowledgeRegistry(knowledgeDocuments)) {
    this.registry = registry;
  }

  search(query: string, options?: KnowledgeSearchOptions): KnowledgeHit[] {
    return searchKnowledge(this.registry, query, options);
  }

  get(id: string): KnowledgeDocument | undefined {
    return this.registry.get(id);
  }
}

/** Shared default provider, seeded with the bundled documents. */
export const defaultKnowledgeProvider = new LocalKnowledgeProvider();
