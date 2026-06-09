import { Award, BadgeCheck, Clock4, CircleAlert } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import {
  summarizeCertificates,
  TODAY,
  type Certificate,
} from "@/lib/mock-data/certificates";

interface SummaryStat {
  label: string;
  value: number;
  icon: LucideIcon;
  className: string;
}

export interface CertificateSummaryProps {
  certificates: Certificate[];
  referenceIso?: string;
}

/** Summary cards: total, valid, expiring soon and expired certificates. */
export function CertificateSummary({
  certificates,
  referenceIso = TODAY,
}: CertificateSummaryProps) {
  const summary = summarizeCertificates(certificates, referenceIso);
  const stats: SummaryStat[] = [
    {
      label: "Certificados",
      value: summary.total,
      icon: Award,
      className: "bg-brand-soft text-brand-dark",
    },
    {
      label: "Vigentes",
      value: summary.valid,
      icon: BadgeCheck,
      className: "bg-success-soft text-success",
    },
    {
      label: "Vencem em breve",
      value: summary.expiring,
      icon: Clock4,
      className: "bg-warning-soft text-warning",
    },
    {
      label: "Vencidos",
      value: summary.expired,
      icon: CircleAlert,
      className: "bg-danger-soft text-danger",
    },
  ];

  return (
    <section
      aria-label="Resumo de certificados"
      className="grid grid-cols-2 gap-4 lg:grid-cols-4"
    >
      {stats.map((stat) => (
        <div
          key={stat.label}
          className="rounded-[var(--radius-card)] border-2 border-ink bg-surface p-4 shadow-[4px_4px_0_0_var(--color-ink)]"
        >
          <div className="flex items-center gap-3">
            <span
              className={`grid size-9 shrink-0 place-items-center rounded-md ${stat.className}`}
            >
              <stat.icon aria-hidden="true" className="size-5" />
            </span>
            <div>
              <p className="text-2xl font-semibold tabular-nums text-strong">
                {stat.value}
              </p>
              <p className="text-xs text-soft">{stat.label}</p>
            </div>
          </div>
        </div>
      ))}
    </section>
  );
}
