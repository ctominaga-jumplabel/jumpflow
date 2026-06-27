"use client";

import { useEffect, useRef } from "react";
import { cn } from "@/lib/utils";
import { focusRing } from "@/lib/styles";
import { FEED_EMOJIS } from "@/lib/feed/types";

export interface EmojiPickerProps {
  /** Emojis the viewer has already reacted with (rendered as active). */
  activeEmojis: ReadonlySet<string>;
  onPick: (emoji: string) => void;
  onClose: () => void;
}

/**
 * Small emoji palette popover anchored above the "add reaction" trigger.
 * Keyboard accessible (arrow-free: it is a row of buttons; Escape closes,
 * clicking outside closes). The palette is a UX curation — the server validates
 * only the emoji's shape.
 */
export function EmojiPicker({ activeEmojis, onPick, onClose }: EmojiPickerProps) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") {
        event.stopPropagation();
        onClose();
      }
    }
    function onClickOutside(event: MouseEvent) {
      if (ref.current && !ref.current.contains(event.target as Node)) {
        onClose();
      }
    }
    document.addEventListener("keydown", onKey);
    document.addEventListener("mousedown", onClickOutside);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("mousedown", onClickOutside);
    };
  }, [onClose]);

  return (
    <div
      ref={ref}
      role="menu"
      aria-label="Escolher reação"
      className="absolute bottom-full left-0 z-20 mb-1 flex gap-0.5 rounded-md border-2 border-ink bg-surface p-1 shadow-[3px_3px_0_0_var(--color-ink)]"
    >
      {FEED_EMOJIS.map(({ emoji, label }) => {
        const active = activeEmojis.has(emoji);
        return (
          <button
            key={emoji}
            type="button"
            role="menuitemcheckbox"
            aria-label={label}
            aria-checked={active}
            onClick={() => onPick(emoji)}
            className={cn(
              "grid size-8 place-items-center rounded text-lg transition-transform hover:-translate-y-px hover:bg-surface-muted",
              active && "bg-brand-soft",
              focusRing,
            )}
          >
            <span aria-hidden="true">{emoji}</span>
          </button>
        );
      })}
    </div>
  );
}
