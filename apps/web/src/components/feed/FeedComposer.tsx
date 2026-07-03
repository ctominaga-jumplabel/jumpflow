"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { FileText, Image as ImageIcon, Lock, Send, Video, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { focusRing, focusRingInput } from "@/lib/styles";
import { Avatar } from "./FeedCommentThread";
import { FEED_BODY_MAX } from "@/lib/feed/schemas";
import { FEED_MAX_ATTACHMENTS } from "@/lib/feed/visibility";
import { attachToPost, createPost } from "@/app/app/feed/actions";
import {
  MAX_FEED_ATTACHMENT_SIZE_BYTES,
  MAX_FEED_VIDEO_SIZE_BYTES,
  isFeedVideoType,
} from "@/lib/storage/file-validation";
import type { FeedbackTone } from "@/components/ui/Feedback";

/** UI soft limit for the post body (server schema caps at FEED_BODY_MAX). */
const BODY_LIMIT = Math.min(2000, FEED_BODY_MAX);

/**
 * Client-side pre-check only — the SERVER is the validation authority
 * (lib/storage/file-validation.ts). Mirrors that whitelist per picker.
 */
const IMAGE_ACCEPT_ATTR = ".jpg,.jpeg,.png,.webp,.gif,image/jpeg,image/png,image/webp,image/gif";
const VIDEO_ACCEPT_ATTR = "video/mp4,video/webm,.mp4,.webm";
const FILE_ACCEPT_ATTR = ".pdf,application/pdf";

const IMAGE_MIME_TYPES = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
]);

function isImageFile(file: File): boolean {
  return IMAGE_MIME_TYPES.has(file.type);
}

function isVideoFile(file: File): boolean {
  return isFeedVideoType(file.type);
}

