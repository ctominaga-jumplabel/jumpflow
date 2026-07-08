"use server";

import { revalidatePath } from "next/cache";
import { Prisma, prisma } from "@jumpflow/database";
import type { ZodType } from "zod";
import type { ActionResult, ErrorCode } from "@/lib/actions/result";
import { can } from "@/lib/auth/permissions";
import { requirePermission, requireUser } from "@/lib/auth/guards";
import type { AppUser } from "@/lib/auth/types";
import {
  notifyFeedMentioned,
  notifyFeedReacted,
  notifyFeedReplied,
} from "@/lib/automation/notifications/feed-events";
import { recordAuditEvent } from "@/lib/db/audit";
import { isDatabaseConfigured } from "@/lib/db/config";
import {
  getFeedAttachmentSignedUrl,
  isModeratorUser,
  listFeed,
} from "@/lib/db/feed";
import type { FeedPage } from "@/lib/feed/types";
import { resolveDbUser, searchActiveUsersByName } from "@/lib/db/users";
import {
  addCommentSchema,
  attachmentIdSchema,
  commentIdSchema,
  createPostSchema,
  editCommentSchema,
  editPostSchema,
  moderateRemoveSchema,
  postIdSchema,
  togglePinSchema,
  toggleReactionSchema,
  type AddCommentInput,
  type CommentIdInput,
  type CreatePostInput,
  type EditCommentInput,
  type EditPostInput,
  type ModerateRemoveInput,
  type PostIdInput,
  type TogglePinInput,
  type ToggleReactionInput,
} from "@/lib/feed/schemas";
import { FEED_MAX_ATTACHMENTS, FEED_MAX_PINNED } from "@/lib/feed/visibility";
import {
  buildFeedAttachmentKey,
  validateFeedAttachmentFile,
} from "@/lib/storage/file-validation";
import {
  FEED_ATTACHMENTS_BUCKET,
  getFeedAttachmentStorageProvider,
  isStorageConfigured,
} from "@/lib/storage/provider";

/**
 * Server actions for the Feed social interno (Melhoria #5).
 *
 * Every action returns an ActionResult (never throws to the client) and is
 * fail-closed: authorization (permission matrix + authorship/moderation role)
 * is checked on the SERVER before any write. The permission code is `FEED`:
 * - create (post/comment/react)  -> FEED.create
 * - edit (own post/comment)      -> FEED.edit + authorship
 * - delete own (post/comment)    -> FEED.edit + authorship (soft delete)
 * - moderate / pin               -> FEED.delete + moderation role (ADMIN/PEOPLE)
 */

const FEED_PATH = "/app/feed";
const FEED_PERMISSION = "FEED";

/** Internal typed failure; converted to ActionResult at the boundary. */
class ActionError extends Error {
  constructor(
    readonly code: ErrorCode,
    message: string,
  ) {
    super(message);
  }
}

function ensureDatabase(): void {
  if (!isDatabaseConfigured()) {
    throw new ActionError("NO_DATABASE", "Banco de dados não configurado.");
  }
}

function parseInput<T>(schema: ZodType<T>, input: unknown): T {
  const result = schema.safeParse(input);
  if (!result.success) {
    throw new ActionError(
      "INVALID_INPUT",
      result.error.issues[0]?.message ?? "Dados inválidos.",
    );
  }
  return result.data;
}

/** Convert any thrown error into a safe ActionResult failure. */
function toFailure(error: unknown): ActionResult<never> {
  if (
    typeof error === "object" &&
    error !== null &&
    "digest" in error &&
    typeof (error as { digest?: unknown }).digest === "string" &&
    (error as { digest: string }).digest.startsWith("NEXT_")
  ) {
    throw error;
  }
  if (error instanceof ActionError) {
    return { ok: false, error: error.code, message: error.message };
  }
  console.error("[feed] unexpected action error", error);
  return {
    ok: false,
    error: "UNEXPECTED",
    message: "Erro inesperado. Tente novamente.",
  };
}

/** Require the matrix `action` on FEED, fail-closed (FORBIDDEN). */
async function requireFeed(action: "create" | "edit" | "delete"): Promise<void> {
  if (!(await can(FEED_PERMISSION, action))) {
    throw new ActionError(
      "FORBIDDEN",
      "Você não tem permissão para esta ação no Feed.",
    );
  }
}

