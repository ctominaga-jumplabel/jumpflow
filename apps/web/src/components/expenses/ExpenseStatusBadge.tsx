import { StatusBadge, type StatusTone } from "@/components/ui/StatusBadge";
import {
  expenseStatusLabels,
  type ExpenseStatus,
} from "@/lib/mock-data/expenses";

const toneByStatus: Record<ExpenseStatus, StatusTone> = {
  DRAFT: "neutral",
  SUBMITTED: "info",
  APPROVED: "success",
  REJECTED: "danger",
  CLOSED: "neutral",
};

export interface ExpenseStatusBadgeProps {
  status: ExpenseStatus;
  /** Use the high-emphasis label look (e.g. detail header). */
  strong?: boolean;
}

/** Approval-status pill for an expense. */
export function ExpenseStatusBadge({ status, strong }: ExpenseStatusBadgeProps) {
  return (
    <StatusBadge tone={toneByStatus[status]} strong={strong}>
      {expenseStatusLabels[status]}
    </StatusBadge>
  );
}
