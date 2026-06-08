import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

export interface SectionPanelProps {
  title: string;
  description?: string;
  action?: ReactNode;
  children: ReactNode;
  className?: string;
}

/**
 * Dashboard panel ("band"). Holds lists/tables — not nested cards — to keep
 * the dashboard scannable per the design system.
 */
export function SectionPanel({
  title,
  description,
  action,
  children,
  className,
}: SectionPanelProps) {
  return (
    <section
      className={cn(
        "rounded-[var(--radius-card)] border border-border bg-surface",
        className,
      )}
    >
      <div className="flex items-start justify-between gap-4 border-b border-border px-5 py-4">
        <div className="min-w-0">
          <h2 className="text-sm font-semibold text-strong">{title}</h2>
          {description ? (
            <p className="mt-0.5 text-xs text-soft">{description}</p>
          ) : null}
        </div>
        {action ? <div className="shrink-0">{action}</div> : null}
      </div>
      {children}
    </section>
  );
}
