"use client";

import { useRef, useState, useTransition } from "react";
import { Upload } from "lucide-react";
import { ActionButton } from "@/components/ui/ActionButton";
import { FeedbackBanner, type FeedbackMessage } from "@/components/ui/Feedback";
import { focusRingInput } from "@/lib/styles";
import { cn } from "@/lib/utils";
import {
  ACCEPTED_INVOICE_MIME_TYPES,
  validateInvoiceFile,
} from "@/lib/storage/file-validation";
import { uploadConsultantInvoice } from "@/app/app/pagamentos/invoice.actions";

export interface InvoiceUploadFormProps {
  paymentId: string;
  /** Prefills the "valor da NF" field (e.g. the expected amount). */
  defaultAmount?: number | null;
  /** Disables the whole form (e.g. demo mode). */
  disabled?: boolean;
  /**
   * Called after a successful/failed upload so a parent panel can raise its own
   * toast. The server action already `revalidatePath`s, so the list refreshes
   * on its own — this is only for the feedback message.
   */
  onResult?: (ok: boolean, message: string) => void;
  className?: string;
}

/**
 * Shared NF upload form (melhoria #3). Used by the consultant self-service
 * screen and by the finance panel (Financeiro may attach on any payment). The
 * server (`uploadConsultantInvoice`) is the validation authority and resolves
 * ownership from the logged-in user; the client-side check here is a pre-flight
 * convenience only.
 */
export function InvoiceUploadForm({
  paymentId,
  defaultAmount,
  disabled = false,
  onResult,
  className,
}: InvoiceUploadFormProps) {
  const [isPending, startTransition] = useTransition();
  const [fileName, setFileName] = useState<string | null>(null);
  const [amount, setAmount] = useState(
    defaultAmount != null ? String(defaultAmount).replace(".", ",") : "",
  );
  const [message, setMessage] = useState<FeedbackMessage | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  function report(tone: FeedbackMessage["tone"], text: string, ok: boolean) {
    setMessage({ tone, text });
    onResult?.(ok, text);
  }

  function submit() {
    const input = fileInputRef.current;
    const file = input?.files?.[0];
    if (!file) {
      report("warning", "Selecione o arquivo da NF (PDF, XML ou imagem).", false);
      return;
    }
    // Pre-flight (the server re-validates authoritatively).
    const invalid = validateInvoiceFile({
      name: file.name,
      type: file.type,
      size: file.size,
    });
    if (invalid) {
      report("warning", invalid.message, false);
      return;
    }

    const formData = new FormData();
    formData.set("paymentId", paymentId);
    formData.set("file", file);
    if (amount.trim()) formData.set("invoiceAmount", amount.trim());

    startTransition(async () => {
      const result = await uploadConsultantInvoice(formData);
      if (result.ok) {
        report("success", `NF "${result.data.fileName}" anexada.`, true);
        setFileName(null);
        setAmount("");
        if (input) input.value = "";
      } else {
        report("warning", result.message, false);
      }
    });
  }

  const fieldId = `invoice-amount-${paymentId}`;
  const fileId = `invoice-file-${paymentId}`;

  return (
    <div className={cn("space-y-3", className)}>
      <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_10rem_auto] sm:items-end">
        <label htmlFor={fileId} className="text-sm font-medium text-medium">
          Arquivo da NF
          <input
            ref={fileInputRef}
            id={fileId}
            type="file"
            accept={ACCEPTED_INVOICE_MIME_TYPES.join(",")}
            disabled={disabled || isPending}
            onChange={(event) =>
              setFileName(event.target.files?.[0]?.name ?? null)
            }
            className={cn(
              "mt-1 block w-full rounded-md border border-border bg-surface px-3 py-2 text-sm text-strong file:mr-3 file:rounded-md file:border-0 file:bg-surface-muted file:px-3 file:py-1 file:text-xs file:font-semibold file:text-strong disabled:opacity-50",
              focusRingInput,
            )}
          />
          <span className="mt-1 block text-xs text-soft">
            PDF, XML, JPG, PNG ou WEBP — até 10 MB.
          </span>
        </label>
        <label htmlFor={fieldId} className="text-sm font-medium text-medium">
          Valor da NF (R$)
          <input
            id={fieldId}
            type="text"
            inputMode="decimal"
            placeholder="0,00"
            value={amount}
            disabled={disabled || isPending}
            onChange={(event) => setAmount(event.target.value)}
            className={cn(
              "mt-1 h-10 w-full rounded-md border border-border bg-surface px-3 text-sm tabular-nums text-strong disabled:opacity-50",
              focusRingInput,
            )}
          />
        </label>
        <ActionButton
          size="md"
          variant="primary"
          icon={Upload}
          disabled={disabled || isPending || !fileName}
          onClick={submit}
        >
          {isPending ? "Enviando…" : "Anexar NF"}
        </ActionButton>
      </div>
      <FeedbackBanner message={message} />
    </div>
  );
}
