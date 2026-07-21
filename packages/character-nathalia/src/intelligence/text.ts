/**
 * Tiny, dependency-free pt-BR text helpers shared by the local brain
 * (knowledge search, FAQ matching and the intent engine).
 *
 * No LLM, no external NLP — just normalization + token overlap scoring so the
 * whole module is deterministic, SSR-safe and trivially testable.
 */

/** Portuguese stop-words intentionally ignored when scoring overlap. */
const STOP_WORDS = new Set([
  "a", "o", "as", "os", "um", "uma", "uns", "umas", "de", "da", "do", "das",
  "dos", "e", "ou", "que", "qual", "quais", "quem", "como", "onde", "quando",
  "para", "pra", "por", "com", "sem", "em", "no", "na", "nos", "nas", "ao",
  "aos", "se", "sou", "eu", "voce", "vc", "meu", "minha", "meus", "minhas",
  "isso", "isto", "esse", "essa", "este", "esta", "ja", "nao", "sim", "ser",
  "estar", "the", "is", "of", "to",
]);

// Combining diacritical marks (U+0300–U+036F) stripped after NFD normalization.
const COMBINING_MARKS = /[\u0300-\u036f]/g;

/**
 * Lowercase, strip diacritics and non-alphanumerics. Used everywhere so
 * "Aprovação" and "aprovacao" compare equal.
 */
export function normalizeText(value: string): string {
  return value
    .toLowerCase()
    .normalize("NFD")
    .replace(COMBINING_MARKS, "")
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** Normalize then split into meaningful tokens (stop-words removed). */
export function tokenize(value: string): string[] {
  return normalizeText(value)
    .split(" ")
    .filter((t) => t.length > 1 && !STOP_WORDS.has(t));
}

/** Whether the normalized haystack contains the normalized needle. */
export function normalizedIncludes(haystack: string, needle: string): boolean {
  return normalizeText(haystack).includes(normalizeText(needle));
}

/**
 * Overlap score between a query and a document's tokens, in [0, 1]. A small
 * bonus rewards exact substring containment so short, precise FAQ titles win.
 */
export function overlapScore(queryTokens: string[], docTokens: string[]): number {
  if (queryTokens.length === 0 || docTokens.length === 0) return 0;
  const docSet = new Set(docTokens);
  let hits = 0;
  for (const t of queryTokens) if (docSet.has(t)) hits += 1;
  return hits / queryTokens.length;
}
