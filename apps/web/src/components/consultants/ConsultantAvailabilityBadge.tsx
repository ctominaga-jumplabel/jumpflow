import { StatusBadge, type StatusTone } from "@/components/ui/StatusBadge";
import {
  availabilityFor,
  type Availability,
} from "@/lib/mock-data/consultants";
import { formatPercent } from "@/lib/format";

const meta: Record<Availability, { label: string; tone: StatusTone }> = {
  AVAILABLE: { label: "Disponível", tone: "info" },
  BALANCED: { label: "Equilibrado", tone: "success" },
  FULL: { label: "Quase cheio", tone: "warning" },
  OVER: { label: "Sobrealocado", tone: "danger" },
};

export interface ConsultantAvailabilityBadgeProps {
  allocationPercent: number;
  /** Append the exact percentage (e.g. "Equilibrado · 80%"). */
  showPercent?: boolean;
}

/** Availability pill derived from the consultant's current allocation. */
export function ConsultantAvailabilityBadge({
  allocationPercent,
  showPercent = true,
}: ConsultantAvailabilityBadgeProps) {
  const { label, tone } = meta[availabilityFor(allocationPercent)];
  return (
    <StatusBadge tone={tone}>
      {label}
      {showPercent ? ` · ${formatPercent(allocationPercent)}` : ""}
    </StatusBadge>
  );
}
