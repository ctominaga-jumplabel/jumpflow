import { z } from "zod";

/**
 * Shared Zod schemas + types for the Feed social interno (Melhoria #5).
 *
 * Pure (no server-only imports), so they are reused by server actions and unit
 * tests. IDs are validated as non-empty strings (NOT `.cuid()`): seed ids like
 * `seed-user-*` are not cuids, and validating with `.cuid()` would silently
 * break those rows.
 */

export const FEED_BODY_MAX = 5000;
export const FEED_COMMENT_MAX = 2000;
export const FEED_REMOVAL_REASON_MAX = 500;

/** Generic id: a trimmed, non-empty string (never `.cuid()` — seed ids differ). */
const idSchema = z
  .string()
  .trim()
  .min(1, "Identificador obrigatório.");

const bodySchema = z
  .string()
  .trim()
  .min(1, "Escreva algo antes de publicar.")
  .max(FEED_BODY_MAX, `O texto excede ${FEED_BODY_MAX} caracteres.`);

const commentSchema = z
  .string()
  .trim()
  .min(1, "Escreva um comentário.")
  .max(FEED_COMMENT_MAX, `O comentário excede ${FEED_COMMENT_MAX} caracteres.`);

/** Single emoji-ish token; kept short, no whitespace. */
const emojiSchema = z
  .string()
  .trim()
  .min(1, "Reação obrigatória.")
  .max(16, "Reação inválida.")
  .refine((v) => !/\s/.test(v), "Reação inválida.");

export const createPostSchema = z.object({
  body: bodySchema,
});
export type CreatePostInput = z.infer<typeof createPostSchema>;

export const editPostSchema = z.object({
  postId: idSchema,
  body: bodySchema,
});
export type EditPostInput = z.infer<typeof editPostSchema>;

export const postIdSchema = z.object({ postId: idSchema });
export type PostIdInput = z.infer<typeof postIdSchema>;

export const addCommentSchema = z.object({
  postId: idSchema,
  body: commentSchema,
});
export type AddCommentInput = z.infer<typeof addCommentSchema>;

export const editCommentSchema = z.object({
  commentId: idSchema,
  body: commentSchema,
});
export type EditCommentInput = z.infer<typeof editCommentSchema>;

export const commentIdSchema = z.object({ commentId: idSchema });
export type CommentIdInput = z.infer<typeof commentIdSchema>;

/** Toggle a reaction on a post OR a comment (exactly one target). */
export const toggleReactionSchema = z
  .object({
    emoji: emojiSchema,
    postId: idSchema.optional(),
    commentId: idSchema.optional(),
  })
  .refine(
    (v) => (v.postId === undefined) !== (v.commentId === undefined),
    "Informe exatamente um alvo (post ou comentário).",
  );
export type ToggleReactionInput = z.infer<typeof toggleReactionSchema>;

export const moderateRemoveSchema = z
  .object({
    postId: idSchema.optional(),
    commentId: idSchema.optional(),
    reason: z
      .string()
      .trim()
      .max(FEED_REMOVAL_REASON_MAX, "Justificativa muito longa.")
      .optional(),
  })
  .refine(
    (v) => (v.postId === undefined) !== (v.commentId === undefined),
    "Informe exatamente um alvo (post ou comentário).",
  );
export type ModerateRemoveInput = z.infer<typeof moderateRemoveSchema>;

export const togglePinSchema = z.object({
  postId: idSchema,
  pinned: z.boolean(),
});
export type TogglePinInput = z.infer<typeof togglePinSchema>;

export const attachmentIdSchema = z.object({ attachmentId: idSchema });
export type AttachmentIdInput = z.infer<typeof attachmentIdSchema>;
