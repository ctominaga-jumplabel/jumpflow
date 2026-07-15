import { StatusBadge, type StatusTone } from "@/components/ui/StatusBadge";
import type { ProjectStatus } from "@/lib/projects/types";

type SupportedProjectStatus = ProjectStatus | "PLANNED" | "ON_HOLD";

export const projectStatusLabels: Record<SupportedProjectStatus, string> = {
  PROPOSAL: "Proposta",
  ACTIVE: "Ativo",
  PLANNED: "Planejado",
  ON_HOLD: "Em espera",
  PAUSED: "Pausado",
  CLOSED: "Encerrado",
  CANCELLED: "Cancelado",
};

const toneByStatus: Record<SupportedProjectStatus, StatusTone> = {
  PROPOSAL: "info",
  ACTIVE: "success",
  PLANNED: "info",
  ON_HOLD: "warning",
  PAUSED: "warning",
  CLOSED: "neutral",
  CANCELLED: "danger",
};

export interface ProjectStatusBadgeProps {
  status: SupportedProjectStatus;
}

/** Status pill for a project. */
export function ProjectStatusBadge({ status }: ProjectStatusBadgeProps) {
  return (
    <StatusBadge tone={toneByStatus[status]}>
      {projectStatusLabels[status]}
    </StatusBadge>
  );
}