/** Resolve the real db user (FK columns need it; dev session id is synthetic). */
async function requireDbUser(user: AppUser) {
  const dbUser = await resolveDbUser(user);
  if (!dbUser) {
    throw new ActionError(
      "FORBIDDEN",
      "Usuário não encontrado no banco de dados.",
    );
  }
  return dbUser;
}

/**
 * Require that the viewer may MODERATE: FEED.delete grant AND a moderation role
 * (ADMIN/PEOPLE). Both are required (defense in depth).
 */
async function requireModerator(user: AppUser): Promise<void> {
  const allowed = (await can(FEED_PERMISSION, "delete")) && isModeratorUser(user);
  if (!allowed) {
    throw new ActionError(
      "FORBIDDEN",
      "Apenas a moderação (ADMIN/RH) pode realizar esta ação.",
    );
  }
}

/**
 * Resolve a lista de ids mencionados (vinda do cliente — NÃO é fronteira de
 * confiança) para os ids de usuários ATIVOS reais, deduplicados e EXCLUINDO o
 * próprio autor (não faz sentido mencionar/notificar a si mesmo). Ids inválidos
 * ou de usuários inativos são silenciosamente descartados (evita erro de FK e
 * menções fantasmas).
 */
async function resolveMentionUserIds(
  rawIds: string[] | undefined,
  selfId: string,
): Promise<string[]> {
  const unique = [...new Set((rawIds ?? []).map((id) => id.trim()))].filter(
    (id) => id.length > 0 && id !== selfId,
  );
  if (unique.length === 0) return [];
  const users = await prisma.user.findMany({
    where: { id: { in: unique }, status: "ACTIVE" },
    select: { id: true },
  });
  return users.map((u) => u.id);
}

// ── Mention autocomplete ─────────────────────────────────────────────────────

/**
 * Busca usuários para o autocomplete de menção (@) no Feed. RBAC: FEED.view (a
 * mesma porta da tela). Retorna no máximo 8 usuários ativos por nome/e-mail.
 * Query vazia → lista vazia (o cliente não abre o dropdown).
 */
export async function searchFeedMentionUsers(
  query: string,
): Promise<ActionResult<{ users: { id: string; name: string }[] }>> {
  try {
    ensureDatabase();
    await requirePermission(FEED_PERMISSION, "view");
    const q = typeof query === "string" ? query.trim() : "";
    if (q.length === 0) return { ok: true, data: { users: [] } };
    const users = await searchActiveUsersByName(q, 8);
    return { ok: true, data: { users } };
  } catch (error) {
    return toFailure(error);
  }
}

// ── Read (pagination) ───────────────────────────────────────────────────────

/**
 * Load the next feed page by cursor (the client's "carregar mais"). RBAC:
 * FEED.view (the same gate the page uses). Returns an empty page when no
 * database is configured so the client degrades gracefully instead of throwing.
 */
export async function loadFeedPage(
  cursor: string | null,
): Promise<ActionResult<FeedPage>> {
  try {
    if (!isDatabaseConfigured()) {
      return { ok: true, data: { posts: [], nextCursor: null } };
    }
    const user = await requirePermission(FEED_PERMISSION, "view");
    const page = await listFeed(user, { cursor });
    return { ok: true, data: page };
  } catch (error) {
    return toFailure(error);
  }
}

// ── Posts ───────────────────────────────────────────────────────────────────

export async function createPost(
  input: CreatePostInput,
): Promise<ActionResult<{ id: string }>> {
  try {
    ensureDatabase();
    const user = await requireUser();
    await requireFeed("create");
    const parsed = parseInput(createPostSchema, input);
    const dbUser = await requireDbUser(user);
    const mentionIds = await resolveMentionUserIds(
      parsed.mentionedUserIds,
      dbUser.id,
    );

    // Post + menções na MESMA transação (atômico: nunca fica um post sem as
    // menções que o usuário selecionou).
    const post = await prisma.$transaction(async (tx) => {
      const created = await tx.feedPost.create({
        data: {
          authorUserId: dbUser.id,
          body: parsed.body,
          visibility: "PUBLIC_INTERNAL",
        },
      });
      if (mentionIds.length > 0) {
        await tx.feedMention.createMany({
          data: mentionIds.map((uid) => ({
            postId: created.id,
            mentionedUserId: uid,
          })),
          skipDuplicates: true,
        });
      }
      return created;
    });

    // Post-commit, best-effort: notifica cada mencionado (pula o autor; fail-open
    // sem regra). Nunca quebra a action.
    await notifyFeedMentioned({
      postId: post.id,
      actorUserId: dbUser.id,
      mentionedUserIds: mentionIds,
    });

    revalidatePath(FEED_PATH);
    return { ok: true, data: { id: post.id } };
  } catch (error) {
    return toFailure(error);
  }
}

