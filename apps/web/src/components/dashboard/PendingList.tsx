import { ArrowRight, CircleAlert, Info, TriangleAlert } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { pendingItems, type PendingSeverity } from "@/lib/mock-data/dashboard";
import { SectionPanel } from "./SectionPanel";

const severityConfig: Record<
  PendingSeverity,
  { icon: LucideIcon; className: string }
> = {
  danger: { icon: CircleAlert, className: "bg-danger-soft text-danger" },
  warning: { icon: TriangleAlert, className: "bg-warning-soft text-warning" },
  info: { icon: Info, className: "bg-brand-soft text-brand-dark" },
};

/** Operational backlog of pending items requiring attention. */
export function PendingList() {
  return (
    <SectionPanel
      title="Pendências"
      description="Itens que exigem ação dos gestores e do time."
      action={
        <span className="inline-flex items-center gap-1 text-xs font-medium text-brand">
          Ver todas
          <ArrowRight aria-hidden="true" className="size-3.5" />
        </span>
      }
    >
      <ul className="divide-y divide-border">
        {pendingItems.map((item) => {
          const { icon: Icon, className } = severityConfig[item.severity];
          return (
            <li
              key={item.id}
              className="flex items-start gap-3 px-5 py-3.5 transition-colors hover:bg-surface-muted/60"
            >
              <span
                className={`mt-0.5 grid size-8 shrink-0 place-items-center rounded-md ${className}`}
              >
                <Icon aria-hidden="true" className="size-4" />
              </span>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium text-strong">{item.title}</p>
                <p className="mt-0.5 truncate text-xs text-medium">
                  {item.context}
                </p>
              </div>
              <div className="hidden shrink-0 flex-col items-end text-right sm:flex">
                <span className="text-xs font-medium text-medium">
                  {item.owner}
                </span>
                <span className="text-xs text-soft">{item.meta}</span>
              </div>
            </li>
          );
        })}
      </ul>
    </SectionPanel>
  );
}
