import { Sparkles } from "lucide-react";
import { StatusBadge, type StatusTone } from "@/components/ui/StatusBadge";
import {
  approvalStatusLabels,
  type ApprovalStatus,
} from "@/lib/mock-data/approvals";

const toneByStatus: Record<ApprovalStatus, StatusTone> = {
  PENDING: "warning",
  APPROVED: "success",
  REJECTED: "danger",
  AUTO_APPROVED: "info",
};

export interface ApprovalStatusBadgeProps {
  status: ApprovalStatus;
  strong?: boolean;
}

/** Status pill for an approval item; auto-approved gets a spark marker. */
export function ApprovalStatusBadge({ status, strong }: ApprovalStatusBadgeProps) {
  return (
    <StatusBadge tone={toneByStatus[status]} strong={strong}>
      {status === "AUTO_APPROVED" ? (
        <Sparkles aria-hidden="true" className="size-3" />
      ) : null}
      {approvalStatusLabels[status]}
    </StatusBadge>
  );
}