function formatSize(bytes: number): string {
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1).replace(".", ",")} MB`;
}

export interface FeedComposerProps {
  /** Viewer may post (FEED.create). When false: read-only notice. */
  canPost: boolean;
  /** Storage configured — otherwise attachments are hidden honestly. */
  storageEnabled: boolean;
  authorName: string;
  notify: (tone: FeedbackTone, text: string) => void;
}

/**
 * Post composer: a body textarea (counter, soft 2000 limit) plus explicit media
 * pickers — Foto (images), Vídeo (mp4/webm) and a generic file (PDF). Selected
 * images and videos get an inline preview before publishing. Every post is
 * created as PUBLIC_INTERNAL (the model default; no visibility control in v1).
 * Publishing creates the post, then uploads each attachment via the attach
 * action. Disabled (read-only) when `!canPost`.
 */
export function FeedComposer({
  canPost,
  storageEnabled,
  authorName,
  notify,
}: FeedComposerProps) {
  const imageInputRef = useRef<HTMLInputElement>(null);
  const videoInputRef = useRef<HTMLInputElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [pending, startTransition] = useTransition();
  const [body, setBody] = useState("");
  const [files, setFiles] = useState<File[]>([]);
  const [fileError, setFileError] = useState<string | null>(null);

  const remaining = BODY_LIMIT - body.length;
  const trimmed = body.trim();
  const canSubmit = canPost && !pending && trimmed.length > 0 && remaining >= 0;

  if (!canPost) {
    return (
      <div className="rounded-[var(--radius-card)] border-2 border-ink bg-surface px-5 py-4 text-sm text-medium shadow-[4px_4px_0_0_var(--color-ink)]">
        <span className="flex items-center gap-2">
          <Lock aria-hidden="true" className="size-4 shrink-0 text-soft" />
          Você está no modo leitura. Acompanhe os comentários e reações do time —
          publicar exige permissão.
        </span>
      </div>
    );
  }

  function addFiles(list: FileList | null) {
    if (!list || list.length === 0) return;
    setFileError(null);
    const incoming = Array.from(list);
    const next = [...files];
    for (const file of incoming) {
      if (next.length >= FEED_MAX_ATTACHMENTS) {
        setFileError(`Máximo de ${FEED_MAX_ATTACHMENTS} anexos por post.`);
        break;
      }
      // Per-type size limit mirrors the server (video 50 MB, others 10 MB).
      const isVideo = isVideoFile(file);
      const maxBytes = isVideo
        ? MAX_FEED_VIDEO_SIZE_BYTES
        : MAX_FEED_ATTACHMENT_SIZE_BYTES;
      if (file.size > maxBytes) {
        const limitLabel = isVideo ? "50 MB (vídeo)" : "10 MB";
        setFileError(`"${file.name}" excede o limite de ${limitLabel}.`);
        continue;
      }
      next.push(file);
    }
    setFiles(next);
  }

  function removeFile(index: number) {
    setFiles((prev) => prev.filter((_, i) => i !== index));
    setFileError(null);
  }

  function reset() {
    setBody("");
    setFiles([]);
    setFileError(null);
  }

  function submit() {
    if (!canSubmit) return;
    startTransition(async () => {
      const created = await createPost({ body: trimmed });
      if (!created.ok) {
        notify("warning", created.message);
        return;
      }
      // Upload attachments sequentially (each via FormData) onto the new post.
      let attachFailures = 0;
      for (const file of files) {
        const fd = new FormData();
        fd.set("postId", created.data.id);
        fd.set("file", file);
        const res = await attachToPost(fd);
        if (!res.ok) attachFailures += 1;
      }
      reset();
      if (attachFailures > 0) {
        notify(
          "warning",
          `Post publicado, mas ${attachFailures} anexo(s) falharam.`,
        );
      } else {
        notify("success", "Post publicado.");
      }
    });
  }

  return (
    <div className="rounded-[var(--radius-card)] border-2 border-ink bg-surface p-4 shadow-[4px_4px_0_0_var(--color-ink)] sm:p-5">
      <div className="flex items-start gap-3">
        <Avatar name={authorName} />
        <div className="min-w-0 flex-1">
          <label htmlFor="feed-composer-body" className="sr-only">
            Escreva um post
          </label>
          <textarea
            id="feed-composer-body"
            value={body}
            maxLength={BODY_LIMIT}
            rows={3}
            placeholder="Compartilhe um comunicado, conquista ou novidade…"
            onChange={(e) => setBody(e.target.value)}
            onKeyDown={(e) => {
              // Ctrl/Cmd+Enter envia (Enter simples quebra linha em posts longos).
              if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
                e.preventDefault();
                submit();
              }
            }}
            className={cn(
              "w-full resize-y rounded-md border border-border bg-surface px-3 py-2 text-sm leading-6 text-strong",
              focusRingInput,
            )}
          />

          {files.length > 0 ? (
            <ul className="mt-2 grid gap-2">
              {files.map((file, index) => (
                <li key={`${file.name}-${index}`}>
                  <AttachmentPreview
                    file={file}
                    disabled={pending}
                    onRemove={() => removeFile(index)}
                  />
                </li>
              ))}
            </ul>
          ) : null}

          {fileError ? (
            <p role="alert" className="mt-1 text-xs font-medium text-danger">
              {fileError}
            </p>
          ) : null}

          <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
            <div className="flex flex-wrap items-center gap-2">
              {storageEnabled ? (
                <>
                  <button
                    type="button"
                    onClick={() => imageInputRef.current?.click()}
                    disabled={pending}
                    className={cn(
                      "inline-flex items-center gap-1.5 rounded-md border border-border bg-surface px-2.5 py-1.5 text-xs font-medium text-medium transition-colors hover:border-ink/40 hover:text-strong disabled:pointer-events-none disabled:opacity-50",
                      focusRing,
                    )}
                  >
                    <ImageIcon aria-hidden="true" className="size-3.5" />
                    Foto
                  </button>
                  <input
                    ref={imageInputRef}
                    id="feed-composer-image"
                    type="file"
                    multiple
                    accept={IMAGE_ACCEPT_ATTR}
                    className="sr-only"
                    disabled={pending}
                    onChange={(e) => {
                      addFiles(e.target.files);
                      e.target.value = "";
                    }}
                  />

                  <button
                    type="button"
                    onClick={() => videoInputRef.current?.click()}
                    disabled={pending}
                    className={cn(
                      "inline-flex items-center gap-1.5 rounded-md border border-border bg-surface px-2.5 py-1.5 text-xs font-medium text-medium transition-colors hover:border-ink/40 hover:text-strong disabled:pointer-events-none disabled:opacity-50",
                      focusRing,
                    )}
                  >
                    <Video aria-hidden="true" className="size-3.5" />
                    Vídeo
                  </button>
                  <input
                    ref={videoInputRef}
                    id="feed-composer-video"
                    type="file"
                    accept={VIDEO_ACCEPT_ATTR}
                    className="sr-only"
                    disabled={pending}
                    onChange={(e) => {
                      addFiles(e.target.files);
                      e.target.value = "";
                    }}
                  />

                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    disabled={pending}
                    className={cn(
                      "inline-flex items-center gap-1.5 rounded-md border border-border bg-surface px-2.5 py-1.5 text-xs font-medium text-medium transition-colors hover:border-ink/40 hover:text-strong disabled:pointer-events-none disabled:opacity-50",
                      focusRing,
                    )}
                  >
                    <FileText aria-hidden="true" className="size-3.5" />
                    Arquivo
                  </button>
                  <input
                    ref={fileInputRef}
                    id="feed-composer-file"
                    type="file"
                    multiple
                    accept={FILE_ACCEPT_ATTR}
                    className="sr-only"
                    disabled={pending}
                    onChange={(e) => {
                      addFiles(e.target.files);
                      e.target.value = "";
                    }}
                  />
                </>
              ) : null}
            </div>

            <div className="flex items-center gap-2">
              <span
                className={cn(
                  "text-xs tabular-nums",
                  remaining < 0 ? "text-danger" : "text-soft",
                )}
              >
                {remaining}
              </span>
              <button
                type="button"
                onClick={submit}
                disabled={!canSubmit}
                className={cn(
                  "inline-flex items-center gap-1.5 rounded-md bg-brand px-3.5 py-1.5 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-50",
                  focusRing,
                )}
              >
                <Send aria-hidden="true" className="size-4" />
                {pending ? "Publicando…" : "Publicar"}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

/**
 * Preview of a pending attachment before publishing. Images and videos show a
 * local object-URL thumbnail/player; other files fall back to a name + size
 * row. The object URL is revoked on unmount to avoid leaks.
 */
function AttachmentPreview({
  file,
  disabled,
  onRemove,
}: {
  file: File;
  disabled: boolean;
  onRemove: () => void;
}) {
  const image = isImageFile(file);
  const video = isVideoFile(file);
  // Create the preview object URL once (lazy initializer — no setState in an
  // effect). The effect only revokes it on unmount, keeping the render pure.
  const [objectUrl] = useState<string | null>(() =>
    isImageFile(file) || isVideoFile(file) ? URL.createObjectURL(file) : null,
  );

  useEffect(() => {
    if (!objectUrl) return;
    return () => URL.revokeObjectURL(objectUrl);
  }, [objectUrl]);

  const removeButton = (
    <button
      type="button"
      onClick={onRemove}
      aria-label={`Remover ${file.name}`}
      disabled={disabled}
      className={cn(
        "grid size-6 shrink-0 place-items-center rounded text-medium hover:bg-surface hover:text-strong disabled:opacity-50",
        focusRing,
      )}
    >
      <X aria-hidden="true" className="size-3.5" />
    </button>
  );

  if ((image || video) && objectUrl) {
    return (
      <div className="overflow-hidden rounded-md border border-border bg-surface-muted/30">
        <div className="flex items-center gap-2 border-b border-border px-2.5 py-1.5">
          <span className="min-w-0 flex-1 truncate text-xs text-strong">
            {file.name}
          </span>
          <span className="shrink-0 text-xs text-soft">
            {formatSize(file.size)}
          </span>
          {removeButton}
        </div>
        {image ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={objectUrl}
            alt={`Pré-visualização de ${file.name}`}
            className="max-h-72 w-full object-contain"
          />
        ) : (
          <video
            src={objectUrl}
            controls
            preload="metadata"
            aria-label={`Pré-visualização do vídeo ${file.name}`}
            className="max-h-72 w-full bg-black object-contain"
          />
        )}
      </div>
    );
  }

  return (
    <div className="flex items-center gap-2 rounded-md border border-border bg-surface-muted/40 px-2.5 py-1.5">
      <FileText aria-hidden="true" className="size-4 shrink-0 text-medium" />
      <span className="min-w-0 flex-1 truncate text-xs text-strong">
        {file.name}
      </span>
      <span className="shrink-0 text-xs text-soft">{formatSize(file.size)}</span>
      {removeButton}
    </div>
  );
}
