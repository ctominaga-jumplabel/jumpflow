import { prisma } from "@jumpflow/database";
import type { ActionResult } from "@/lib/actions/result";
import { hasRole } from "@/lib/auth/route-permissions";
import type { AppUser } from "@/lib/auth/types";
import { resolveDbUser } from "@/lib/db/users";
import {
  decodeFeedCursor,
  encodeFeedCursor,
  feedSeekWhere,
  FEED_ORDER_BY,
} from "@/lib/feed/cursor";
import {
  aggregateReactions,
  tombstoneLabel,
  type FeedCommentView,
  type FeedMentionMeta,
  type FeedPage,
  type FeedPostView,
} from "@/lib/feed/types";
import {
  canSeeContentBody,
  FEED_MODERATION_ROLES,
  FEED_PAGE_SIZE,
  FEED_PREVIEW_COMMENTS,
  resolveFeedCapabilities,
  viewableVisibilities,
  type FeedCapabilities,
  type FeedContentStatus,
  type FeedVisibility,
} from "@/lib/feed/visibility";
import {
  getFeedAttachmentStorageProvider,
  isStorageConfigured,
} from "@/lib/storage/provider";

/**
 * Read/query layer for the Feed social interno (Melhoria #5). Assumes a
 * database is configured — callers guard with `isDatabaseConfigured()` first.
 *
 * Visibility/authorship cropping is done IN THE QUERY (status filter +
 * visibility filter) and reinforced in the mapping (tombstone for non-VISIBLE
 * content reaching a non-author). The viewer's capabilities (canPost/
 * canModerate/canPin) come from the permission matrix + moderation role set.
 */

const SIGNED_URL_TTL_SECONDS = 300;

/** Narrow reaction row used for aggregation. */
interface ReactionRow {
  emoji: string;
  userId: string;
}

/** Narrow mention row → mapped to FeedMentionMeta. */
interface MentionRow {
  mentionedUserId: string;
  mentionedUser: { name: string } | null;
}

interface CommentRow {
  id: string;
  authorUserId: string | null;
  author: { name: string } | null;
  body: string;
  status: FeedContentStatus;
  editedAt: Date | null;
  createdAt: Date;
  reactions: ReactionRow[];
  mentions: MentionRow[];
}

interface PostRow {
  id: string;
  authorUserId: string | null;
  author: { name: string } | null;
  body: string;
  status: FeedContentStatus;
  visibility: FeedVisibility;
  pinned: boolean;
  editedAt: Date | null;
  createdAt: Date;
  reactions: ReactionRow[];
  mentions: MentionRow[];
  attachments: {
    id: string;
    fileName: string;
    contentType: string;
    size: number;
  }[];
  comments: CommentRow[];
  _count: { comments: number };
}

const mentionSelect = {
  mentionedUserId: true,
  mentionedUser: { select: { name: true } },
} as const;

const commentSelect = {
  id: true,
  authorUserId: true,
  author: { select: { name: true } },
  body: true,
  status: true,
  editedAt: true,
  createdAt: true,
  reactions: { select: { emoji: true, userId: true } },
  mentions: { select: mentionSelect },
} as const;

const postSelect = {
  id: true,
  authorUserId: true,
  author: { select: { name: true } },
  body: true,
  status: true,
  visibility: true,
  pinned: true,
  editedAt: true,
  createdAt: true,
  reactions: { select: { emoji: true, userId: true } },
  mentions: { select: mentionSelect },
  attachments: {
    select: { id: true, fileName: true, contentType: true, size: true },
    orderBy: { createdAt: "asc" as const },
  },
  comments: {
    where: { status: "VISIBLE" as const },
    orderBy: { createdAt: "desc" as const },
    take: FEED_PREVIEW_COMMENTS,
    select: commentSelect,
  },
  _count: { select: { comments: { where: { status: "VISIBLE" as const } } } },
} as const;

/** Author display name, with a stable fallback when the author row is gone. */
function authorOf(row: { authorUserId: string | null; author: { name: string } | null }) {
  return {
    id: row.authorUserId,
    name: row.author?.name ?? "Usuário removido",
  };
}

/** Map raw mention rows to the UI shape (skips rows whose user row is gone). */
function mapMentions(rows: MentionRow[] | undefined): FeedMentionMeta[] {
  return (rows ?? [])
    .filter((m) => m.mentionedUser?.name)
    .map((m) => ({ userId: m.mentionedUserId, name: m.mentionedUser!.name }));
}

function mapComment(
  row: CommentRow,
  viewerDbUserId: string | null,
): FeedCommentView {
  const visible = canSeeContentBody(row.status);
  return {
    id: row.id,
    author: authorOf(row),
    body: visible ? row.body : null,
    status: row.status,
    tombstone: visible ? undefined : tombstoneLabel(row.status),
    editedAt: row.editedAt?.toISOString() ?? null,
    createdAt: row.createdAt.toISOString(),
    reactions: aggregateReactions(row.reactions, viewerDbUserId),
    // A tombstoned comment hides its mentions too.
    mentions: visible ? mapMentions(row.mentions) : [],
    isOwn: viewerDbUserId !== null && row.authorUserId === viewerDbUserId,
  };
}

