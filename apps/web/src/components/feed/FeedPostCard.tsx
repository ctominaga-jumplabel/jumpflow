"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { motion, useReducedMotion } from "motion/react";
import {
  Check,
  Download,
  FileText,
  ImageOff,
  MoreHorizontal,
  Pencil,
  Pin,
  PinOff,
  Shield,
  Trash2,
  VideoOff,
  X,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { focusRing, focusRingInput } from "@/lib/styles";
import { StatusBadge } from "@/components/ui/StatusBadge";
import type { FeedAttachmentMeta, FeedPostView } from "@/lib/feed/types";
import { formatRelativeTime } from "@/lib/feed/types";
import { FEED_BODY_MAX } from "@/lib/feed/schemas";
import {
  deletePost,
  editPost,
  getAttachmentUrl,
  moderateRemove,
  togglePin,
} from "@/app/app/feed/actions";
import type { FeedbackTone } from "@/components/ui/Feedback";
import { ReactionBar } from "./ReactionBar";
import { FeedTombstone } from "./FeedTombstone";
import { FeedCommentThread, Avatar } from "./FeedCommentThread";

/** UI soft limit for the post body (server schema caps at FEED_BODY_MAX). */
const BODY_LIMIT = Math.min(2000, FEED_BODY_MAX);

const IMAGE_TYPES = new Set(["image/jpeg", "image/png", "image/webp", "image/gif"]);
const VIDEO_TYPES = new Set(["video/mp4", "video/webm"]);

export interface FeedPostCapabilities {
  canPost: boolean;
  canModerate: boolean;
  canPin: boolean;
}

export interface FeedPostCardProps {
  post: FeedPostView;
  capabilities: FeedPostCapabilities;
  notify: (tone: FeedbackTone, text: string) => void;
  /** Animate entry (used for posts appended after the first paint). */
  isNew?: boolean;
}

/**
 * A single feed post: author + relative time, badges (Fixado/Editado), body,
 * attachments (image inline via a signed URL, files as a download link),
 * reactions, the author/moderator action menu and the comment thread.
 *
 * Removed/deleted posts render a tombstone (the server already stripped the
 * body and attachments).
 */
export function FeedPostCard({
  post,
  capabilities,
  notify,
  isNew = false,
}: FeedPostCardProps) {
  const reduce = useReducedMotion();
  const tombstoned = post.body === null;

  return (
    <motion.article
      data-testid="feed-post"
      initial={isNew && !reduce ? { opacity: 0, y: -8 } : false}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.2, ease: "easeOut" }}
      className={cn(
        "rounded-[var(--radius-card)] border-2 border-ink bg-surface p-4 shadow-[4px_4px_0_0_var(--color-ink)] sm:p-5",
        post.pinned && "ring-2 ring-marker ring-offset-2 ring-offset-canvas",
      )}
    >
      {tombstoned ? (
        <FeedTombstone label={post.tombstone ?? ""} />
      ) : (
        <PostBody post={post} capabilities={capabilities} notify={notify} />
      )}
    </motion.article>
  );
}

