import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

export interface DataTableColumn<T> {
  /** Stable column key. */
  key: string;
  /** Header label. */
  header: ReactNode;
  /** Cell renderer for a row. */
  cell: (row: T) => ReactNode;
  align?: "left" | "right" | "center";
  /** Optional className applied to header + cells (e.g. width, hide on mobile). */
  className?: string;
}

export interface DataTableProps<T> {
  columns: DataTableColumn<T>[];
  rows: T[];
  rowKey: (row: T) => string;
  /** Rendered when there are no rows. */
  empty?: ReactNode;
  /** Optional caption for screen readers. */
  caption?: string;
  className?: string;
}

const alignClass = {
  left: "text-left",
  right: "text-right",
  center: "text-center",
} as const;

/**
 * Simple dense table for operational lists. Soft 1px row dividers (not
 * brutalist borders) keep large lists scannable per the design system. Place
 * inside a SectionPanel for a framed container.
 */
export function DataTable<T>({
  columns,
  rows,
  rowKey,
  empty,
  caption,
  className,
}: DataTableProps<T>) {
  if (rows.length === 0) {
    return (
      <div className="px-5 py-10">
        {empty ?? (
          <p className="text-center text-sm text-soft">
            Nenhum registro para exibir.
          </p>
        )}
      </div>
    );
  }

  return (
    <div className={cn("overflow-x-auto", className)}>
      <table className="w-full border-collapse text-sm">
        {caption ? <caption className="sr-only">{caption}</caption> : null}
        <thead>
          <tr className="border-b border-border">
            {columns.map((col) => (
              <th
                key={col.key}
                scope="col"
                className={cn(
                  "px-5 py-3 text-xs font-semibold uppercase tracking-wide text-soft",
                  alignClass[col.align ?? "left"],
                  col.className,
                )}
              >
                {col.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-border">
          {rows.map((row) => (
            <tr
              key={rowKey(row)}
              className="transition-colors hover:bg-surface-muted/60"
            >
              {columns.map((col) => (
                <td
                  key={col.key}
                  className={cn(
                    "px-5 py-3 align-middle text-medium",
                    alignClass[col.align ?? "left"],
                    col.className,
                  )}
                >
                  {col.cell(row)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
