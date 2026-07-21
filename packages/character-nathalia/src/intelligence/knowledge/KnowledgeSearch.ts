/**
 * KnowledgeSearch — deterministic, local keyword search over a registry.
 *
 * Scoring (no LLM):
 *  - token overlap with the title  (weight 0.55)
 *  - token overlap with the tags   (weight 0.30)
 *  - token overlap with the body   (weight 0.15)
 *  - small bonus for exact substring containment in the title
 *  - context match bonus (same screen the user is on)
 *
 * RBAC is enforced here: a document whose `roles` the user lacks is never even
 * scored, so restricted topics cannot leak through search.
 */
import { overlapScore, tokenize, normalizedIncludes } from "../text";
import type { KnowledgeRegistry } from "./KnowledgeRegistry";
import type {
  KnowledgeDocument,
  KnowledgeHit,
  KnowledgeSearchOptions,
} from "./types";

function userMaySee(doc: KnowledgeDocument, roles: string[] | undefined): boolean {
  if (!doc.roles || doc.roles.length === 0) return true;
  if (!roles || roles.length === 0) return false;
  return doc.roles.some((r) => roles.includes(r));
}

function scoreDocument(
  doc: KnowledgeDocument,
  queryTokens: string[],
  query: string,
  context: string | undefined,
): number {
  const titleScore = overlapScore(queryTokens, tokenize(doc.title));
  const tagScore = overlapScore(queryTokens, tokenize(doc.tags.join(" ")));
  const bodyScore = overlapScore(queryTokens, tokenize(doc.body));

  let score = titleScore * 0.55 + tagScore * 0.3 + bodyScore * 0.15;

  // Exact phrase appears in the title → strong signal.
  if (query.trim().length > 2 && normalizedIncludes(doc.title, query)) {
    score = Math.min(1, score + 0.25);
  }
  // Same screen the user is on → nudge up (but general stays neutral).
  if (context && doc.context === context && doc.context !== "general") {
    score = Math.min(1, score + 0.08);
  }
  return score;
}

/** Run a local search and return ranked, RBAC-filtered hits. */
export function searchKnowledge(
  registry: KnowledgeRegistry,
  query: string,
  options: KnowledgeSearchOptions = {},
): KnowledgeHit[] {
  const { context, roles, limit = 5, minScore = 0.2 } = options;
  const queryTokens = tokenize(query);
  if (queryTokens.length === 0) return [];

  const hits: KnowledgeHit[] = [];
  for (const doc of registry.list()) {
    if (!userMaySee(doc, roles)) continue;
    const score = scoreDocument(doc, queryTokens, query, context);
    if (score >= minScore) hits.push({ document: doc, score });
  }

  hits.sort((a, b) => b.score - a.score || a.document.id.localeCompare(b.document.id));
  return hits.slice(0, limit);
}