function PostBody({
  post,
  capabilities,
  notify,
}: {
  post: FeedPostView;
  capabilities: FeedPostCapabilities;
  notify: (tone: FeedbackTone, text: string) => void;
}) {
  const [pending, startTransition] = useTransition();
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(post.body ?? "");
  const [menuOpen, setMenuOpen] = useState(false);

  function submitEdit() {
    const body = draft.trim();
    if (!body) return;
    startTransition(async () => {
      const result = await editPost({ postId: post.id, body });
      if (result.ok) {
        setEditing(false);
        notify("success", "Post atualizado.");
      } else {
        notify("warning", result.message);
      }
    });
  }

  function run(
    action: () => Promise<{ ok: boolean; message?: string }>,
    okMessage: string,
  ) {
    setMenuOpen(false);
    startTransition(async () => {
      const result = await action();
      if (result.ok) notify("success", okMessage);
      else notify("warning", result.message ?? "Não foi possível concluir.");
    });
  }

  return (
    <>
      <header className="flex items-start gap-3">
        <Avatar name={post.author.name} />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <span className="font-semibold text-strong">{post.author.name}</span>
            <span className="text-xs text-soft" title={post.createdAt}>
              {formatRelativeTime(post.createdAt)}
            </span>
            {post.editedAt ? (
              <span className="text-xs text-soft">· editado</span>
            ) : null}
            {post.pinned ? (
              <StatusBadge tone="warning">
                <Pin aria-hidden="true" className="size-3" />
                Fixado
              </StatusBadge>
            ) : null}
          </div>
        </div>

        <PostMenu
          post={post}
          capabilities={capabilities}
          open={menuOpen}
          setOpen={setMenuOpen}
          pending={pending}
          onEdit={() => {
            setMenuOpen(false);
            setEditing(true);
            setDraft(post.body ?? "");
          }}
          onDelete={() =>
            run(() => deletePost({ postId: post.id }), "Post removido.")
          }
          onModerate={() =>
            run(
              () => moderateRemove({ postId: post.id }),
              "Post removido pela moderação.",
            )
          }
          onTogglePin={() =>
            run(
              () => togglePin({ postId: post.id, pinned: !post.pinned }),
              post.pinned ? "Post desafixado." : "Post fixado.",
            )
          }
        />
      </header>

      {editing ? (
        <div className="mt-3 space-y-2">
          <textarea
            value={draft}
            maxLength={BODY_LIMIT}
            rows={4}
            onChange={(e) => setDraft(e.target.value)}
            aria-label="Editar post"
            className={cn(
              "w-full resize-y rounded-md border border-border bg-surface px-3 py-2 text-sm text-strong",
              focusRingInput,
            )}
          />
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={submitEdit}
              disabled={pending || !draft.trim()}
              className={cn(
                "inline-flex items-center gap-1 rounded-md bg-brand px-3 py-1 text-xs font-semibold text-white disabled:opacity-50",
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
                setDraft(post.body ?? "");
              }}
              disabled={pending}
              className={cn(
                "inline-flex items-center gap-1 rounded-md px-3 py-1 text-xs font-semibold text-medium hover:text-strong",
                focusRing,
              )}
            >
              <X aria-hidden="true" className="size-3.5" />
              Cancelar
            </button>
          </div>
        </div>
      ) : (
        <p className="mt-3 whitespace-pre-wrap break-words text-sm leading-6 text-strong">
          {post.body}
        </p>
      )}

      {post.attachments.length > 0 ? (
        <ul className="mt-3 grid gap-2">
          {post.attachments.map((att) => (
            <li key={att.id}>
              <AttachmentItem attachment={att} notify={notify} />
            </li>
          ))}
        </ul>
      ) : null}

      <div className="mt-3 flex flex-wrap items-center gap-3 border-t border-border pt-3">
        <ReactionBar
          postId={post.id}
          reactions={post.reactions}
          canReact={capabilities.canPost}
          notify={notify}
        />
        <span className="text-xs text-soft">
          {post.commentCount}{" "}
          {post.commentCount === 1 ? "comentário" : "comentários"}
        </span>
      </div>

      <div className="mt-3">
        <FeedCommentThread
          postId={post.id}
          comments={post.comments}
          commentCount={post.commentCount}
          capabilities={capabilities}
          notify={notify}
        />
      </div>
    </>
  );
}

