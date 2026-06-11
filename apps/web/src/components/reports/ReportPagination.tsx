import { cn } from "@/lib/utils";
import { focusRing } from "@/lib/styles";
import type { PaginationMeta } from "@/lib/reports/types";

export interface ReportPaginationProps {
  pagination: PaginationMeta;
  /** Href for the previous page (clamped to >= 1 by the caller). */
  prevHref: string;
  /** Href for the next page (caller does not clamp the upper bound). */
  nextHref: string;
}

/**
 * Server-rendered pagination footer for the report tables. Renders an "X–Y de
 * N" range and Previous/Next links that preserve the full query string. Links
 * are disabled (inert) at the boundaries. Query string is the source of truth —
 * no client state.
 */
export function ReportPagination({
  pagination,
  prevHref,
  nextHref,
}: ReportPaginationProps) {
  const { total, page, pageSize, totalPages } = pagination;
  if (total === 0) return null;

  const first = (page - 1) * pageSize + 1;
  const last = Math.min(total, page * pageSize);
  const hasPrev = page > 1;
  const hasNext = page < totalPages;

  const linkClass = (enabled: boolean) =>
    cn(
      "inline-flex h-9 min-w-[5rem] items-center justify-center rounded-md border border-border bg-surface px-3 text-xs font-semibold text-medium",
      focusRing,
      enabled
        ? "hover:bg-surface-muted"
        : "pointer-events-none text-soft opacity-50",
    );

  return (
    <nav
      aria-label="Paginação do relatório"
      className="flex flex-wrap items-center justify-between gap-3 border-t border-border px-5 py-3"
    >
      <p className="text-xs text-medium" aria-live="polite">
        <span className="tabular-nums text-strong">
          {first}–{last}
        </span>{" "}
        de <span className="tabular-nums text-strong">{total}</span>
        {totalPages > 1 ? (
          <span className="text-soft">
            {" "}
            · Página {page} de {totalPages}
          </span>
        ) : null}
      </p>
      <div className="flex items-center gap-2">
        <a
          href={hasPrev ? prevHref : undefined}
          className={linkClass(hasPrev)}
          aria-disabled={!hasPrev}
          tabIndex={hasPrev ? undefined : -1}
          rel="prev"
        >
          Anterior
        </a>
        <a
          href={hasNext ? nextHref : undefined}
          className={linkClass(hasNext)}
          aria-disabled={!hasNext}
          tabIndex={hasNext ? undefined : -1}
          rel="next"
        >
          Próxima
        </a>
      </div>
    </nav>
  );
}