export async function editPost(
  input: EditPostInput,
): Promise<ActionResult<{ id: string }>> {
  try {
    ensureDatabase();
    const user = await requireUser();
    await requireFeed("edit");
    const parsed = parseInput(editPostSchema, input);
    const dbUser = await requireDbUser(user);
    const mentionIds = await resolveMentionUserIds(
      parsed.mentionedUserIds,
      dbUser.id,
    );

    // Menções já existentes ANTES da edição (para notificar só as novas).
    const before = await prisma.feedMention.findMany({
      where: { postId: parsed.postId },
      select: { mentionedUserId: true },
    });
    const existingIds = new Set(before.map((m) => m.mentionedUserId));

    // Edição + sincronização das menções na mesma transação. Authorship + status
    // guard no updateMany (race-safe); as menções só mudam se a edição aplicou.
    await prisma.$transaction(async (tx) => {
      const updated = await tx.feedPost.updateMany({
        where: { id: parsed.postId, authorUserId: dbUser.id, status: "VISIBLE" },
        data: { body: parsed.body, editedAt: new Date() },
      });
      if (updated.count !== 1) {
        throw new ActionError(
          "FORBIDDEN",
          "Você só pode editar os seus próprios posts ativos.",
        );
      }
      await tx.feedMention.deleteMany({ where: { postId: parsed.postId } });
      if (mentionIds.length > 0) {
        await tx.feedMention.createMany({
          data: mentionIds.map((uid) => ({
            postId: parsed.postId,
            mentionedUserId: uid,
          })),
          skipDuplicates: true,
        });
      }
    });

    // Notifica só quem passou a ser mencionado nesta edição (não re-notifica).
    const addedIds = mentionIds.filter((id) => !existingIds.has(id));
    await notifyFeedMentioned({
      postId: parsed.postId,
      actorUserId: dbUser.id,
      mentionedUserIds: addedIds,
    });

    revalidatePath(FEED_PATH);
    return { ok: true, data: { id: parsed.postId } };
  } catch (error) {
    return toFailure(error);
  }
}

export async function deletePost(
  input: PostIdInput,
): Promise<ActionResult<{ id: string }>> {
  try {
    ensureDatabase();
    const user = await requireUser();
    await requireFeed("edit");
    const parsed = parseInput(postIdSchema, input);
    const dbUser = await requireDbUser(user);

    // Soft delete by the author: VISIBLE -> DELETED_BY_AUTHOR (race-safe).
    const updated = await prisma.feedPost.updateMany({
      where: { id: parsed.postId, authorUserId: dbUser.id, status: "VISIBLE" },
      data: { status: "DELETED_BY_AUTHOR" },
    });
    if (updated.count !== 1) {
      throw new ActionError(
        "FORBIDDEN",
        "Você só pode remover os seus próprios posts ativos.",
      );
    }

    revalidatePath(FEED_PATH);
    return { ok: true, data: { id: parsed.postId } };
  } catch (error) {
    return toFailure(error);
  }
}

// ── Comments ──────────────────────────────────────────────────────────────

