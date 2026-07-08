"use client";

import { useState, useTransition } from "react";
import { Check, MessageSquare, Pencil, Shield, Trash2, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { focusRing } from "@/lib/styles";
import type { FeedCommentView } from "@/lib/feed/types";
import { formatRelativeTime } from "@/lib/feed/types";
import { FEED_COMMENT_MAX } from "@/lib/feed/schemas";
import { MentionTextarea, type MentionUser } from "./MentionTextarea";
import { MentionText, collectActiveMentionIds } from "./MentionText";
import {
  addComment,
  deleteComment,
  editComment,
  moderateRemove,
} from "@/app/app/feed/actions";
import type { FeedbackTone } from "@/components/ui/Feedback";
import { ReactionBar } from "./ReactionBar";
import { FeedTombstone } from "./FeedTombstone";

/** UI soft limit for comments (the server schema caps at FEED_COMMENT_MAX). */
const COMMENT_LIMIT = Math.min(1000, FEED_COMMENT_MAX);

interface Capabilities {
  canPost: boolean;
  canModerate: boolean;
}

export interface FeedCommentThreadProps {
  postId: string;
  comments: FeedCommentView[];
  /** Total VISIBLE comment count on the post (drives "ver todas"). */
  commentCount: number;
  capabilities: Capabilities;
  notify: (tone: FeedbackTone, text: string) => void;
}

/**
 * Comment thread under a post: the server-provided preview (oldest-first), a
 * "ver todas as N respostas" affordance (count vs. preview length), inline
 * edit/delete for the author, moderation removal, reactions, and a composer.
 */
export function FeedCommentThread({
  postId,
  comments,
  commentCount,
  capabilities,
  notify,
}: FeedCommentThreadProps) {
  const hiddenCount = Math.max(0, commentCount - comments.length);

  return (
    <div className="space-y-3" data-testid="comment-thread">
      {hiddenCount > 0 ? (
        <p className="text-xs font-medium text-soft">
          Mostrando as {comments.length} respostas mais recentes de{" "}
          {commentCount}. Abra o post para ver todas as {commentCount} respostas.
        </p>
      ) : null}

      <ul className="space-y-3">
        {comments.map((comment) => (
          <li key={comment.id}>
            <CommentItem
              comment={comment}
              capabilities={capabilities}
              notify={notify}
            />
          </li>
        ))}
      </ul>

      {capabilities.canPost ? (
        <CommentComposer postId={postId} notify={notify} />
      ) : null}
    </div>
  );
}

function CommentItem({
  comment,
  capabilities,
  notify,
}: {
  comment: FeedCommentView;
  capabilities: Capabilities;
  notify: (tone: FeedbackTone, text: string) => void;
}) {
  const [pending, startTransition] = useTransition();
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(comment.body ?? "");
  const [editMentions, setEditMentions] = useState<MentionUser[]>(() =>
    comment.mentions.map((m) => ({ id: m.userId, name: m.name })),
  );

  if (comment.body === null) {
    return <FeedTombstone label={comment.tombstone ?? ""} compact />;
  }

  function submitEdit() {
    const body = draft.trim();
    if (!body) return;
    const mentionedUserIds = collectActiveMentionIds(body, editMentions);
    startTransition(async () => {
      const result = await editComment({
        commentId: comment.id,
        body,
        mentionedUserIds,
      });
      if (result.ok) {
        setEditing(false);
        notify("success", "Comentário atualizado.");
      } else {
        notify("warning", result.message);
      }
    });
  }

  function handleDelete() {
    startTransition(async () => {
      const result = await deleteComment({ commentId: comment.id });
      if (result.ok) notify("success", "Comentário removido.");
      else notify("warning", result.message);
    });
  }

  function handleModerate() {
    startTransition(async () => {
      const result = await moderateRemove({ commentId: comment.id });
      if (result.ok) notify("success", "Comentário removido pela moderação.");
      else notify("warning", result.message);
    });
  }

  return (
    <div className="rounded-md bg-surface-muted/40 px-3 py-2">
      <div className="flex items-center gap-2 text-xs">
        <Avatar name={comment.author.name} size="sm" />
        <span className="font-semibold text-strong">{comment.author.name}</span>
        <span className="text-soft" title={comment.createdAt}>
          {formatRelativeTime(comment.createdAt)}
        </span>
        {comment.editedAt ? (
          <span className="text-soft">· editado</span>
        ) : null}
      </div>

      {editing ? (
        <div className="mt-2 space-y-2">
          <MentionTextarea
            value={draft}
            maxLength={COMMENT_LIMIT}
            rows={2}
            disabled={pending}
            onChange={setDraft}
            onAddMention={(user) =>
              setEditMentions((prev) =>
                prev.some((m) => m.id === user.id) ? prev : [...prev, user],
              )
            }
            ariaLabel="Editar comentário"
          />
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={submitEdit}
              disabled={pending || !draft.trim()}
              className={cn(
                "inline-flex items-center gap-1 rounded-md bg-brand px-2.5 py-1 text-xs font-semibold text-white disabled:opacity-50",
                focusRing,
              )}
            >
              <Check aria-hidden="true" className="size-3.5" />
              Salvar
            </button>
            <button
              type="button"
              onClick={() => {
                setEditing(false);
                setDraft(comment.body ?? "");
                setEditMentions(
                  comment.mentions.map((m) => ({ id: m.userId, name: m.name })),
                );
              }}
              disabled={pending}
              className={cn(
                "inline-flex items-center gap-1 rounded-md px-2.5 py-1 text-xs font-semibold text-medium hover:text-strong",
                focusRing,
              )}
            >
              <X aria-hidden="true" className="size-3.5" />
              Cancelar
            </button>
          </div>
        </div>
      ) : (
        <MentionText
          text={comment.body}
          mentions={comment.mentions}
          className="mt-1 whitespace-pre-wrap break-words text-sm leading-6 text-strong"
        />
      )}

      <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1.5">
        <ReactionBar
          commentId={comment.id}
          reactions={comment.reactions}
          canReact={capabilities.canPost}
          notify={notify}
        />
        {!editing ? (
          <div className="flex items-center gap-1">
            {comment.isOwn ? (
              <>
                <IconAction
                  icon={Pencil}
                  label="Editar comentário"
                  onClick={() => setEditing(true)}
                  disabled={pending}
                />
                <IconAction
                  icon={Trash2}
                  label="Remover comentário"
                  onClick={handleDelete}
                  disabled={pending}
                />
              </>
            ) : null}
            {capabilities.canModerate && !comment.isOwn ? (
              <IconAction
                icon={Shield}
                label="Remover pela moderação"
                onClick={handleModerate}
                disabled={pending}
                tone="danger"
              />
            ) : null}
          </div>
        ) : null}
      </div>
    </div>
  );
}

function CommentComposer({
  postId,
  notify,
}: {
  postId: string;
  notify: (tone: FeedbackTone, text: string) => void;
}) {
  const [pending, startTransition] = useTransition();
  const [body, setBody] = useState("");
  const [mentions, setMentions] = useState<MentionUser[]>([]);
  const remaining = COMMENT_LIMIT - body.length;
  const trimmed = body.trim();

  function submit() {
    if (!trimmed || pending) return;
    const mentionedUserIds = collectActiveMentionIds(trimmed, mentions);
    startTransition(async () => {
      const result = await addComment({
        postId,
        body: trimmed,
        mentionedUserIds,
      });
      if (result.ok) {
        setBody("");
        setMentions([]);
        notify("success", "Comentário publicado.");
      } else {
        notify("warning", result.message);
      }
    });
  }

  return (
    <div className="flex items-start gap-2">
      <MessageSquare
        aria-hidden="true"
        className="mt-2 size-4 shrink-0 text-soft"
      />
      <div className="min-w-0 flex-1">
        <MentionTextarea
          value={body}
          maxLength={COMMENT_LIMIT}
          rows={1}
          placeholder="Escreva um comentário… Use @ para mencionar."
          ariaLabel="Escrever comentário"
          disabled={pending}
          onChange={setBody}
          onAddMention={(user) =>
            setMentions((prev) =>
              prev.some((m) => m.id === user.id) ? prev : [...prev, user],
            )
          }
          onKeyDown={(e) => {
            // Enter envia; Shift+Enter quebra linha.
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              submit();
            }
          }}
        />
        <div className="mt-1 flex items-center justify-between gap-2">
          <span
            className={cn(
              "text-xs tabular-nums",
              remaining < 0 ? "text-danger" : "text-soft",
            )}
          >
            {remaining} caracteres restantes
          </span>
          <button
            type="button"
            onClick={submit}
            disabled={pending || !trimmed || remaining < 0}
            className={cn(
              "rounded-md bg-brand px-3 py-1 text-xs font-semibold text-white disabled:opacity-50",
              focusRing,
            )}
          >
            Comentar
          </button>
        </div>
      </div>
    </div>
  );
}

function IconAction({
  icon: Icon,
  label,
  onClick,
  disabled,
  tone = "neutral",
}: {
  icon: typeof Pencil;
  label: string;
  onClick: () => void;
  disabled?: boolean;
  tone?: "neutral" | "danger";
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      title={label}
      className={cn(
        "grid size-7 place-items-center rounded-md transition-colors hover:bg-surface disabled:opacity-50",
        tone === "danger"
          ? "text-medium hover:text-danger"
          : "text-medium hover:text-strong",
        focusRing,
      )}
    >
      <Icon aria-hidden="true" className="size-3.5" />
    </button>
  );
}

/** Initial-letter avatar — shared shape between posts and comments. */
export function Avatar({
  name,
  size = "md",
}: {
  name: string;
  size?: "sm" | "md";
}) {
  const initial = name.trim().charAt(0).toUpperCase() || "?";
  return (
    <span
      aria-hidden="true"
      className={cn(
        "grid shrink-0 place-items-center rounded-full border-2 border-ink bg-marker font-semibold text-ink",
        size === "sm" ? "size-6 text-xs" : "size-9 text-sm",
      )}
    >
      {initial}
    </span>
  );
}
