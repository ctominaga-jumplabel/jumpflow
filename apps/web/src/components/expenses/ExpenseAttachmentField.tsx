"use client";

import { useId, useRef, useState } from "react";
import { FileText, Paperclip, TriangleAlert, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { focusRing } from "@/lib/styles";
import type { ExpenseAttachmentMeta } from "@/lib/expenses/types";

/**
 * Client-side pre-check only — the SERVER is the validation authority
 * (lib/storage/file-validation.ts): same whitelist + 10 MB limit.
 */
const ACCEPTED_TYPES = [
  "application/pdf",
  "image/jpeg",
  "image/png",
  "image/webp",
];
const ACCEPTED_EXTENSIONS = [".pdf", ".jpg", ".jpeg", ".png", ".webp"];
const MAX_SIZE_BYTES = 10 * 1024 * 1024; // 10 MB
const ACCEPT_ATTR = ".pdf,.jpg,.jpeg,.png,.webp";

/** MIME when the browser reports one; extension as fallback (e.g. Windows). */
function isAcceptedFile(file: File): boolean {
  if (file.type) return ACCEPTED_TYPES.includes(file.type);
  const dot = file.name.lastIndexOf(".");
  const ext = dot >= 0 ? file.name.slice(dot).toLowerCase() : "";
  return ACCEPTED_EXTENSIONS.includes(ext);
}

function formatMb(bytes: number): string {
  return (bytes / (1024 * 1024)).toFixed(1).replace(".", ",");
}

export interface ExpenseAttachmentFieldProps {
  value: ExpenseAttachmentMeta | null;
  /** Metadata + the File itself (null when cleared). */
  onChange: (value: { meta: ExpenseAttachmentMeta; file: File } | null) => void;
  /**
   * Storage not configured: show an honest warning instead of the file input.
   * Attachments are never faked.
   */
  unavailable?: boolean;
  /**
   * The shown value is already persisted on the server. There is no remove
   * action in the MVP, so offer "Substituir" instead of a remove button —
   * pretending to remove it would be dishonest (it would reappear on reload).
   */
  persisted?: boolean;
}

/**
 * Comprovante (receipt) picker for the expense form. Validates type and size
 * as a pre-flight; the selected File is handed to the caller, which uploads
 * it via the attachReceipt/replaceReceipt server actions (db mode) or keeps
 * the metadata locally (demo mode).
 */
export function ExpenseAttachmentField({
  value,
  onChange,
  unavailable = false,
  persisted = false,
}: ExpenseAttachmentFieldProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [error, setError] = useState<string | null>(null);
  const inputId = useId();

  if (unavailable) {
    return (
      <div>
        <span className="mb-1 block text-xs font-semibold text-medium">
          Comprovante
        </span>
        <p className="flex items-center gap-2 rounded-md border border-warning/30 bg-warning-soft px-3 py-2 text-xs font-medium text-warning">
          <TriangleAlert aria-hidden="true" className="size-4 shrink-0" />
          Anexos indisponíveis: storage não configurado.
        </p>
      </div>
    );
  }

  function handleFiles(files: FileList | null) {
    const file = files?.[0];
    if (!file) return;

    if (!isAcceptedFile(file)) {
      setError("Formato não aceito. Use PDF, JPG, PNG ou WEBP.");
      return;
    }
    if (file.size > MAX_SIZE_BYTES) {
      setError(`Arquivo com ${formatMb(file.size)} MB excede o limite de 10 MB.`);
      return;
    }

    setError(null);
    onChange({
      meta: {
        fileName: file.name,
        contentType: file.type || "application/octet-stream",
        size: file.size,
      },
      file,
    });
  }

  function clearAttachment() {
    setError(null);
    onChange(null);
    if (inputRef.current) inputRef.current.value = "";
  }

  return (
    <div>
      <span className="mb-1 block text-xs font-semibold text-medium">
        Comprovante{" "}
        <span className="font-normal text-soft">
          (PDF, JPG, PNG ou WEBP, até 10 MB)
        </span>
      </span>

      {value ? (
        <div className="flex items-center gap-3 rounded-md border border-border bg-surface-muted/50 px-3 py-2">
          <FileText aria-hidden="true" className="size-4 shrink-0 text-medium" />
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-medium text-strong">
              {value.fileName}
            </p>
            <p className="text-xs text-soft">
              {Math.max(1, Math.round(value.size / 1024))} KB ·{" "}
              {value.contentType}
            </p>
          </div>
          {persisted ? (
            <label
              htmlFor={inputId}
              className={cn(
                "shrink-0 cursor-pointer rounded-md px-2 py-1 text-xs font-semibold text-brand transition-colors hover:bg-surface",
                focusRing,
              )}
            >
              Substituir
            </label>
          ) : (
            <button
              type="button"
              onClick={clearAttachment}
              aria-label="Remover comprovante"
              className={cn(
                "grid size-7 shrink-0 place-items-center rounded-md text-medium transition-colors hover:bg-surface hover:text-strong",
                focusRing,
              )}
            >
              <X aria-hidden="true" className="size-4" />
            </button>
          )}
        </div>
      ) : (
        <label
          htmlFor={inputId}
          className={cn(
            "flex cursor-pointer items-center gap-2 rounded-md border border-dashed border-border bg-surface px-3 py-2.5 text-sm text-medium transition-colors hover:border-brand hover:text-strong",
            focusRing,
          )}
        >
          <Paperclip aria-hidden="true" className="size-4" />
          Anexar comprovante
        </label>
      )}

      <input
        ref={inputRef}
        id={inputId}
        type="file"
        accept={ACCEPT_ATTR}
        className="sr-only"
        onChange={(e) => handleFiles(e.target.files)}
      />

      {error ? (
        <p role="alert" className="mt-1 text-xs font-medium text-danger">
          {error}
        </p>
      ) : null}
    </div>
  );
}
