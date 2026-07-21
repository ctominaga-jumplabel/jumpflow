/**
 * FAQ types for Nathal.IA (Fase 8).
 *
 * A FAQ entry is a curated question→answer pair tied to an app context. It may
 * optionally offer a (safe, mocked) tool and link to a knowledge document.
 * No LLM — matching is local keyword overlap.
 */
import type { NathaliaActionId, NathaliaContextKey } from "../../nathaliaTypes";

export interface NathaliaFaqEntry {
  /** Stable unique id (prefixed by topic, e.g. "faq-hours-log"). */
  id: string;
  /** Canonical question (pt-BR). */
  question: string;
  /** Alternate phrasings / keywords that should also match this entry. */
  variations: string[];
  /** Curated answer (pt-BR). Concept-level, never live data. */
  answer: string;
  /** App area this FAQ belongs to. */
  context: NathaliaContextKey;
  /** Roles allowed to receive this answer (undefined/empty = everyone). */
  roles?: string[];
  /** Optional safe tool to offer alongside the answer. */
  action?: NathaliaActionId;
  /** Optional related knowledge document id (for "saiba mais"). */
  relatedDocId?: string;
}

export interface NathaliaFaqMatch {
  entry: NathaliaFaqEntry;
  /** Relevance score in [0, 1]. */
  score: number;
}
