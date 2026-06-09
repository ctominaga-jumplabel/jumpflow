import { cn } from "@/lib/utils";
import { focusRing } from "@/lib/styles";

export interface FilterChipProps {
  label: string;
  active?: boolean;
  /** Optional count shown after the label (e.g. "Ativos 3"). */
  count?: number;
  onClick?: () => void;
}

/**
 * Toggleable filter chip used in DataToolbar. Active state gets the Playful Ops
 * ink border + small hard shadow; inactive stays on the soft line so a row of
 * chips reads calmly. Render inside a client component (uses onClick).
 */
export function FilterChip({ label, active = false, count, onClick }: FilterChipProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={cn(
        "inline-flex items-center gap-1.5 rounded-md border px-3 py-1.5 text-xs font-semibold transition-[transform,box-shadow,background-color] duration-150",
        focusRing,
        active
          ? "border-2 border-ink bg-marker text-ink shadow-[2px_2px_0_0_var(--color-ink)]"
          : "border-border bg-surface text-medium hover:bg-surface-muted",
      )}
    >
      {label}
      {typeof count === "number" ? (
        <span
          className={cn(
            "tabular-nums",
            active ? "text-ink/70" : "text-soft",
          )}
        >
          {count}
        </span>
      ) : null}
    </button>
  );
}
