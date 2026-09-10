import { cn } from "@/lib/utils";
import { focusRing } from "@/lib/styles";

export interface FilterChipProps {
  label: string;
  active?: boolean;
  /** Optional count shown after the label (e.g. "Ativos 3"). */
  count?: number;
  onClick?: () => void;
  /**
   * Acabamento Playful Ops no estado ativo (marcador amarelo + borda ink +
   * sombra dura). `false` entrega o chip plano da direção Operational Minimal,
   * onde o ativo é marcado por preenchimento suave e borda de acento. Default
   * `true` — os consumidores existentes não mudam.
   */
  tactile?: boolean;
}

/**
 * Toggleable filter chip used in DataToolbar. Active state gets the Playful Ops
 * ink border + small hard shadow; inactive stays on the soft line so a row of
 * chips reads calmly. Render inside a client component (uses onClick).
 */
export function FilterChip({
  label,
  active = false,
  count,
  onClick,
  tactile = true,
}: FilterChipProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={cn(
        "inline-flex items-center gap-1.5 border px-3 py-1.5 text-xs font-semibold transition-[transform,box-shadow,background-color] duration-150",
        focusRing,
        tactile ? "rounded-md" : "rounded-full",
        active
          ? tactile
            ? "border-2 border-on-accent bg-marker text-on-accent shadow-[2px_2px_0_0_var(--color-ink)]"
            : "border-ops-accent-ink bg-ops-accent-soft text-ops-accent-ink"
          : "border-border bg-surface text-medium hover:bg-surface-muted",
      )}
    >
      {label}
      {typeof count === "number" ? (
        <span
          className={cn(
            "tabular-nums",
            active && tactile ? "text-ink/70" : active ? "" : "text-soft",
          )}
        >
          {count}
        </span>
      ) : null}
    </button>
  );
}
