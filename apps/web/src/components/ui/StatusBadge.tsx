import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

export type StatusTone =
  | "neutral"
  | "info"
  | "success"
  | "warning"
  | "danger";

const toneStyles: Record<StatusTone, string> = {
  neutral: "border-ink/15 bg-surface-muted text-medium",
  info: "border-brand/30 bg-brand-soft text-brand-dark",
  success: "border-success/30 bg-success-soft text-success",
  warning: "border-warning/30 bg-warning-soft text-warning",
  danger: "border-danger/30 bg-danger-soft text-danger",
};

export interface StatusBadgeProps {
  tone?: StatusTone;
  /**
   * High-emphasis "label" look (ink border + hard shadow). Use for status that
   * must stand out (e.g. approval outcomes); keep off for dense table rows.
   */
  strong?: boolean;
  /**
   * Forma de pílula (`rounded-full`) em vez do retângulo arredondado padrão.
   * Usada pela direção Operational Minimal, onde a etiqueta de situação é
   * pílula. Puramente visual — o tom e o texto não mudam.
   */
  pill?: boolean;
  /**
   * Optional leading icon. Status must never rely on color alone (WCAG 1.4.1):
   * the badge text already carries the meaning, and an icon can reinforce it.
   * Purely additive — existing consumers that pass icons inside `children`
   * keep working unchanged.
   */
  icon?: ReactNode;
  children: ReactNode;
  className?: string;
}

/** Compact status pill ("tag") used across tables, lists and KPIs. */
export function StatusBadge({
  tone = "neutral",
  strong = false,
  pill = false,
  icon,
  children,
  className,
}: StatusBadgeProps) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 border px-2 py-0.5 text-xs font-semibold",
        pill ? "rounded-full px-2.5" : "rounded-md",
        toneStyles[tone],
        strong &&
          "border-2 border-ink shadow-[2px_2px_0_0_var(--color-ink)]",
        className,
      )}
    >
      {icon != null ? (
        <span aria-hidden="true" className="inline-flex shrink-0">
          {icon}
        </span>
      ) : null}
      {children}
    </span>
  );
}