export async function addComment(
  input: AddCommentInput,
): Promise<ActionResult<{ id: string }>> {
  try {
    ensureDatabase();
    const user = await requireUser();
    await requireFeed("create");
    const parsed = parseInput(addCommentSchema, input);
    const dbUser = await requireDbUser(user);
    const mentionIds = await resolveMentionUserIds(
      parsed.mentionedUserIds,
      dbUser.id,
    );

    // Only comment on a VISIBLE post.
    const post = await prisma.feedPost.findUnique({
      where: { id: parsed.postId },
      select: { id: true, status: true },
    });
    if (!post || post.status !== "VISIBLE") {
      throw new ActionError("NOT_FOUND", "Post não encontrado ou removido.");
    }

    // Comentário + menções na mesma transação (atômico).
    const comment = await prisma.$transaction(async (tx) => {
      const created = await tx.feedComment.create({
        data: {
          postId: post.id,
          authorUserId: dbUser.id,
          body: parsed.body,
        },
      });
      if (mentionIds.length > 0) {
        await tx.feedMention.createMany({
          data: mentionIds.map((uid) => ({
            commentId: created.id,
            mentionedUserId: uid,
          })),
          skipDuplicates: true,
        });
      }
      return created;
    });

    // Post-commit, best-effort: notifica o AUTOR do post que recebeu a resposta
    // e cada mencionado no comentário (ambos pulam auto-notificação; fail-open
    // sem regra). Nunca quebram a action.
    await notifyFeedReplied(comment.id);
    await notifyFeedMentioned({
      commentId: comment.id,
      actorUserId: dbUser.id,
      mentionedUserIds: mentionIds,
    });

    revalidatePath(FEED_PATH);
    return { ok: true, data: { id: comment.id } };
  } catch (error) {
    return toFailure(error);
  }
}

export async function editComment(
  input: EditCommentInput,
): Promise<ActionResult<{ id: string }>> {
  try {
    ensureDatabase();
    const user = await requireUser();
    await requireFeed("edit");
    const parsed = parseInput(editCommentSchema, input);
    const dbUser = await requireDbUser(user);
    const mentionIds = await resolveMentionUserIds(
      parsed.mentionedUserIds,
      dbUser.id,
    );

    const before = await prisma.feedMention.findMany({
      where: { commentId: parsed.commentId },
      select: { mentionedUserId: true },
    });
    const existingIds = new Set(before.map((m) => m.mentionedUserId));

    await prisma.$transaction(async (tx) => {
      const updated = await tx.feedComment.updateMany({
        where: {
          id: parsed.commentId,
          authorUserId: dbUser.id,
          status: "VISIBLE",
        },
        data: { body: parsed.body, editedAt: new Date() },
      });
      if (updated.count !== 1) {
        throw new ActionError(
          "FORBIDDEN",
          "Você só pode editar os seus próprios comentários ativos.",
        );
      }
      await tx.feedMention.deleteMany({ where: { commentId: parsed.commentId } });
      if (mentionIds.length > 0) {
        await tx.feedMention.createMany({
          data: mentionIds.map((uid) => ({
            commentId: parsed.commentId,
            mentionedUserId: uid,
          })),
          skipDuplicates: true,
        });
      }
    });

    const addedIds = mentionIds.filter((id) => !existingIds.has(id));
    await notifyFeedMentioned({
      commentId: parsed.commentId,
      actorUserId: dbUser.id,
      mentionedUserIds: addedIds,
    });

    revalidatePath(FEED_PATH);
    return { ok: true, data: { id: parsed.commentId } };
  } catch (error) {
    return toFailure(error);
  }
}

export async function deleteComment(
  input: CommentIdInput,
): Promise<ActionResult<{ id: string }>> {
  try {
    ensureDatabase();
    const user = await requireUser();
    await requireFeed("edit");
    const parsed = parseInput(commentIdSchema, input);
    const dbUser = await requireDbUser(user);

    const updated = await prisma.feedComment.updateMany({
      where: { id: parsed.commentId, authorUserId: dbUser.id, status: "VISIBLE" },
      data: { status: "DELETED_BY_AUTHOR" },
    });
    if (updated.count !== 1) {
      throw new ActionError(
        "FORBIDDEN",
        "Você só pode remover os seus próprios comentários ativos.",
      );
    }

    revalidatePath(FEED_PATH);
    return { ok: true, data: { id: parsed.commentId } };
  } catch (error) {
    return toFailure(error);
  }
}

// ── Reactions ─────────────────────────────────────────────────────────────

/**
 * Idempotent toggle of a reaction (emoji) on a post OR comment. Inserts when
 * absent, removes when present. The partial unique index
 * `(userId, emoji, postId|commentId)` makes a double-click a no-op:
 *
 * - read the existing reaction; if found -> delete (un-react).
 * - else create; a concurrent create racing past the read hits P2002 — we
 *   swallow it as "already reacted" so the result stays idempotent (the row
 *   the other request created stands).
 */