function PostMenu({
  post,
  capabilities,
  open,
  setOpen,
  pending,
  onEdit,
  onDelete,
  onModerate,
  onTogglePin,
}: {
  post: FeedPostView;
  capabilities: FeedPostCapabilities;
  open: boolean;
  setOpen: (v: boolean) => void;
  pending: boolean;
  onEdit: () => void;
  onDelete: () => void;
  onModerate: () => void;
  onTogglePin: () => void;
}) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function onClickOutside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", onClickOutside);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onClickOutside);
      document.removeEventListener("keydown", onKey);
    };
  }, [open, setOpen]);

  const showAuthor = post.isOwn;
  const showModerate = capabilities.canModerate && !post.isOwn;
  const showPin = capabilities.canPin;
  if (!showAuthor && !showModerate && !showPin) return null;

  return (
    <div ref={ref} className="relative shrink-0">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        disabled={pending}
        aria-label="Ações do post"
        aria-expanded={open}
        aria-haspopup="menu"
        className={cn(
          "grid size-8 place-items-center rounded-md text-medium transition-colors hover:bg-surface-muted hover:text-strong disabled:opacity-50",
          focusRing,
        )}
      >
        <MoreHorizontal aria-hidden="true" className="size-5" />
      </button>
      {open ? (
        <div
          role="menu"
          aria-label="Ações do post"
          className="absolute right-0 top-full z-20 mt-1 w-52 overflow-hidden rounded-md border-2 border-ink bg-surface py-1 shadow-[3px_3px_0_0_var(--color-ink)]"
        >
          {showAuthor ? (
            <>
              <MenuItem icon={Pencil} label="Editar" onClick={onEdit} />
              <MenuItem
                icon={Trash2}
                label="Remover"
                onClick={onDelete}
                tone="danger"
              />
            </>
          ) : null}
          {showPin ? (
            <MenuItem
              icon={post.pinned ? PinOff : Pin}
              label={post.pinned ? "Desafixar" : "Fixar"}
              onClick={onTogglePin}
            />
          ) : null}
          {showModerate ? (
            <MenuItem
              icon={Shield}
              label="Remover (moderação)"
              onClick={onModerate}
              tone="danger"
            />
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

function MenuItem({
  icon: Icon,
  label,
  onClick,
  tone = "neutral",
}: {
  icon: typeof Pencil;
  label: string;
  onClick: () => void;
  tone?: "neutral" | "danger";
}) {
  return (
    <button
      type="button"
      role="menuitem"
      onClick={onClick}
      className={cn(
        "flex w-full items-center gap-2 px-3 py-2 text-left text-sm font-medium transition-colors hover:bg-surface-muted",
        tone === "danger" ? "text-danger" : "text-strong",
        focusRing,
      )}
    >
      <Icon aria-hidden="true" className="size-4" />
      {label}
    </button>
  );
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1).replace(".", ",")} MB`;
}

/**
 * One attachment. Images and videos load a short-lived signed URL on demand and
 * render inline (image via <img>, video via a native <video controls>); other
 * files render as a download link that signs on click. The URL is fetched via
 * the `getAttachmentUrl` action (RBAC + signing server-side).
 */
function AttachmentItem({
  attachment,
  notify,
}: {
  attachment: FeedAttachmentMeta;
  notify: (tone: FeedbackTone, text: string) => void;
}) {
  const isImage = IMAGE_TYPES.has(attachment.contentType);
  const isVideo = VIDEO_TYPES.has(attachment.contentType);
  const isMedia = isImage || isVideo;
  const [url, setUrl] = useState<string | null>(null);
  // Loading starts true for inline media (the effect signs the URL); the effect
  // only sets state from the async callback, never synchronously, to avoid a
  // setState-in-effect cascade.
  const [loading, setLoading] = useState(isMedia);
  const [failed, setFailed] = useState(false);

  // Lazily sign the media URL once the item mounts.
  useEffect(() => {
    if (!isMedia) return;
    let active = true;
    getAttachmentUrl({ attachmentId: attachment.id }).then((result) => {
      if (!active) return;
      setLoading(false);
      if (result.ok) setUrl(result.data.url);
      else setFailed(true);
    });
    return () => {
      active = false;
    };
  }, [attachment.id, isMedia]);

  async function openFile() {
    const result = await getAttachmentUrl({ attachmentId: attachment.id });
    if (result.ok) {
      window.open(result.data.url, "_blank", "noopener,noreferrer");
    } else {
      notify("warning", result.message);
    }
  }

  if (isImage) {
    if (failed) {
      return (
        <p className="flex items-center gap-2 rounded-md border border-border bg-surface-muted/40 px-3 py-2 text-xs text-soft">
          <ImageOff aria-hidden="true" className="size-4 shrink-0" />
          Não foi possível carregar a imagem.
        </p>
      );
    }
    return (
      <div className="overflow-hidden rounded-md border border-border bg-surface-muted/30">
        {url ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={url}
            alt={attachment.fileName}
            loading="lazy"
            className="max-h-96 w-full object-contain"
          />
        ) : (
          <div
            aria-busy={loading}
            className="grid h-40 place-items-center text-xs text-soft"
          >
            {loading ? "Carregando imagem…" : ""}
          </div>
        )}
      </div>
    );
  }

  if (isVideo) {
    if (failed) {
      return (
        <p className="flex items-center gap-2 rounded-md border border-border bg-surface-muted/40 px-3 py-2 text-xs text-soft">
          <VideoOff aria-hidden="true" className="size-4 shrink-0" />
          Não foi possível carregar o vídeo.
        </p>
      );
    }
    return (
      <div className="overflow-hidden rounded-md border border-border bg-black/90">
        {url ? (
          <video
            src={url}
            controls
            preload="none"
            aria-label={`Vídeo: ${attachment.fileName}`}
            className="max-h-96 w-full bg-black object-contain"
          >
            Seu navegador não suporta reprodução de vídeo.
          </video>
        ) : (
          <div
            aria-busy={loading}
            className="grid h-40 place-items-center text-xs text-white/70"
          >
            {loading ? "Carregando vídeo…" : ""}
          </div>
        )}
      </div>
    );
  }

  return (
    <button
      type="button"
      onClick={openFile}
      className={cn(
        "flex w-full items-center gap-3 rounded-md border border-border bg-surface px-3 py-2 text-left transition-colors hover:border-ink/40",
        focusRing,
      )}
    >
      <FileText aria-hidden="true" className="size-5 shrink-0 text-medium" />
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm font-medium text-strong">
          {attachment.fileName}
        </span>
        <span className="block text-xs text-soft">
          {formatSize(attachment.size)}
        </span>
      </span>
      <Download aria-hidden="true" className="size-4 shrink-0 text-medium" />
    </button>
  );
}
