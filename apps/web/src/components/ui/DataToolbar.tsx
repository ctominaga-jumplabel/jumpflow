import type { ReactNode } from "react";
import { Search } from "lucide-react";
import { cn } from "@/lib/utils";
import { focusRingInput } from "@/lib/styles";

export interface DataToolbarSearch {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  /** Accessible label for the search field. */
  label?: string;
}

export interface DataToolbarProps {
  /** Optional search field config (controlled). */
  search?: DataToolbarSearch;
  /** Filter controls (e.g. FilterChip row, selects). */
  filters?: ReactNode;
  /** Primary actions, right-aligned. */
  actions?: ReactNode;
  className?: string;
}

/**
 * Toolbar above data lists/tables: search + filters on the left, actions on
 * the right. Presentational — state lives in the parent client view. Stays on
 * the soft line (not a high-value brutalist container) so lists read calmly.
 */
export function DataToolbar({
  search,
  filters,
  actions,
  className,
}: DataToolbarProps) {
  return (
    <div
      className={cn(
        "flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between",
        className,
      )}
    >
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        {search ? (
          <div className="relative">
            <Search
              aria-hidden="true"
              className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-soft"
            />
            <input
              type="search"
              value={search.value}
              onChange={(e) => search.onChange(e.target.value)}
              placeholder={search.placeholder ?? "Buscar"}
              aria-label={search.label ?? search.placeholder ?? "Buscar"}
              className={cn(
                "h-10 w-full rounded-md border border-border bg-surface pl-9 pr-3 text-sm text-strong placeholder:text-soft sm:w-72",
                focusRingInput,
              )}
            />
          </div>
        ) : null}
        {filters ? (
          <div className="flex flex-wrap items-center gap-2">{filters}</div>
        ) : null}
      </div>
      {actions ? (
        <div className="flex shrink-0 flex-wrap items-center gap-2">
          {actions}
        </div>
      ) : null}
    </div>
  );
}