export async function toggleReaction(
  input: ToggleReactionInput,
): Promise<ActionResult<{ reacted: boolean }>> {
  try {
    ensureDatabase();
    const user = await requireUser();
    await requireFeed("create");
    const parsed = parseInput(toggleReactionSchema, input);
    const dbUser = await requireDbUser(user);

    const target = parsed.postId
      ? { postId: parsed.postId }
      : { commentId: parsed.commentId! };

    // Guard: the target must exist and be VISIBLE (no reacting to tombstones).
    if (parsed.postId) {
      const post = await prisma.feedPost.findUnique({
        where: { id: parsed.postId },
        select: { status: true },
      });
      if (!post || post.status !== "VISIBLE") {
        throw new ActionError("NOT_FOUND", "Post não encontrado ou removido.");
      }
    } else {
      const comment = await prisma.feedComment.findUnique({
        where: { id: parsed.commentId! },
        select: { status: true },
      });
      if (!comment || comment.status !== "VISIBLE") {
        throw new ActionError(
          "NOT_FOUND",
          "Comentário não encontrado ou removido.",
        );
      }
    }

    const existing = await prisma.feedReaction.findFirst({
      where: { userId: dbUser.id, emoji: parsed.emoji, ...target },
      select: { id: true },
    });

    if (existing) {
      // Second click removes (idempotent, race-safe: deleteMany of 0 is fine).
      await prisma.feedReaction.deleteMany({ where: { id: existing.id } });
      revalidatePath(FEED_PATH);
      return { ok: true, data: { reacted: false } };
    }

    try {
      await prisma.feedReaction.create({
        data: { userId: dbUser.id, emoji: parsed.emoji, ...target },
      });
    } catch (error) {
      // Concurrent insert won the race against the partial unique index.
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === "P2002"
      ) {
        revalidatePath(FEED_PATH);
        return { ok: true, data: { reacted: true } };
      }
      throw error;
    }

    // Post-commit, best-effort: notifica o AUTOR do alvo. Uma notificação por
    // reação NOVA, idempotente por reactionId (re-rodar não duplica; reações já
    // notificadas são puladas). NÃO há janela de digest: reações de usuários
    // distintos chegam em chamadas separadas e geram um e-mail cada — o digest
    // por janela é evolução (ver docs/infra-notificacoes.md §10). A consolidação
    // num único e-mail só acontece quando há várias reações pendentes na MESMA
    // chamada (ex. um envio anterior falhou). Pula auto-notificação; fail-open
    // sem regra. Nunca quebra a action. Só na adição (no duplo clique/remoção
    // não notificamos).
    await notifyFeedReacted(
      parsed.postId ? { postId: parsed.postId } : { commentId: parsed.commentId! },
    );

    revalidatePath(FEED_PATH);
    return { ok: true, data: { reacted: true } };
  } catch (error) {
    return toFailure(error);
  }
}

// ── Moderation ──────────────────────────────────────────────────────────────

/**
 * Remove a post OR comment as a moderator: VISIBLE -> REMOVED_BY_MODERATION,
 * stamping removedBy/at/reason + an AuditEvent. Idempotent/race-safe via the
 * status-guarded updateMany. Already-removed/deleted content yields ALREADY_DECIDED.
 */
export async function moderateRemove(
  input: ModerateRemoveInput,
): Promise<ActionResult<{ id: string }>> {
  try {
    ensureDatabase();
    const user = await requireUser();
    await requireModerator(user);
    const parsed = parseInput(moderateRemoveSchema, input);
    const dbUser = await requireDbUser(user);
    const reason = parsed.reason?.trim() || null;
    const now = new Date();

    const id = (parsed.postId ?? parsed.commentId)!;
    const data = {
      status: "REMOVED_BY_MODERATION" as const,
      removedByUserId: dbUser.id,
      removedAt: now,
      removalReason: reason,
    };

    await prisma.$transaction(async (tx) => {
      const updated = parsed.postId
        ? await tx.feedPost.updateMany({
            where: { id: parsed.postId, status: "VISIBLE" },
            data,
          })
        : await tx.feedComment.updateMany({
            where: { id: parsed.commentId!, status: "VISIBLE" },
            data,
          });
      if (updated.count !== 1) {
        throw new ActionError(
          "ALREADY_DECIDED",
          "Este conteúdo não está ativo ou já foi removido.",
        );
      }
      await tx.auditEvent.create({
        data: {
          actorUserId: dbUser.id,
          entityType: parsed.postId ? "FeedPost" : "FeedComment",
          entityId: id,
          action: "FEED_CONTENT_MODERATED",
          // A transição é sempre VISIBLE → REMOVED_BY_MODERATION (status-guarded
          // updateMany acima). Espelha togglePin gravando o estado anterior.
          before: { status: "VISIBLE" },
          after: { status: "REMOVED_BY_MODERATION", reason },
        },
      });
    });

    revalidatePath(FEED_PATH);
    return { ok: true, data: { id } };
  } catch (error) {
    return toFailure(error);
  }
}

