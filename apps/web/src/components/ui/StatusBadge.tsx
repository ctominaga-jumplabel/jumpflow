import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

export type StatusTone =
  | "neutral"
  | "info"
  | "success"
  | "warning"
  | "danger";

const toneStyles: Record<StatusTone, string> = {
  neutral: "border-border bg-surface-muted text-medium",
  info: "border-brand-soft bg-brand-soft text-brand-dark",
  success: "border-success-soft bg-success-soft text-success",
  warning: "border-warning-soft bg-warning-soft text-warning",
  danger: "border-danger-soft bg-danger-soft text-danger",
};

export interface StatusBadgeProps {
  tone?: StatusTone;
  children: ReactNode;
  className?: string;
}

/** Compact status pill used across tables, lists and KPIs. */
export function StatusBadge({
  tone = "neutral",
  children,
  className,
}: StatusBadgeProps) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-md border px-2 py-0.5 text-xs font-medium",
        toneStyles[tone],
        className,
      )}
    >
      {children}
    </span>
  );
}
