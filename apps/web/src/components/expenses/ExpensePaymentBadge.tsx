import { StatusBadge, type StatusTone } from "@/components/ui/StatusBadge";
import {
  expensePaymentStatusLabels,
  type ExpensePaymentStatus,
} from "@/lib/mock-data/expenses";

const toneByStatus: Record<ExpensePaymentStatus, StatusTone> = {
  NOT_SCHEDULED: "neutral",
  SCHEDULED: "warning",
  PAID: "success",
  CANCELLED: "danger",
};

export interface ExpensePaymentBadgeProps {
  status: ExpensePaymentStatus;
}

/** Payment-status pill for an expense (managed by financial roles). */
export function ExpensePaymentBadge({ status }: ExpensePaymentBadgeProps) {
  return (
    <StatusBadge tone={toneByStatus[status]}>
      {expensePaymentStatusLabels[status]}
    </StatusBadge>
  );
}