/**
 * Pin/unpin a post (moderator). Pinning validates the global max of 3 pinned
 * posts inside a transaction (race-safe). Unpinning is unconstrained.
 */
export async function togglePin(
  input: TogglePinInput,
): Promise<ActionResult<{ id: string; pinned: boolean }>> {
  try {
    ensureDatabase();
    const user = await requireUser();
    await requireModerator(user);
    const parsed = parseInput(togglePinSchema, input);
    const dbUser = await requireDbUser(user);

    await prisma.$transaction(async (tx) => {
      const post = await tx.feedPost.findUnique({
        where: { id: parsed.postId },
        select: { id: true, status: true, pinned: true },
      });
      if (!post || post.status !== "VISIBLE") {
        throw new ActionError("NOT_FOUND", "Post não encontrado ou removido.");
      }
      // No-op if already in the desired state (idempotent).
      if (post.pinned === parsed.pinned) return;

      if (parsed.pinned) {
        const pinnedCount = await tx.feedPost.count({
          where: { pinned: true, status: "VISIBLE" },
        });
        if (pinnedCount >= FEED_MAX_PINNED) {
          throw new ActionError(
            "NOT_EDITABLE",
            `Limite de ${FEED_MAX_PINNED} posts fixados atingido. Desafixe um antes.`,
          );
        }
      }

      await tx.feedPost.update({
        where: { id: parsed.postId },
        data: { pinned: parsed.pinned },
      });
      await tx.auditEvent.create({
        data: {
          actorUserId: dbUser.id,
          entityType: "FeedPost",
          entityId: parsed.postId,
          action: parsed.pinned ? "FEED_POST_PINNED" : "FEED_POST_UNPINNED",
          before: { pinned: post.pinned },
          after: { pinned: parsed.pinned },
        },
      });
    });

    revalidatePath(FEED_PATH);
    return { ok: true, data: { id: parsed.postId, pinned: parsed.pinned } };
  } catch (error) {
    return toFailure(error);
  }
}

// ── Attachments ───────────────────────────────────────────────────────────

/**
 * Attach a file to a post (v1: attachments only on POSTS). Mirrors the Despesas
 * receipt flow: validate file -> upload to the private bucket -> persist the
 * metadata row, cleaning up the object if the DB write fails. Only the post
 * author may attach, and only while the post is VISIBLE. Caps at
 * FEED_MAX_ATTACHMENTS per post.
 */
