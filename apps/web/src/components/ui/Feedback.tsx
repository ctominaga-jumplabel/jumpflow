"use client";

import { useCallback, useState } from "react";
import { CheckCircle2, Info, TriangleAlert } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

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

/**
 * Polite live region that announces the result of a local/mock action.
 * Always rendered (even when empty) so screen readers register the live region
 * before the first message arrives.
 */
export function FeedbackBanner({ message, className }: FeedbackBannerProps) {
  return (
    <div aria-live="polite" className={cn("min-h-0", className)}>
      {message ? (
        <div
          className={cn(
            "flex items-center gap-2 rounded-md border px-3 py-2 text-sm font-medium",
            toneConfig[message.tone].className,
          )}
        >
          {(() => {
            const Icon = toneConfig[message.tone].icon;
            return <Icon aria-hidden="true" className="size-4 shrink-0" />;
          })()}
          <span>{message.text}</span>
        </div>
      ) : null}
    </div>
  );
}
