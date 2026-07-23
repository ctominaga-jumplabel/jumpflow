"use client";

import type { LucideIcon } from "lucide-react";
import { ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";

export interface CollapsibleGroupProps {
  title: string;
  icon?: LucideIcon;
  /** Optional right-aligned hint (e.g. "Somente leitura"). */
  hint?: string;
  /** Start expanded. Defaults to false (collapsed). */
  defaultOpen?: boolean;
  children: React.ReactNode;
  className?: string;
}

/**
 * A disclosure group: a bordered band whose header toggles the body open/closed.
 * Built on native `<details>/<summary>` (same pattern as the report/timesheet
 * filter panels) so it works without JS and stays accessible. Used to fold the
 * consultant registration into permissioned groups (M1).
 */
export function CollapsibleGroup({
  title,
  icon: Icon,
  hint,
  defaultOpen = false,
  children,
  className,
}: CollapsibleGroupProps) {
  return (
    <details
      open={defaultOpen}
      className={cn(
        "group overflow-hidden rounded-md border-2 border-ink bg-surface [&_summary::-webkit-details-marker]:hidden",
        className,
      )}
    >
      <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-4 py-3 hover:bg-surface-muted/60">
        <span className="flex min-w-0 items-center gap-2 text-sm font-semibold text-strong">
          {Icon ? <Icon aria-hidden="true" className="size-4 shrink-0" /> : null}
          <span className="truncate">{title}</span>
        </span>
        <span className="flex shrink-0 items-center gap-2">
          {hint ? <span className="text-xs text-soft">{hint}</span> : null}
          <ChevronDown
            aria-hidden="true"
            className="size-4 text-medium transition-transform group-open:rotate-180"
          />
        </span>
      </summary>
      <div className="space-y-4 border-t-2 border-ink px-4 py-4">{children}</div>
    </details>
  );
}
