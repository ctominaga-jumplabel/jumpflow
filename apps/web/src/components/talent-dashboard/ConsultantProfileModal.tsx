"use client";

import { Modal } from "@/components/ui/Modal";
import { StatusBadge, type StatusTone } from "@/components/ui/StatusBadge";
import {
  CERT_EXPIRY_LABEL,
  CONTRACT_LABEL,
  LEVEL_LABEL,
  SENIORITY_LABEL,
  STATUS_LABEL,
  VALIDATION_LABEL,
  type CertExpiryDto,
  type DashConsultant,
  type ValidationStatusDto,
} from "@/components/talent-dashboard/types";

export interface ConsultantProfileModalProps {
  consultant: DashConsultant | null;
  onClose: () => void;
}

const VALIDATION_TONE: Record<ValidationStatusDto, StatusTone> = {
  PENDING: "warning",
  VALIDATED: "success",
  REJECTED: "danger",
};

const EXPIRY_TONE: Record<CertExpiryDto, StatusTone> = {
  VALID: "success",
  EXPIRING: "warning",
  EXPIRED: "danger",
  NO_EXPIRY: "neutral",
};

/** ISO "YYYY-MM-DD" -> "dd/mm/aaaa" sem criar Date (sem risco de fuso). */
function formatIsoDate(iso: string): string {
  const [y, m, d] = iso.split("-");
  return y && m && d ? `${d}/${m}/${y}` : iso;
}

function Stat({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="rounded-md border-2 border-ink bg-canvas px-3 py-2 shadow-[2px_2px_0_0_var(--color-ink)]">
      <p className="text-xs font-medium text-soft">{label}</p>
      <p className="mt-0.5 text-lg font-semibold tabular-nums text-strong">
        {value}
      </p>
    </div>
  );
}

/**
 * Perfil enxuto do consultor: identificação, contadores e as listas de skills
 * (nível + validação) e certificados (vigência). Reutilizável por todas as
 * sub-views via `onOpenConsultant`.
 */
export function ConsultantProfileModal({
  consultant,
  onClose,
}: ConsultantProfileModalProps) {
  const c = consultant;
  return (
    <Modal
      open={c != null}
      onClose={onClose}
      title={c?.name ?? "Consultor"}
      description={c?.email}
      className="max-w-2xl"
    >
      {c ? (
        <div className="space-y-5">
          <div className="flex flex-wrap gap-2">
            {c.jobTitle ? (
              <StatusBadge tone="info">{c.jobTitle}</StatusBadge>
            ) : null}
            {c.seniority ? (
              <StatusBadge tone="neutral">
                {SENIORITY_LABEL[c.seniority]}
              </StatusBadge>
            ) : null}
            <StatusBadge tone="neutral">
              {CONTRACT_LABEL[c.contractType]}
            </StatusBadge>
            <StatusBadge
              tone={c.status === "ACTIVE" ? "success" : "neutral"}
            >
              {STATUS_LABEL[c.status]}
            </StatusBadge>
            <StatusBadge tone="neutral">{c.area}</StatusBadge>
          </div>

          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <Stat label="Skills" value={c.skillCount} />
            <Stat label="Validadas" value={c.validatedSkillCount} />
            <Stat label="Certificados" value={c.certCount} />
            <Stat label="Cursos" value={c.coursesCompleted} />
          </div>

          <section>
            <h3 className="mb-2 text-sm font-semibold text-strong">
              Skills ({c.skills.length})
            </h3>
            {c.skills.length ? (
              <ul className="space-y-1.5">
                {c.skills.map((s, i) => (
                  <li
                    key={`${s.name}-${i}`}
                    className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-border bg-surface px-3 py-2"
                  >
                    <span className="min-w-0 truncate text-sm font-medium text-strong">
                      {s.name}
                      <span className="ml-2 text-xs font-normal text-soft">
                        {s.category}
                      </span>
                    </span>
                    <span className="flex shrink-0 items-center gap-1.5">
                      <StatusBadge tone="neutral">
                        {LEVEL_LABEL[s.level]}
                      </StatusBadge>
                      <StatusBadge tone={VALIDATION_TONE[s.validation]}>
                        {VALIDATION_LABEL[s.validation]}
                      </StatusBadge>
                    </span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-soft">Nenhuma skill cadastrada.</p>
            )}
          </section>

          <section>
            <h3 className="mb-2 text-sm font-semibold text-strong">
              Certificados ({c.certs.length})
            </h3>
            {c.certs.length ? (
              <ul className="space-y-1.5">
                {c.certs.map((cert, i) => (
                  <li
                    key={`${cert.name}-${i}`}
                    className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-border bg-surface px-3 py-2"
                  >
                    <span className="min-w-0 truncate text-sm font-medium text-strong">
                      {cert.name}
                      <span className="ml-2 text-xs font-normal text-soft">
                        {cert.issuer}
                      </span>
                    </span>
                    <span className="flex shrink-0 items-center gap-1.5">
                      {cert.expiresAt ? (
                        <span className="text-xs text-soft">
                          {formatIsoDate(cert.expiresAt)}
                        </span>
                      ) : null}
                      <StatusBadge tone={EXPIRY_TONE[cert.expiry]}>
                        {CERT_EXPIRY_LABEL[cert.expiry]}
                      </StatusBadge>
                    </span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-soft">Nenhum certificado cadastrado.</p>
            )}
          </section>
        </div>
      ) : null}
    </Modal>
  );
}
