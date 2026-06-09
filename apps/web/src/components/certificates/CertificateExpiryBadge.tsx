import { StatusBadge, type StatusTone } from "@/components/ui/StatusBadge";
import {
  certificateExpiryLabels,
  expiryStatus,
  TODAY,
  type Certificate,
  type CertificateExpiry,
} from "@/lib/mock-data/certificates";

const toneByExpiry: Record<CertificateExpiry, StatusTone> = {
  VALID: "success",
  EXPIRING: "warning",
  EXPIRED: "danger",
  NO_EXPIRY: "neutral",
};

export interface CertificateExpiryBadgeProps {
  certificate: Certificate;
  referenceIso?: string;
}

/** Pill that conveys the certificate's validity relative to today. */
export function CertificateExpiryBadge({
  certificate,
  referenceIso = TODAY,
}: CertificateExpiryBadgeProps) {
  const status = expiryStatus(certificate, referenceIso);
  return (
    <StatusBadge tone={toneByExpiry[status]} strong={status === "EXPIRED"}>
      {certificateExpiryLabels[status]}
    </StatusBadge>
  );
}
