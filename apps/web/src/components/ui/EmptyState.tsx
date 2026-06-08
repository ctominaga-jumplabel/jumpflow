import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

export interface EmptyStateProps {
  icon: LucideIcon;
  title: string;
  description?: string;
  /** Optional action area (e.g. a primary button). */
  action?: ReactNode;
  className?: string;
}

/** Neutral placeholder for screens or panels without data yet. */
export function EmptyState({
  icon: Icon,
  title,
  description,
  action,
  className,
}: EmptyStateProps) {
  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center rounded-[var(--radius-card)] border border-dashed border-border bg-surface px-6 py-14 text-center",
        className,
      )}
    >
      <span className="grid size-12 place-items-center rounded-full bg-surface-muted text-medium">
        <Icon aria-hidden="true" className="size-6" />
      </span>
      <h3 className="mt-4 text-base font-semibold text-strong">{title}</h3>
      {description ? (
        <p className="mt-1.5 max-w-md text-sm leading-6 text-medium">
          {description}
        </p>
      ) : null}
      {action ? <div className="mt-5">{action}</div> : null}
    </div>
  );
}
