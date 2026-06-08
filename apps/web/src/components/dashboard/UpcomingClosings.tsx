import { CalendarClock } from "lucide-react";
import {
  upcomingClosings,
  type UpcomingClosing,
} from "@/lib/mock-data/dashboard";
import { StatusBadge, type StatusTone } from "@/components/ui/StatusBadge";
import { SectionPanel } from "./SectionPanel";

const statusMeta: Record<
  UpcomingClosing["status"],
  { label: string; tone: StatusTone }
> = {
  open: { label: "Aberto", tone: "neutral" },
  review: { label: "Em revisão", tone: "warning" },
  ready: { label: "Pronto", tone: "success" },
};

/** Upcoming monthly closings per client/project. */
export function UpcomingClosings() {
  return (
    <SectionPanel
      title="Próximos fechamentos"
      description="Fechamento mensal por cliente e projeto."
    >
      <ul className="divide-y divide-border">
        {upcomingClosings.map((closing) => {
          const meta = statusMeta[closing.status];
          return (
            <li
              key={closing.id}
              className="flex items-center gap-3 px-5 py-3.5"
            >
              <span className="grid size-8 shrink-0 place-items-center rounded-md bg-surface-muted text-medium">
                <CalendarClock aria-hidden="true" className="size-4" />
              </span>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium text-strong">
                  {closing.client} · {closing.project}
                </p>
                <p className="text-xs text-soft">
                  {closing.period} · {closing.approvedHours} aprovadas
                </p>
              </div>
              <StatusBadge tone={meta.tone}>{meta.label}</StatusBadge>
            </li>
          );
        })}
      </ul>
    </SectionPanel>
  );
}