function mapPost(row: PostRow, viewerDbUserId: string | null): FeedPostView {
  const visible = canSeeContentBody(row.status);
  // Newest-first preview was fetched DESC; present oldest-first so the thread
  // reads naturally under the post.
  const comments = [...row.comments]
    .reverse()
    .map((c) => mapComment(c, viewerDbUserId));
  return {
    id: row.id,
    author: authorOf(row),
    body: visible ? row.body : null,
    status: row.status,
    visibility: row.visibility,
    pinned: row.pinned,
    tombstone: visible ? undefined : tombstoneLabel(row.status),
    editedAt: row.editedAt?.toISOString() ?? null,
    createdAt: row.createdAt.toISOString(),
    reactions: aggregateReactions(row.reactions, viewerDbUserId),
    // A tombstoned post hides its attachments + mentions too.
    attachments: visible ? row.attachments : [],
    mentions: visible ? mapMentions(row.mentions) : [],
    comments,
    commentCount: row._count.comments,
    isOwn: viewerDbUserId !== null && row.authorUserId === viewerDbUserId,
  };
}

/**
 * Resolve the viewer's feed capabilities from the permission matrix + the fixed
 * moderation role set. `canCreate`/`canDelete` come from the matrix-driven
 * `can()` calls in the caller (the action/page), passed in here so this module
 * stays free of the request-scoped matrix import cycle.
 */
export function resolveCapabilities(
  user: AppUser,
  matrix: { canCreate: boolean; canDelete: boolean },
): FeedCapabilities {
  return resolveFeedCapabilities({
    roles: user.roles,
    canCreate: matrix.canCreate,
    canDelete: matrix.canDelete,
  });
}

/** Whether the user holds a moderation role (ADMIN/PEOPLE). */
export function isModeratorUser(user: AppUser): boolean {
  return hasRole(user, FEED_MODERATION_ROLES);
}

export interface ListFeedOptions {
  cursor?: string | null;
  pageSize?: number;
}

/**
 * Paginated feed page by keyset cursor `(pinned DESC, createdAt DESC, id DESC)`.
 *
 * - Visibility cropping in the query: only `viewableVisibilities()` (v1:
 *   PUBLIC_INTERNAL). The AREA hook stays off.
 * - Status: VISIBLE posts are shown with their body; non-VISIBLE posts are
 *   shown as a TOMBSTONE to NON-authors (the author still gets the tombstone —
 *   nobody re-reads removed bodies), so the timeline keeps its shape. We fetch
 *   posts regardless of status (so the thread does not collapse) but the body
 *   is stripped in the mapping for non-VISIBLE.
 *
 * `pageSize + 1` is fetched to know whether a next page exists without a count.
 */
export async function listFeed(
  user: AppUser,
  options: ListFeedOptions = {},
): Promise<FeedPage> {
  const pageSize = options.pageSize ?? FEED_PAGE_SIZE;
  const cursor = decodeFeedCursor(options.cursor);
  const dbUser = await resolveDbUser(user);
  const viewerDbUserId = dbUser?.id ?? null;

  const where: Record<string, unknown> = {
    visibility: { in: viewableVisibilities() },
    ...(cursor ? feedSeekWhere(cursor) : {}),
  };

  const rows = (await prisma.feedPost.findMany({
    where,
    select: postSelect,
    orderBy: FEED_ORDER_BY,
    take: pageSize + 1,
  })) as unknown as PostRow[];

  const hasMore = rows.length > pageSize;
  const pageRows = hasMore ? rows.slice(0, pageSize) : rows;
  const posts = pageRows.map((row) => mapPost(row, viewerDbUserId));

  let nextCursor: string | null = null;
  if (hasMore && pageRows.length > 0) {
    const last = pageRows[pageRows.length - 1];
    nextCursor = encodeFeedCursor({
      pinned: last.pinned,
      createdAt: last.createdAt,
      id: last.id,
    });
  }

  return { posts, nextCursor };
}

/**
 * Short-lived signed URL for a feed post attachment. RBAC: any authenticated
 * user may open it (the feed is internal/public). Returns FORBIDDEN for a
 * missing attachment (anti-enumeration) and NO_STORAGE when storage is off.
 */
export async function getFeedAttachmentSignedUrl(
  attachmentId: string,
): Promise<ActionResult<{ url: string }>> {
  const attachment = await prisma.feedPostAttachment.findUnique({
    where: { id: attachmentId },
    select: {
      storageKey: true,
      post: { select: { status: true, visibility: true } },
    },
  });
  // Anti-enumeration: a missing attachment and one on a non-viewable post
  // return the SAME FORBIDDEN.
  const forbidden: ActionResult<{ url: string }> = {
    ok: false,
    error: "FORBIDDEN",
    message: "Você não tem acesso a este anexo.",
  };
  if (!attachment) return forbidden;
  // Tombstoned posts hide their attachments.
  if (attachment.post.status !== "VISIBLE") return forbidden;
  if (!viewableVisibilities().includes(attachment.post.visibility as FeedVisibility)) {
    return forbidden;
  }

  if (!isStorageConfigured()) {
    return {
      ok: false,
      error: "NO_STORAGE",
      message: "Anexos indisponíveis: storage não configurado.",
    };
  }
  const provider = getFeedAttachmentStorageProvider();
  if (!provider) {
    return {
      ok: false,
      error: "NO_STORAGE",
      message: "Anexos indisponíveis: storage não configurado.",
    };
  }
  try {
    const url = await provider.getSignedUrl(
      attachment.storageKey,
      SIGNED_URL_TTL_SECONDS,
    );
    return { ok: true, data: { url } };
  } catch (error) {
    console.error("[feed] failed to sign attachment url", error);
    return {
      ok: false,
      error: "UNEXPECTED",
      message: "Não foi possível gerar o link do anexo. Tente novamente.",
    };
  }
}
