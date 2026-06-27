import type { FeedContentStatus, FeedVisibility } from "./visibility";

/**
 * UI-facing shapes for the Feed social interno + pure helpers that map/aggregate
 * raw rows into them. No I/O here — the DB read layer (`lib/db/feed.ts`) loads
 * the rows and calls these so the shaping logic is unit-testable.
 */

export interface FeedReactionSummary {
  emoji: string;
  count: number;
  /** Whether the current viewer has this reaction. */
  reacted: boolean;
}

export interface FeedAttachmentMeta {
  id: string;
  fileName: string;
  contentType: string;
  size: number;
}

export interface FeedAuthorMeta {
  id: string | null;
  name: string;
}

export interface FeedCommentView {
  id: string;
  author: FeedAuthorMeta;
  /** Null when the content is a tombstone (removed/deleted). */
  body: string | null;
  status: FeedContentStatus;
  /** Tombstone label when body is null, else undefined. */
  tombstone?: string;
  editedAt: string | null;
  createdAt: string;
  reactions: FeedReactionSummary[];
  /** Viewer authored this comment (drives edit/delete affordances). */
  isOwn: boolean;
}

export interface FeedPostView {
  id: string;
  author: FeedAuthorMeta;
  body: string | null;
  status: FeedContentStatus;
  visibility: FeedVisibility;
  pinned: boolean;
  tombstone?: string;
  editedAt: string | null;
  createdAt: string;
  reactions: FeedReactionSummary[];
  attachments: FeedAttachmentMeta[];
  /** The 3 most recent comments (already cropped/tombstoned). */
  comments: FeedCommentView[];
  /** Total VISIBLE comment count (drives the "ver mais" affordance). */
  commentCount: number;
  isOwn: boolean;
}

export interface FeedPage {
  posts: FeedPostView[];
  /** Opaque cursor for the next page, or null when there are no more. */
  nextCursor: string | null;
}

/** Human tombstone label per non-VISIBLE status. */
export function tombstoneLabel(status: FeedContentStatus): string {
  switch (status) {
    case "DELETED_BY_AUTHOR":
      return "Conteúdo removido pelo autor.";
    case "REMOVED_BY_MODERATION":
      return "Conteúdo removido pela moderação.";
    default:
      return "";
  }
}

/** A raw reaction row as needed for aggregation (DB-shape agnostic). */
export interface RawReaction {
  emoji: string;
  userId: string;
}

/**
 * Aggregate reactions by emoji with a "the viewer reacted" flag, in DESCENDING
 * count order (stable by emoji for ties). Pure and unit-testable. `viewerId`
 * null (e.g. dev user without a db row) yields `reacted: false` everywhere.
 */
export function aggregateReactions(
  rows: ReadonlyArray<RawReaction>,
  viewerId: string | null,
): FeedReactionSummary[] {
  const byEmoji = new Map<string, { count: number; reacted: boolean }>();
  for (const row of rows) {
    const entry = byEmoji.get(row.emoji) ?? { count: 0, reacted: false };
    entry.count += 1;
    if (viewerId !== null && row.userId === viewerId) entry.reacted = true;
    byEmoji.set(row.emoji, entry);
  }
  return [...byEmoji.entries()]
    .map(([emoji, { count, reacted }]) => ({ emoji, count, reacted }))
    .sort((a, b) => b.count - a.count || a.emoji.localeCompare(b.emoji));
}

/**
 * Reaction palette offered in the UI (the picker). The server only validates an
 * emoji's SHAPE (short, no whitespace), not membership in this set — this is a
 * UX curation, not a security boundary. A label is provided for accessibility
 * (aria-label of each picker choice).
 */
export const FEED_EMOJIS: ReadonlyArray<{ emoji: string; label: string }> = [
  { emoji: "👍", label: "Curtir" },
  { emoji: "❤️", label: "Amei" },
  { emoji: "🎉", label: "Comemorar" },
  { emoji: "👏", label: "Aplaudir" },
  { emoji: "🚀", label: "Foguete" },
  { emoji: "💡", label: "Ideia" },
  { emoji: "🙌", label: "Apoiar" },
  { emoji: "😂", label: "Engraçado" },
];

/** Human-readable label for an emoji from the palette (falls back to the emoji). */
export function reactionLabel(emoji: string): string {
  return FEED_EMOJIS.find((e) => e.emoji === emoji)?.label ?? emoji;
}

/**
 * Compact relative-time label in pt-BR ("agora", "há 5 min", "há 3 h",
 * "há 2 d", then an absolute date). Pure and testable. `now` is injectable so
 * tests are deterministic. Future timestamps (clock skew) clamp to "agora".
 */
export function formatRelativeTime(
  iso: string,
  now: Date = new Date(),
): string {
  const then = new Date(iso);
  const diffMs = now.getTime() - then.getTime();
  const diffSec = Math.floor(diffMs / 1000);
  if (diffSec < 45) return "agora";
  const diffMin = Math.floor(diffSec / 60);
  if (diffMin < 60) return `há ${diffMin} min`;
  const diffHour = Math.floor(diffMin / 60);
  if (diffHour < 24) return `há ${diffHour} h`;
  const diffDay = Math.floor(diffHour / 24);
  if (diffDay < 7) return `há ${diffDay} d`;
  return new Intl.DateTimeFormat("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  }).format(then);
}
