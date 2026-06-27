import type { RoleName } from "@/lib/auth/roles";

/**
 * Pure RBAC + visibility logic for the Feed social interno (Melhoria #5).
 *
 * No I/O. The DB read layer (`lib/db/feed.ts`) and the server actions build
 * their Prisma `where` and capability flags from this module so the rules are
 * enforced on the server — never only in the UI. The configurable permission
 * matrix (`FEED` code) is the primary gate for create/edit/delete; the role
 * sets below express the FIXED business decisions (moderation, pin) that the
 * matrix does not capture on its own.
 */

// ── Quem modera (remover qualquer conteúdo) ─────────────────────────────────

/**
 * Roles that may MODERATE the feed: remove any post/comment
 * (REMOVED_BY_MODERATION) and pin/unpin posts. Decisão do v1: ADMIN + PEOPLE.
 * O autor sempre edita/remove o próprio conteúdo (regra de autoria à parte,
 * não depende deste conjunto).
 */
export const FEED_MODERATION_ROLES: RoleName[] = ["ADMIN", "PEOPLE"];

/** Máximo de posts fixados (pin) simultâneos. Decisão do v1. */
export const FEED_MAX_PINNED = 3;

/** Quantos comentários mais recentes pré-carregar por post na listagem. */
export const FEED_PREVIEW_COMMENTS = 3;

/** Tamanho de página da listagem por cursor (keyset). */
export const FEED_PAGE_SIZE = 20;

/** Máximo de anexos por post (v1). */
export const FEED_MAX_ATTACHMENTS = 4;

/** Whether a user holds at least one moderation role. */
export function isFeedModerator(roles: readonly RoleName[]): boolean {
  return FEED_MODERATION_ROLES.some((role) => roles.includes(role));
}

/** Effective capabilities of the viewer over the feed (resolved server-side). */
export interface FeedCapabilities {
  /** May create posts/comments (matrix FEED.create). */
  canPost: boolean;
  /** May moderate (remove any content) — matrix FEED.delete AND moderator role. */
  canModerate: boolean;
  /** May pin/unpin posts (moderator). */
  canPin: boolean;
}

export interface ResolveCapabilitiesInput {
  roles: readonly RoleName[];
  /** FEED.create grant from the permission matrix. */
  canCreate: boolean;
  /** FEED.delete grant from the permission matrix. */
  canDelete: boolean;
}

/**
 * Resolve the viewer's feed capabilities. `canModerate`/`canPin` require BOTH
 * a moderation role AND the matrix delete grant (defense in depth: the matrix
 * is configurable and may revoke it, the role set is the fixed product floor).
 */
export function resolveFeedCapabilities(
  input: ResolveCapabilitiesInput,
): FeedCapabilities {
  const moderator = isFeedModerator(input.roles) && input.canDelete;
  return {
    canPost: input.canCreate,
    canModerate: moderator,
    canPin: moderator,
  };
}

// ── Recorte de visibilidade ─────────────────────────────────────────────────

/** Lifecycle status of feed content (mirrors the Prisma enum). */
export type FeedContentStatus =
  | "VISIBLE"
  | "DELETED_BY_AUTHOR"
  | "REMOVED_BY_MODERATION";

/** Visibility of a post (mirrors the Prisma enum). v1 only uses PUBLIC_INTERNAL. */
export type FeedVisibility = "PUBLIC_INTERNAL" | "AREA";

/**
 * Whether the viewer may SEE a piece of content at all (post or comment).
 *
 * - VISIBLE content is shown to everyone in scope.
 * - Non-VISIBLE content (deleted/removed) is NOT shown to non-authors as real
 *   content; the read layer renders a TOMBSTONE for it instead. The author of
 *   removed content also gets the tombstone (its own copy is gone), so this
 *   returns false for everyone on non-VISIBLE — the tombstone is a separate
 *   render decision, not a "can see the body" decision.
 *
 * The body is exposed ONLY when status is VISIBLE. This is the single
 * authority both the query (status filter) and the mapping use.
 */
export function canSeeContentBody(status: FeedContentStatus): boolean {
  return status === "VISIBLE";
}

/**
 * v1 visibility predicate for the QUERY. Only PUBLIC_INTERNAL is active, so
 * every active user sees every PUBLIC_INTERNAL post. The AREA branch is the
 * disabled hook for future area segmentation (kept here so the read layer has a
 * single place to flip it on). Returns the visibility values the viewer may see.
 */
export function viewableVisibilities(): FeedVisibility[] {
  // v1: AREA is modeled but OFF. Do not include it — area-scoped posts would
  // never be created while the UI only offers PUBLIC_INTERNAL.
  return ["PUBLIC_INTERNAL"];
}
