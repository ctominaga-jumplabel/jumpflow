import {
  AlertTriangle,
  CheckCircle2,
  CircleDashed,
  Clock,
  MinusCircle,
  TimerOff,
} from "lucide-react";
import { StatusBadge, type StatusTone } from "@/components/ui/StatusBadge";
import { SLA_STATUS_LABEL, type SlaItemStatus } from "@/lib/sla/evaluate";

export const SLA_STATUS_TONE: Record<SlaItemStatus, StatusTone> = {
  ON_TIME_DONE: "success",
  LATE_DONE: "warning",
  PENDING_OK: "info",
  AT_RISK: "warning",
  OVERDUE: "danger",
  NOT_APPLICABLE: "neutral",
};

const ICONS: Record<SlaItemStatus, typeof Clock> = {
  ON_TIME_DONE: CheckCircle2,
  LATE_DONE: TimerOff,
  PENDING_OK: CircleDashed,
  AT_RISK: Clock,
  OVERDUE: AlertTriangle,
  NOT_APPLICABLE: MinusCircle,
};

/** Status do SLA: texto + icone + cor (nunca so cor — WCAG 1.4.1). */
export function SlaStatusBadge({
  status,
  className,
}: {
  status: SlaItemStatus;
  className?: string;
}) {
  const Icon = ICONS[status];
  return (
    <StatusBadge
      tone={SLA_STATUS_TONE[status]}
      pill
      className={className}
      icon={<Icon aria-hidden="true" className="size-3.5" />}
    >
      {SLA_STATUS_LABEL[status]}
    </StatusBadge>
  );
}

/** "faltam N dias úteis" / "vence hoje" / "atrasado N dias úteis". */
export function countdownLabel(input: {
  businessDaysRemaining: number | null;
  businessDaysOverdue: number | null;
}): string {
  if (input.businessDaysOverdue !== null) {
    const n = input.businessDaysOverdue;
    return `atrasado ${n} ${n === 1 ? "dia útil" : "dias úteis"}`;
  }
  const n = input.businessDaysRemaining ?? 0;
  if (n === 0) return "vence hoje";
  return `${n === 1 ? "falta" : "faltam"} ${n} ${n === 1 ? "dia útil" : "dias úteis"}`;
}
