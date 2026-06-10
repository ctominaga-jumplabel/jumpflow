import { StatusBadge, type StatusTone } from "@/components/ui/StatusBadge";
import {
  timeEntryStatusLabels,
  type TimeEntryStatus,
} from "@/lib/timesheet/types";

const toneByStatus: Record<TimeEntryStatus, StatusTone> = {
  DRAFT: "neutral",
  SUBMITTED: "info",
  APPROVED: "success",
  REJECTED: "danger",
  CLOSED: "neutral",
};

export interface TimeEntryStatusBadgeProps {
  status: TimeEntryStatus;
  /** Use the high-emphasis label look (e.g. period header). */
  strong?: boolean;
}

/** Status pill for a time entry / weekly period. */
export function TimeEntryStatusBadge({
  status,
  strong,
}: TimeEntryStatusBadgeProps) {
  return (
    <StatusBadge tone={toneByStatus[status]} strong={strong}>
      {timeEntryStatusLabels[status]}
    </StatusBadge>
  );
}
