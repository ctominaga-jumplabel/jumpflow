/**
 * Knowledge Layer types for Nathal.IA (Fase 8).
 *
 * A `KnowledgeDocument` is one curated piece of help content (from the app's
 * docs, FAQs and screen copy). No LLM: search is local and deterministic.
 */
import type { NathaliaContextKey } from "../../nathaliaTypes";

/** A single curated knowledge unit. */
export interface KnowledgeDocument {
  /** Stable unique id. */
  id: string;
  /** Short human title (also a strong search signal). */
  title: string;
  /** Plain-text body shown/used as the answer. Keep it concise (pt-BR). */
  body: string;
  /** Extra keywords/synonyms that should match this doc. */
  tags: string[];
  /** App area this document belongs to (drives contextual ranking). */
  context: NathaliaContextKey;
  /**
   * Roles allowed to receive this document. `undefined`/empty = everyone.
   * Mirrors the host `RoleName` catalog (ADMIN, FINANCE, ...). Enforced by the
   * search layer so restricted topics never surface for the wrong profile.
   */
  roles?: string[];
  /** Where the content came from (doc path / screen), for traceability. */
  source: string;
}

/** A scored search hit. */
export interface KnowledgeHit {
  document: KnowledgeDocument;
  /** Relevance score in [0, 1]. */
  score: number;
}

/** Options accepted by a knowledge search. */
export interface KnowledgeSearchOptions {
  /** Restrict to a single context (still allows general). */
  context?: NathaliaContextKey;
  /** Roles of the asking user, for RBAC filtering. */
  roles?: string[];
  /** Max hits returned (default 5). */
  limit?: number;
  /** Minimum score to be considered a hit (default 0.2). */
  minScore?: number;
}

/**
 * Abstraction over "where knowledge comes from". The default implementation is
 * local + keyword-based; this is the documented seam for a future LLM/embedding
 * provider — nothing else in the brain needs to change when that arrives.
 */
export interface KnowledgeProvider {
  search(query: string, options?: KnowledgeSearchOptions): KnowledgeHit[];
  get(id: string): KnowledgeDocument | undefined;
}
