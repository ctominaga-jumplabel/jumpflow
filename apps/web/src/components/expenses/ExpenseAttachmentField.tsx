"use client";

import { useId, useRef, useState } from "react";
import { FileText, Paperclip, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { focusRing } from "@/lib/styles";
import type { ExpenseAttachment } from "@/lib/mock-data/expenses";

/** Accepted comprovante types and max size, validated client-side. */
const ACCEPTED_TYPES = ["application/pdf", "image/jpeg", "image/png"];
const MAX_SIZE_KB = 5 * 1024; // 5 MB
const ACCEPT_ATTR = ".pdf,.jpg,.jpeg,.png";

export interface ExpenseAttachmentFieldProps {
  value: ExpenseAttachment | null;
  onChange: (value: ExpenseAttachment | null) => void;
}

/**
 * Comprovante (receipt) picker for the expense form. Captures file metadata
 * only — the MVP does not upload bytes anywhere. The field validates type and
 * size so the contract is ready for a real Supabase Storage / Vercel Blob
 * upload later (swap the metadata capture for the upload call).
 */
export function ExpenseAttachmentField({
  value,
  onChange,
}: ExpenseAttachmentFieldProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [error, setError] = useState<string | null>(null);
  const inputId = useId();

  function handleFiles(files: FileList | null) {
    const file = files?.[0];
    if (!file) return;

    if (file.type && !ACCEPTED_TYPES.includes(file.type)) {
      setError("Formato não aceito. Use PDF, JPG ou PNG.");
      return;
    }
    const sizeKb = Math.max(1, Math.round(file.size / 1024));
    if (sizeKb > MAX_SIZE_KB) {
      setError("Arquivo acima de 5 MB.");
      return;
    }

    setError(null);
    onChange({
      name: file.name,
      sizeKb,
      type: file.type || "application/octet-stream",
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
        <span className="font-normal text-soft">(PDF, JPG ou PNG, até 5 MB)</span>
      </span>

      {value ? (
        <div className="flex items-center gap-3 rounded-md border border-border bg-surface-muted/50 px-3 py-2">
          <FileText aria-hidden="true" className="size-4 shrink-0 text-medium" />
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-medium text-strong">
              {value.name}
            </p>
            <p className="text-xs text-soft">
              {value.sizeKb} KB · {value.type}
            </p>
          </div>
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
