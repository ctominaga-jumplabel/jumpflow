import { cn } from "@/lib/utils";

export interface StatTileProps {
  label: string;
  value: string;
  hint?: string;
  /** Warning tone for "pending / not entering the closing" figures. */
  tone?: "default" | "warning";
  className?: string;
}

/**
 * Compact KPI tile for report totals. A plain server component (no motion) so
 * it can be rendered inside server report tables. Warning tone signals figures
 * that do NOT enter the closing.
 */
export function StatTile({
  label,
  value,
  hint,
  tone = "default",
  className,
}: StatTileProps) {
  return (
    <div
      className={cn(
        "rounded-[var(--radius-card)] border-2 border-ink bg-surface p-4 shadow-[4px_4px_0_0_var(--color-ink)]",
        tone === "warning" && "bg-warning-soft",
        className,
      )}
    >
      <p className="text-xs font-semibold uppercase tracking-wide text-soft">
        {label}
      </p>
      <p
        className={cn(
          "mt-1 text-2xl font-semibold tracking-tight tabular-nums text-strong",
          tone === "warning" && "text-warning",
        )}
      >
        {value}
      </p>
      {hint ? <p className="mt-1 text-xs text-soft">{hint}</p> : null}
    </div>
  );
}
