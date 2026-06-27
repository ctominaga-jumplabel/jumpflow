"use client";

import { useRef, useState, useTransition } from "react";
import { FileText, Globe, Lock, Paperclip, Send, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { focusRing, focusRingInput } from "@/lib/styles";
import { Avatar } from "./FeedCommentThread";
import { FEED_BODY_MAX } from "@/lib/feed/schemas";
import { FEED_MAX_ATTACHMENTS } from "@/lib/feed/visibility";
import { attachToPost, createPost } from "@/app/app/feed/actions";
import type { FeedbackTone } from "@/components/ui/Feedback";

/** UI soft limit for the post body (server schema caps at FEED_BODY_MAX). */
const BODY_LIMIT = Math.min(2000, FEED_BODY_MAX);

/**
 * Client-side pre-check only — the SERVER is the validation authority
 * (lib/storage/file-validation.ts). Mirrors that whitelist + size limit.
 */
const ACCEPT_ATTR = ".pdf,.jpg,.jpeg,.png,.webp,.gif";
const MAX_SIZE_BYTES = 10 * 1024 * 1024; // 10 MB

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
 * Post composer: a body textarea (counter, soft 2000 limit), a visibility
 * selector (only PUBLIC_INTERNAL active in v1), and an attachment picker
 * (image/file, with preview). Publishing creates the post, then uploads each
 * attachment via the attach action. Disabled (read-only) when `!canPost`.
 */
export function FeedComposer({
  canPost,
  storageEnabled,
  authorName,
  notify,
}: FeedComposerProps) {
  const inputRef = useRef<HTMLInputElement>(null);
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
      if (file.size > MAX_SIZE_BYTES) {
        setFileError(`"${file.name}" excede o limite de 10 MB.`);
        continue;
      }
      next.push(file);
    }
    setFiles(next);
    if (inputRef.current) inputRef.current.value = "";
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
            <ul className="mt-2 grid gap-1.5">
              {files.map((file, index) => (
                <li
                  key={`${file.name}-${index}`}
                  className="flex items-center gap-2 rounded-md border border-border bg-surface-muted/40 px-2.5 py-1.5"
                >
                  <FileText
                    aria-hidden="true"
                    className="size-4 shrink-0 text-medium"
                  />
                  <span className="min-w-0 flex-1 truncate text-xs text-strong">
                    {file.name}
                  </span>
                  <span className="shrink-0 text-xs text-soft">
                    {formatSize(file.size)}
                  </span>
                  <button
                    type="button"
                    onClick={() => removeFile(index)}
                    aria-label={`Remover ${file.name}`}
                    disabled={pending}
                    className={cn(
                      "grid size-6 shrink-0 place-items-center rounded text-medium hover:bg-surface hover:text-strong",
                      focusRing,
                    )}
                  >
                    <X aria-hidden="true" className="size-3.5" />
                  </button>
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
                  <label
                    htmlFor="feed-composer-file"
                    className={cn(
                      "inline-flex cursor-pointer items-center gap-1.5 rounded-md border border-border bg-surface px-2.5 py-1.5 text-xs font-medium text-medium transition-colors hover:border-ink/40 hover:text-strong",
                      pending && "pointer-events-none opacity-50",
                      focusRing,
                    )}
                  >
                    <Paperclip aria-hidden="true" className="size-3.5" />
                    Anexar
                  </label>
                  <input
                    ref={inputRef}
                    id="feed-composer-file"
                    type="file"
                    multiple
                    accept={ACCEPT_ATTR}
                    className="sr-only"
                    disabled={pending}
                    onChange={(e) => addFiles(e.target.files)}
                  />
                </>
              ) : null}

              <label className="inline-flex items-center gap-1.5 text-xs font-medium text-medium">
                <Globe aria-hidden="true" className="size-3.5 text-soft" />
                <span className="sr-only">Visibilidade</span>
                <select
                  aria-label="Visibilidade do post"
                  defaultValue="PUBLIC_INTERNAL"
                  disabled
                  title="No v1, todo post é visível para a empresa toda."
                  className="rounded-md border border-border bg-surface-muted/50 px-2 py-1 text-xs text-medium"
                >
                  <option value="PUBLIC_INTERNAL">Empresa toda</option>
                </select>
              </label>
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
