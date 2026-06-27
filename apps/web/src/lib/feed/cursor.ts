/**
 * Keyset (seek) cursor for the feed listing. The order is
 * `(pinned DESC, createdAt DESC, id DESC)`: pinned posts first, then most
 * recent, with `id` as the deterministic tie-breaker. Pure module (no I/O), so
 * the cursor encode/decode and the seek predicate are unit-testable.
 *
 * Offset pagination is avoided because new posts/pins would shift the window;
 * keyset is stable and index-friendly (`@@index([status, pinned, createdAt])`).
 */

/** The three-part sort key that uniquely positions a post in the ordering. */
export interface FeedCursor {
  pinned: boolean;
  createdAt: Date;
  id: string;
}

/** Encode a cursor to an opaque, URL-safe string. */
export function encodeFeedCursor(cursor: FeedCursor): string {
  const payload = JSON.stringify({
    p: cursor.pinned ? 1 : 0,
    c: cursor.createdAt.toISOString(),
    i: cursor.id,
  });
  // base64url so it is safe in query strings / JSON without escaping.
  return Buffer.from(payload, "utf8").toString("base64url");
}

/** Decode an opaque cursor string, or null when malformed (fail-soft). */
export function decodeFeedCursor(raw: string | null | undefined): FeedCursor | null {
  if (!raw) return null;
  try {
    const json = Buffer.from(raw, "base64url").toString("utf8");
    const parsed = JSON.parse(json) as { p?: unknown; c?: unknown; i?: unknown };
    if (
      (parsed.p !== 0 && parsed.p !== 1) ||
      typeof parsed.c !== "string" ||
      typeof parsed.i !== "string"
    ) {
      return null;
    }
    const createdAt = new Date(parsed.c);
    if (Number.isNaN(createdAt.getTime())) return null;
    return { pinned: parsed.p === 1, createdAt, id: parsed.i };
  } catch {
    return null;
  }
}

/**
 * Prisma `where` fragment that selects rows STRICTLY AFTER the cursor in the
 * `(pinned DESC, createdAt DESC, id DESC)` order. Expressed as a lexicographic
 * OR-chain so it uses the composite index:
 *
 *   pinned < cursor.pinned
 *   OR (pinned = cursor.pinned AND createdAt < cursor.createdAt)
 *   OR (pinned = cursor.pinned AND createdAt = cursor.createdAt AND id < cursor.id)
 *
 * Note "after" in a DESC order means smaller values. `pinned` is a boolean, so
 * "less than the cursor pinned" only matters when the cursor is pinned (true):
 * the next page after a pinned row may be either further pinned rows OR the
 * unpinned section. We model boolean DESC as true(1) > false(0).
 */
export function feedSeekWhere(cursor: FeedCursor): Record<string, unknown> {
  const ors: Record<string, unknown>[] = [];
  // pinned DESC: a row is "after" the cursor if it is less pinned. Only the
  // transition true -> false exists, so add it only when the cursor is pinned.
  if (cursor.pinned) {
    ors.push({ pinned: false });
  }
  // same pinned bucket, older createdAt
  ors.push({ pinned: cursor.pinned, createdAt: { lt: cursor.createdAt } });
  // same pinned bucket, same instant, smaller id
  ors.push({
    pinned: cursor.pinned,
    createdAt: cursor.createdAt,
    id: { lt: cursor.id },
  });
  return { OR: ors };
}

/** The Prisma `orderBy` that realizes `(pinned DESC, createdAt DESC, id DESC)`. */
export const FEED_ORDER_BY = [
  { pinned: "desc" as const },
  { createdAt: "desc" as const },
  { id: "desc" as const },
];
