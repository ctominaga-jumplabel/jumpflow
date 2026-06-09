import { StatusBadge, type StatusTone } from "@/components/ui/StatusBadge";
import {
  projectStatusLabels,
  type ProjectStatus,
} from "@/lib/mock-data/projects";

const toneByStatus: Record<ProjectStatus, StatusTone> = {
  ACTIVE: "success",
  PLANNED: "info",
  ON_HOLD: "warning",
  CLOSED: "neutral",
};

export interface ProjectStatusBadgeProps {
  status: ProjectStatus;
}

/** Status pill for a project. */
export function ProjectStatusBadge({ status }: ProjectStatusBadgeProps) {
  return (
    <StatusBadge tone={toneByStatus[status]}>
      {projectStatusLabels[status]}
    </StatusBadge>
  );
}
