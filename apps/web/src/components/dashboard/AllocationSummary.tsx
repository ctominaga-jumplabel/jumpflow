import { allocationSummary, type AllocationRow } from "@/lib/mock-data/dashboard";
import { StatusBadge, type StatusTone } from "@/components/ui/StatusBadge";
import { SectionPanel } from "./SectionPanel";

const statusMeta: Record<
  AllocationRow["status"],
  { label: string; tone: StatusTone; bar: string }
> = {
  balanced: { label: "Equilibrado", tone: "success", bar: "bg-success" },
  over: { label: "Acima de 100%", tone: "danger", bar: "bg-danger" },
  bench: { label: "Disponível", tone: "info", bar: "bg-brand" },
};

/** Compact allocation overview by consultant. */
export function AllocationSummary() {
  return (
    <SectionPanel
      title="Alocação"
      description="Capacidade utilizada no período corrente."
    >
      <ul className="divide-y divide-border">
        {allocationSummary.map((row) => {
          const meta = statusMeta[row.status];
          return (
            <li key={row.id} className="px-5 py-3.5">
              <div className="flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium text-strong">
                    {row.consultant}
                  </p>
                  <p className="truncate text-xs text-soft">{row.role}</p>
                </div>
                <StatusBadge tone={meta.tone}>{meta.label}</StatusBadge>
              </div>
              <div className="mt-2 flex items-center gap-3">
                <div
                  className="h-1.5 flex-1 overflow-hidden rounded-full bg-surface-muted"
                  role="progressbar"
                  aria-valuenow={row.allocation}
                  aria-valuemin={0}
                  aria-valuemax={100}
                  aria-label={`Alocação de ${row.consultant}`}
                >
                  <div
                    className={`h-full rounded-full ${meta.bar}`}
                    style={{ width: `${Math.min(row.allocation, 100)}%` }}
                  />
                </div>
                <span className="w-12 shrink-0 text-right text-xs font-medium tabular-nums text-medium">
                  {row.allocation}%
                </span>
              </div>
            </li>
          );
        })}
      </ul>
    </SectionPanel>
  );
}
