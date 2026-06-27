import { Ban } from "lucide-react";

export interface FeedTombstoneProps {
  /** Label resolved on the server (`tombstoneLabel`). */
  label: string;
  /** Compact variant for comments (smaller padding/type). */
  compact?: boolean;
}

/**
 * Placeholder for removed/deleted content. NEVER exposes the original body —
 * the server already stripped it; this only renders the neutral label so the
 * thread keeps its shape.
 */
export function FeedTombstone({ label, compact = false }: FeedTombstoneProps) {
  return (
    <p
      className={
        compact
          ? "flex items-center gap-2 rounded-md border border-dashed border-border bg-surface-muted/40 px-3 py-2 text-xs italic text-soft"
          : "flex items-center gap-2 rounded-md border border-dashed border-border bg-surface-muted/40 px-3 py-2.5 text-sm italic text-soft"
      }
    >
      <Ban aria-hidden="true" className="size-4 shrink-0" />
      {label || "Conteúdo removido."}
    </p>
  );
}
