import type { ClientStatus } from "@/lib/clients/types";
import { cn } from "@/lib/utils";

const labels: Record<ClientStatus, string> = {
  ACTIVE: "Ativo",
  INACTIVE: "Inativo",
};

export function ClientStatusBadge({ status }: { status: ClientStatus }) {
  return (
    <span
      className={cn(
        "inline-flex rounded-full px-2 py-1 text-xs font-semibold",
        status === "ACTIVE"
          ? "bg-success-soft text-success"
          : "bg-surface-muted text-soft",
      )}
    >
      {labels[status]}
    </span>
  );
}