export async function attachToPost(
  formData: FormData,
): Promise<ActionResult<{ id: string }>> {
  try {
    ensureDatabase();
    const user = await requireUser();
    await requireFeed("create");
    if (!isStorageConfigured()) {
      throw new ActionError(
        "NO_STORAGE",
        "Anexos indisponíveis: storage não configurado.",
      );
    }
    const parsed = parseInput(postIdSchema, { postId: formData.get("postId") });
    const dbUser = await requireDbUser(user);

    const file = formData.get("file");
    if (!(file instanceof File)) {
      throw new ActionError("INVALID_FILE", "Nenhum arquivo enviado.");
    }
    const invalid = validateFeedAttachmentFile({
      name: file.name,
      type: file.type,
      size: file.size,
    });
    if (invalid) {
      throw new ActionError(invalid.code, invalid.message);
    }

    const post = await prisma.feedPost.findUnique({
      where: { id: parsed.postId },
      select: {
        id: true,
        authorUserId: true,
        status: true,
        _count: { select: { attachments: true } },
      },
    });
    if (!post || post.status !== "VISIBLE") {
      throw new ActionError("NOT_FOUND", "Post não encontrado ou removido.");
    }
    if (post.authorUserId !== dbUser.id) {
      throw new ActionError(
        "FORBIDDEN",
        "Você só pode anexar arquivos aos seus próprios posts.",
      );
    }
    if (post._count.attachments >= FEED_MAX_ATTACHMENTS) {
      throw new ActionError(
        "NOT_EDITABLE",
        `Limite de ${FEED_MAX_ATTACHMENTS} anexos por post atingido.`,
      );
    }

    const provider = getFeedAttachmentStorageProvider()!;
    const storageKey = buildFeedAttachmentKey(post.id, file.name);
    await provider.upload(storageKey, await file.arrayBuffer(), file.type);

    let attachmentId: string;
    try {
      const attachment = await prisma.feedPostAttachment.create({
        data: {
          postId: post.id,
          fileName: file.name,
          contentType: file.type,
          size: file.size,
          storageBucket: FEED_ATTACHMENTS_BUCKET,
          storageKey,
          uploadedByUserId: dbUser.id,
        },
      });
      attachmentId = attachment.id;
    } catch (error) {
      // Clean up the orphan object best-effort: a bucket orphan is acceptable,
      // a DB orphan is not.
      try {
        await provider.delete(storageKey);
      } catch (cleanupError) {
        console.error("[feed] failed to clean up unreferenced attachment", cleanupError);
      }
      throw error;
    }

    revalidatePath(FEED_PATH);
    return { ok: true, data: { id: attachmentId } };
  } catch (error) {
    return toFailure(error);
  }
}

/**
 * Remove an attachment. The post author may remove their own attachments; a
 * moderator may remove any. Deletes the DB row then the storage object
 * (best-effort).
 */
export async function removeAttachment(input: {
  attachmentId: string;
}): Promise<ActionResult<{ id: string }>> {
  try {
    ensureDatabase();
    const user = await requireUser();
    await requireFeed("edit");
    const parsed = parseInput(attachmentIdSchema, input);
    const dbUser = await requireDbUser(user);

    const attachment = await prisma.feedPostAttachment.findUnique({
      where: { id: parsed.attachmentId },
      select: {
        id: true,
        storageKey: true,
        post: { select: { authorUserId: true } },
      },
    });
    if (!attachment) {
      throw new ActionError("NOT_FOUND", "Anexo não encontrado.");
    }

    const isOwner = attachment.post.authorUserId === dbUser.id;
    const moderator =
      (await can(FEED_PERMISSION, "delete")) && isModeratorUser(user);
    if (!isOwner && !moderator) {
      throw new ActionError("FORBIDDEN", "Você não pode remover este anexo.");
    }

    await prisma.feedPostAttachment.delete({ where: { id: attachment.id } });

    if (isStorageConfigured()) {
      try {
        await getFeedAttachmentStorageProvider()?.delete(attachment.storageKey);
      } catch (error) {
        console.error("[feed] failed to delete attachment from storage", error);
      }
    }

    await recordAuditEvent({
      actorUserId: dbUser.id,
      entityType: "FeedPostAttachment",
      entityId: attachment.id,
      action: "FEED_ATTACHMENT_REMOVED",
    });

    revalidatePath(FEED_PATH);
    return { ok: true, data: { id: attachment.id } };
  } catch (error) {
    return toFailure(error);
  }
}

/**
 * Thin server action so the client can request an attachment link on demand.
 * RBAC + signing happen in `getFeedAttachmentSignedUrl` (lib/db/feed).
 */
export async function getAttachmentUrl(input: {
  attachmentId: string;
}): Promise<ActionResult<{ url: string }>> {
  try {
    ensureDatabase();
    // Defense-in-depth: exige FEED.view antes de assinar a URL do anexo (um
    // papel sem acesso ao Feed não deve obter links de anexos).
    await requirePermission(FEED_PERMISSION, "view");
    if (typeof input?.attachmentId !== "string" || !input.attachmentId.trim()) {
      throw new ActionError("INVALID_INPUT", "Identificador obrigatório.");
    }
    return await getFeedAttachmentSignedUrl(input.attachmentId);
  } catch (error) {
    return toFailure(error);
  }
}
