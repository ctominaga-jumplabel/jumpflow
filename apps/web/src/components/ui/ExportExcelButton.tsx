import { Download } from "lucide-react";
import { cn } from "@/lib/utils";
import { focusRing } from "@/lib/styles";

/**
 * Reusable "Exportar Excel" link (Onda 6). A plain styled `<a download>` that
 * points at a role-gated `.xlsx` route handler already carrying the current
 * screen filter in its querystring. The route re-checks RBAC, reapplies the
 * filter and masks any financial column the caller may not see — this button is
 * pure UI and never decides visibility on its own.
 *
 * Callers hide it in demo/no-database mode (there is nothing real to export):
 * render it only when a database-backed `href` is available.
 */
export interface ExportExcelButtonProps {
  /** `.xlsx` route href with the current filter as a querystring. */
  href: string;
  /** Optional label override (defaults to "Exportar Excel"). */
  label?: string;
  className?: string;
}

export function ExportExcelButton({
  href,
  label = "Exportar Excel",
  className,
}: ExportExcelButtonProps) {
  return (
    <a
      href={href}
      className={cn(
        "inline-flex h-8 items-center gap-1.5 rounded-md border border-border bg-surface px-3 text-xs font-semibold text-medium hover:bg-surface-muted",
        focusRing,
        className,
      )}
    >
      <Download aria-hidden="true" className="size-3.5" />
      {label}
    </a>
  );
}
