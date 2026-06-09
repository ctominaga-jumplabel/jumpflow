/**
 * Mocked certificates for the MVP "Certificados" module.
 *
 * NOTE: not connected to the database yet. Shapes mirror `Certificate` in
 * docs/modelo-dados.md. Expiry status is derived purely from a reference date
 * so the list highlights expired / soon-to-expire credentials.
 */

export type CertificateExpiry = "VALID" | "EXPIRING" | "EXPIRED" | "NO_EXPIRY";

export const certificateExpiryLabels: Record<CertificateExpiry, string> = {
  VALID: "Vigente",
  EXPIRING: "Vence em breve",
  EXPIRED: "Vencido",
  NO_EXPIRY: "Sem validade",
};

export interface Certificate {
  id: string;
  consultantId: string;
  consultantName: string;
  name: string;
  issuer: string;
  issuedAt: string; // ISO yyyy-mm-dd
  expiresAt: string | null;
}

/** Reference "today" for the mocked module (matches the demo data window). */
export const TODAY = "2026-06-09";

/** Window (days) before expiry where a certificate counts as "expiring". */
export const EXPIRING_WINDOW_DAYS = 60;

export const certificates: Certificate[] = [
  {
    id: "cert-1",
    consultantId: "con-bruno",
    consultantName: "Bruno Lima",
    name: "AWS Solutions Architect – Associate",
    issuer: "Amazon Web Services",
    issuedAt: "2023-07-01",
    expiresAt: "2026-07-01",
  },
  {
    id: "cert-2",
    consultantId: "con-helena",
    consultantName: "Helena Costa",
    name: "AWS Solutions Architect – Professional",
    issuer: "Amazon Web Services",
    issuedAt: "2024-02-15",
    expiresAt: "2027-02-15",
  },
  {
    id: "cert-3",
    consultantId: "con-helena",
    consultantName: "Helena Costa",
    name: "Azure Administrator Associate",
    issuer: "Microsoft",
    issuedAt: "2023-05-20",
    expiresAt: "2026-05-20",
  },
  {
    id: "cert-4",
    consultantId: "con-marina",
    consultantName: "Marina Alves",
    name: "Databricks Data Engineer Associate",
    issuer: "Databricks",
    issuedAt: "2025-03-10",
    expiresAt: "2027-03-10",
  },
  {
    id: "cert-5",
    consultantId: "con-rafael",
    consultantName: "Rafael Moreira",
    name: "TensorFlow Developer Certificate",
    issuer: "Google",
    issuedAt: "2024-06-25",
    expiresAt: "2026-06-25",
  },
  {
    id: "cert-6",
    consultantId: "con-carlos",
    consultantName: "Carlos Nunes",
    name: "Scrum Foundation Professional",
    issuer: "CertiProf",
    issuedAt: "2022-11-01",
    expiresAt: null,
  },
];

/** Whole days between two ISO dates (b − a). Negative if b is before a. */
export function daysBetween(aIso: string, bIso: string): number {
  const a = Date.parse(`${aIso}T00:00:00Z`);
  const b = Date.parse(`${bIso}T00:00:00Z`);
  return Math.round((b - a) / 86_400_000);
}

/** Derive the expiry status of a certificate relative to a reference date. */
export function expiryStatus(
  cert: Certificate,
  referenceIso: string = TODAY,
): CertificateExpiry {
  if (!cert.expiresAt) return "NO_EXPIRY";
  const remaining = daysBetween(referenceIso, cert.expiresAt);
  if (remaining < 0) return "EXPIRED";
  if (remaining <= EXPIRING_WINDOW_DAYS) return "EXPIRING";
  return "VALID";
}

export interface CertificateSummaryCounts {
  total: number;
  valid: number;
  expiring: number;
  expired: number;
}

/** Aggregate counts for the certificate summary cards. */
export function summarizeCertificates(
  list: Certificate[],
  referenceIso: string = TODAY,
): CertificateSummaryCounts {
  const counts = { total: list.length, valid: 0, expiring: 0, expired: 0 };
  for (const cert of list) {
    const status = expiryStatus(cert, referenceIso);
    if (status === "EXPIRED") counts.expired += 1;
    else if (status === "EXPIRING") counts.expiring += 1;
    else counts.valid += 1; // VALID + NO_EXPIRY both count as non-alerting
  }
  return counts;
}

/**
 * Sort certificates so the most urgent (expired, then expiring soonest) come
 * first; no-expiry credentials sink to the bottom.
 */
export function sortByUrgency(
  list: Certificate[],
  referenceIso: string = TODAY,
): Certificate[] {
  const rank: Record<CertificateExpiry, number> = {
    EXPIRED: 0,
    EXPIRING: 1,
    VALID: 2,
    NO_EXPIRY: 3,
  };
  return [...list].sort((a, b) => {
    const ra = rank[expiryStatus(a, referenceIso)];
    const rb = rank[expiryStatus(b, referenceIso)];
    if (ra !== rb) return ra - rb;
    // Within the same bucket, soonest expiry first.
    const ea = a.expiresAt ? Date.parse(a.expiresAt) : Number.MAX_SAFE_INTEGER;
    const eb = b.expiresAt ? Date.parse(b.expiresAt) : Number.MAX_SAFE_INTEGER;
    return ea - eb;
  });
}
