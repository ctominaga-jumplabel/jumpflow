"use client";

import { useCallback, useEffect, useId, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { motion, useReducedMotion } from "motion/react";
import { CheckCircle2, Info, TriangleAlert } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { focusRing } from "@/lib/styles";

export type FeedbackTone = "success" | "info" | "warning";

export interface FeedbackMessage {
  tone: FeedbackTone;
  text: string;
}

const toneConfig: Record<FeedbackTone, { icon: LucideIcon; className: string }> =
  {
    success: {
      icon: CheckCircle2,
      className: "border-success/30 bg-success-soft text-success",
    },
    info: { icon: Info, className: "border-brand/30 bg-brand-soft text-brand-dark" },
    warning: {
      icon: TriangleAlert,
      className: "border-warning/30 bg-warning-soft text-warning",
    },
  };

/**
 * Local feedback state for mock/local actions. The MVP does not persist to the
 * database yet, so actions report honestly through an `aria-live` region
 * instead of pretending a server round-trip happened.
 */
export function useFeedback() {
  const [feedback, setFeedback] = useState<FeedbackMessage | null>(null);

  const notify = useCallback((tone: FeedbackTone, text: string) => {
    setFeedback({ tone, text });
  }, []);

  const clear = useCallback(() => setFeedback(null), []);

  return { feedback, notify, clear };
}

export interface FeedbackBannerProps {
  message: FeedbackMessage | null;
  className?: string;
}

const toneTitle: Record<FeedbackTone, string> = {
  success: "Tudo certo",
  info: "Aviso",
  warning: "Atenção",
};

/** Success notices close on their own; info/warning wait for acknowledgement. */
const SUCCESS_AUTO_CLOSE_MS = 3500;

/**
 * Shows the result of an action as a centered alert dialog. An inline banner
 * ended up far from where the user acted on long scrolling pages, so warnings
 * like "Informe uma justificativa..." went unnoticed. `role="alertdialog"` is
 * announced by screen readers when it opens. `notify` creates a new object per
 * call, so repeating the same text re-opens the dialog after a dismissal.
 * `className` is kept for call-site compatibility; nothing renders inline.
 */
export function FeedbackBanner({ message }: FeedbackBannerProps) {
  const [dismissed, setDismissed] = useState<FeedbackMessage | null>(null);
  const close = useCallback(() => setDismissed(message), [message]);

  if (!message || message === dismissed) return null;
  return <FeedbackDialog message={message} onClose={close} />;
}

function FeedbackDialog({
  message,
  onClose,
}: {
  message: FeedbackMessage;
  onClose: () => void;
}) {
  const reduce = useReducedMotion();
  const buttonRef = useRef<HTMLButtonElement>(null);
  const titleId = useId();
  const descId = useId();
  const onCloseRef = useRef(onClose);
  useEffect(() => {
    onCloseRef.current = onClose;
  });

  useEffect(() => {
    const restore = document.activeElement as HTMLElement | null;
    buttonRef.current?.focus();

    // Capture phase on window runs before the document-level handlers of an
    // underlying Modal, so Escape/Tab here never close or move the parent.
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape" || event.key === "Tab") {
        event.preventDefault();
        event.stopPropagation();
        if (event.key === "Escape") onCloseRef.current();
        else buttonRef.current?.focus();
      }
    };
    window.addEventListener("keydown", onKeyDown, true);

    const timer =
      message.tone === "success"
        ? window.setTimeout(() => onCloseRef.current(), SUCCESS_AUTO_CLOSE_MS)
        : undefined;

    return () => {
      window.removeEventListener("keydown", onKeyDown, true);
      window.clearTimeout(timer);
      restore?.focus?.();
    };
  }, [message]);

  if (typeof document === "undefined") return null;

  const { icon: Icon, className: toneClass } = toneConfig[message.tone];

  return createPortal(
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.15 }}
        onClick={onClose}
        className="absolute inset-0 bg-strong/30"
        aria-hidden="true"
      />
      <motion.div
        role="alertdialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={descId}
        initial={reduce ? { opacity: 0 } : { opacity: 0, scale: 0.96, y: 6 }}
        animate={reduce ? { opacity: 1 } : { opacity: 1, scale: 1, y: 0 }}
        transition={{ duration: 0.18, ease: "easeOut" }}
        className="relative z-10 w-full max-w-sm rounded-[var(--radius-card)] border-2 border-ink bg-surface p-5 shadow-[6px_6px_0_0_var(--color-ink)]"
      >
        <div className="flex items-start gap-3">
          <span
            className={cn(
              "grid size-9 shrink-0 place-items-center rounded-full border",
              toneClass,
            )}
          >
            <Icon aria-hidden="true" className="size-5" />
          </span>
          <div className="min-w-0 pt-0.5">
            <h2 id={titleId} className="text-base font-semibold text-strong">
              {toneTitle[message.tone]}
            </h2>
            <p id={descId} className="mt-1 text-sm text-medium">
              {message.text}
            </p>
          </div>
        </div>
        <div className="mt-5 flex justify-end">
          <button
            ref={buttonRef}
            type="button"
            onClick={onClose}
            className={cn(
              "inline-flex h-9 items-center justify-center rounded-md border-2 border-ink bg-brand-fill px-5 text-sm font-semibold text-white shadow-[3px_3px_0_0_var(--color-ink)] transition-[transform,box-shadow] duration-150 active:translate-x-[2px] active:translate-y-[2px] active:shadow-[1px_1px_0_0_var(--color-ink)]",
              focusRing,
            )}
          >
            OK
          </button>
        </div>
      </motion.div>
    </div>,
    document.body,
  );
}
