import { StatusBadge } from "@/components/ui/StatusBadge";
import {
  expenseStatusLabels,
  expenseStatusTones,
  type ExpenseStatus,
} from "@/lib/expenses/types";

export interface ExpenseStatusBadgeProps {
  status: ExpenseStatus;
  /** Use the high-emphasis label look (e.g. detail header). */
  strong?: boolean;
}

/**
 * Status pill for an expense. The single chain covers approval AND payment
 * (DRAFT → … → PAID), so this badge replaced the old separate payment badge.
 */
export function ExpenseStatusBadge({ status, strong }: ExpenseStatusBadgeProps) {
  return (
    <StatusBadge tone={expenseStatusTones[status]} strong={strong}>
      {expenseStatusLabels[status]}
    </StatusBadge>
  );
}
