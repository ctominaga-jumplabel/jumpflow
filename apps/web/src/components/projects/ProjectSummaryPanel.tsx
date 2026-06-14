import { FolderKanban, PlayCircle, Clock4, CheckCircle2 } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import type { ProjectItem } from "@/lib/projects/types";

interface SummaryStat {
  label: string;
  value: number;
  icon: LucideIcon;
  className: string;
}

export interface ProjectSummaryPanelProps {
  projects: ProjectItem[];
}

/**
 * Compact, non-financial summary of the project portfolio. Financial figures
 * (rate/budget) are shown per-row in the list and masked by role — never here.
 */
export function ProjectSummaryPanel({ projects }: ProjectSummaryPanelProps) {
  const stats: SummaryStat[] = [
    {
      label: "Projetos",
      value: projects.length,
      icon: FolderKanban,
      className: "bg-brand-soft text-brand-dark",
    },
    {
      label: "Ativos",
      value: projects.filter((project) => project.status === "ACTIVE").length,
      icon: PlayCircle,
      className: "bg-success-soft text-success",
    },
    {
      label: "Propostas",
      value: projects.filter((project) => project.status === "PROPOSAL").length,
      icon: Clock4,
      className: "bg-warning-soft text-warning",
    },
    {
      label: "Encerrados",
      value: projects.filter((project) => project.status === "CLOSED").length,
      icon: CheckCircle2,
      className: "bg-surface-muted text-medium",
    },
  ];

  return (
    <section
      aria-label="Resumo de projetos"
      className="grid grid-cols-2 gap-4 lg:grid-cols-4"
    >
      {stats.map((stat) => (
        <div
          key={stat.label}
          className="rounded-[var(--radius-card)] border-2 border-ink bg-surface p-4 shadow-[4px_4px_0_0_var(--color-ink)]"
        >
          <div className="flex items-center gap-3">
            <span
              className={`grid size-9 shrink-0 place-items-center rounded-md ${stat.className}`}
            >
              <stat.icon aria-hidden="true" className="size-5" />
            </span>
            <div>
              <p className="text-2xl font-semibold tabular-nums text-strong">
                {stat.value}
              </p>
              <p className="text-xs text-soft">{stat.label}</p>
            </div>
          </div>
        </div>
      ))}
    </section>
  );
}
