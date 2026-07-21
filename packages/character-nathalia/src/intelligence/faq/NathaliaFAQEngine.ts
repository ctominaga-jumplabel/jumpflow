/**
 * NathaliaFAQEngine — matches a free-text question to a curated FAQ entry.
 *
 * Deterministic and LLM-free: scores token overlap against each entry's
 * question + variations, with a small bonus for same-context entries and exact
 * phrase containment. RBAC is enforced — entries the user's roles cannot see
 * are never matched.
 */
import { normalizedIncludes, overlapScore, tokenize } from "../text";
import { nathaliaFaqEntries } from "./entries";
import type { NathaliaFaqEntry, NathaliaFaqMatch } from "./types";
import type { NathaliaContextKey } from "../../nathaliaTypes";

export interface FaqQueryOptions {
  /** Current screen context (boosts entries from the same area). */
  context?: NathaliaContextKey;
  /** Roles of the asking user (RBAC filter). */
  roles?: string[];
  /** Minimum score to count as a match (default 0.34). */
  minScore?: number;
}

function userMaySee(entry: NathaliaFaqEntry, roles: string[] | undefined): boolean {
  if (!entry.roles || entry.roles.length === 0) return true;
  if (!roles || roles.length === 0) return false;
  return entry.roles.some((r) => roles.includes(r));
}

function scoreEntry(
  entry: NathaliaFaqEntry,
  queryTokens: string[],
  query: string,
  context: NathaliaContextKey | undefined,
): number {
  const questionScore = overlapScore(queryTokens, tokenize(entry.question));
  const variationScore = Math.max(
    0,
    ...entry.variations.map((v) => overlapScore(queryTokens, tokenize(v))),
  );
  let score = Math.max(questionScore, variationScore * 0.95);

  if (query.trim().length > 2) {
    if (normalizedIncludes(entry.question, query)) score = Math.min(1, score + 0.3);
    else if (entry.variations.some((v) => normalizedIncludes(v, query))) {
      score = Math.min(1, score + 0.2);
    }
  }
  if (context && entry.context === context) score = Math.min(1, score + 0.1);
  return score;
}

export class NathaliaFAQEngine {
  private readonly entries: NathaliaFaqEntry[];

  constructor(entries: NathaliaFaqEntry[] = nathaliaFaqEntries) {
    this.entries = entries;
  }

  /** All entries visible to the given roles (optionally a single context). */
  list(options: { context?: NathaliaContextKey; roles?: string[] } = {}): NathaliaFaqEntry[] {
    return this.entries.filter(
      (e) =>
        userMaySee(e, options.roles) &&
        (!options.context || e.context === options.context),
    );
  }

  /** Ranked matches for a query, RBAC-filtered. */
  match(query: string, options: FaqQueryOptions = {}): NathaliaFaqMatch[] {
    const { context, roles, minScore = 0.34 } = options;
    const queryTokens = tokenize(query);
    if (queryTokens.length === 0) return [];

    const matches: NathaliaFaqMatch[] = [];
    for (const entry of this.entries) {
      if (!userMaySee(entry, roles)) continue;
      const score = scoreEntry(entry, queryTokens, query, context);
      if (score >= minScore) matches.push({ entry, score });
    }
    matches.sort((a, b) => b.score - a.score || a.entry.id.localeCompare(b.entry.id));
    return matches;
  }

  /** Single best match for a query, or null when nothing clears the threshold. */
  best(query: string, options: FaqQueryOptions = {}): NathaliaFaqMatch | null {
    return this.match(query, options)[0] ?? null;
  }
}

/** Shared default engine seeded with the bundled FAQ catalogue. */
export const defaultFaqEngine = new NathaliaFAQEngine();
