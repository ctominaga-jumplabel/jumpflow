"use client";

import { useEffect, useState } from "react";
import { Trash2 } from "lucide-react";
import { ActionButton } from "@/components/ui/ActionButton";
import { StatusBadge, type StatusTone } from "@/components/ui/StatusBadge";
import {
  deleteMyCase,
  deleteMyCertificate,
  loadMyCases,
  loadMyCertificates,
  type MyCaseView,
  type MyCertificateView,
} from "@/app/app/skills/actions";

/**
 * Certificados e Cases do PROPRIO consultor, COM o status de curadoria.
 *
 * Existe porque os dois só aparecem no currículo consolidado depois de
 * validados: `buildConsultantCurriculum` projeta apenas certificados VALIDATED,
 * e Case é lido por checkpoint. Sem esta seção, o que a importação de currículo
 * grava sumiria da tela até alguém validar — o consultor não teria como saber
 * que o registro existe, nem corrigir um item errado proposto pela IA.
 *
 * A remoção só é oferecida enquanto o item é candidato (PENDING); depois disso
 * a decisão é de People/gestão e o servidor recusa.
 */

const certificateTone: Record<MyCertificateView["status"], StatusTone> = {
  PENDING: "warning",
  VALIDATED: "success",
  REJECTED: "danger",
};
const certificateLabel: Record<MyCertificateView["status"], string> = {
  PENDING: "Aguardando validação",
  VALIDATED: "Validado",
  REJECTED: "Recusado",
};

const caseTone: Record<MyCaseView["status"], StatusTone> = {
  PENDING: "warning",
  ACCEPTED: "success",
  DISMISSED: "neutral",
};
const caseLabel: Record<MyCaseView["status"], string> = {
  PENDING: "Em curadoria",
  ACCEPTED: "Aceito",
  DISMISSED: "Descartado",
};

export function MyCurriculumRecords({
  onMessage,
}: {
  onMessage?: (message: string) => void;
}) {
  const [certificates, setCertificates] = useState<MyCertificateView[]>([]);
  const [cases, setCases] = useState<MyCaseView[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);

  async function fetchAll() {
    const [certResult, caseResult] = await Promise.all([
      loadMyCertificates(),
      loadMyCases(),
    ]);
    if (certResult.ok) setCertificates(certResult.data);
    if (caseResult.ok) setCases(caseResult.data);
    return certResult.ok && caseResult.ok;
  }

  useEffect(() => {
    // setState sempre APOS o await (evita cascata de renders) e flag de
    // cleanup para nao escrever estado depois de desmontar, como na aba.
    let active = true;
    void (async () => {
      const [certResult, caseResult] = await Promise.all([
        loadMyCertificates(),
        loadMyCases(),
      ]);
      if (!active) return;
      if (certResult.ok) setCertificates(certResult.data);
      if (caseResult.ok) setCases(caseResult.data);
      setLoading(false);
    })();
    return () => {
      active = false;
    };
  }, []);

  async function removeCertificate(id: string) {
    setBusyId(id);
    const result = await deleteMyCertificate({ id });
    if (result.ok) {
      await fetchAll();
      onMessage?.("Certificado removido.");
    } else {
      onMessage?.(result.message);
    }
    setBusyId(null);
  }

  async function removeCase(id: string) {
    setBusyId(id);
    const result = await deleteMyCase({ id });
    if (result.ok) {
      await fetchAll();
      onMessage?.("Case removido.");
    } else {
      onMessage?.(result.message);
    }
    setBusyId(null);
  }

  if (loading) {
    return (
      <p className="text-sm text-medium">
        Carregando certificados e cases...
      </p>
    );
  }

  return (
    <>
      <div className="space-y-2 rounded-md border border-border p-3">
        <div className="text-sm font-semibold text-strong">Certificados</div>
        <p className="text-xs text-soft">
          Certificados aguardando validação ainda não aparecem no currículo
          consolidado. O time de Pessoas valida antes da publicação.
        </p>
        {certificates.length === 0 ? (
          <p className="text-sm text-medium">Nenhum certificado cadastrado.</p>
        ) : (
          <ul className="space-y-2">
            {certificates.map((certificate) => (
              <li
                key={certificate.id}
                className="rounded-md border border-border bg-surface-muted/40 p-2"
              >
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div>
                    <p className="text-sm font-medium text-strong">
                      {certificate.name}
                    </p>
                    <p className="text-xs text-soft">
                      {certificate.issuer} · emitido em {certificate.issuedAt}
                      {certificate.expiresAt
                        ? ` · válido até ${certificate.expiresAt}`
                        : ""}
                    </p>
                    {certificate.credentialUrl ? (
                      <a
                        href={certificate.credentialUrl}
                        target="_blank"
                        rel="noreferrer noopener"
                        className="text-xs font-medium text-brand underline"
                      >
                        Ver credencial
                      </a>
                    ) : null}
                  </div>
                  <div className="flex items-center gap-2">
                    <StatusBadge tone={certificateTone[certificate.status]}>
                      {certificateLabel[certificate.status]}
                    </StatusBadge>
                    {certificate.status === "PENDING" ? (
                      <ActionButton
                        size="sm"
                        variant="secondary"
                        icon={Trash2}
                        disabled={busyId === certificate.id}
                        onClick={() => removeCertificate(certificate.id)}
                      >
                        Remover
                      </ActionButton>
                    ) : null}
                  </div>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="space-y-2 rounded-md border border-border p-3">
        <div className="text-sm font-semibold text-strong">Cases</div>
        <p className="text-xs text-soft">
          Entregas concluídas dignas de referência. Cases em curadoria aguardam
          revisão do gestor; o consentimento do cliente é tratado fora do
          currículo.
        </p>
        {cases.length === 0 ? (
          <p className="text-sm text-medium">Nenhum case cadastrado.</p>
        ) : (
          <ul className="space-y-2">
            {cases.map((item) => (
              <li
                key={item.id}
                className="rounded-md border border-border bg-surface-muted/40 p-2"
              >
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div>
                    <p className="text-sm font-medium text-strong">
                      {item.title}
                    </p>
                    {item.summary ? (
                      <p className="text-xs text-medium">{item.summary}</p>
                    ) : null}
                    {item.outcome ? (
                      <p className="text-xs text-soft">
                        Resultado: {item.outcome}
                      </p>
                    ) : null}
                  </div>
                  <div className="flex items-center gap-2">
                    {item.aiGenerated ? (
                      <StatusBadge tone="info">Sugerido por IA</StatusBadge>
                    ) : null}
                    <StatusBadge tone={caseTone[item.status]}>
                      {caseLabel[item.status]}
                    </StatusBadge>
                    {item.status === "PENDING" &&
                    item.stage === "DRAFT_INSIGHT" ? (
                      <ActionButton
                        size="sm"
                        variant="secondary"
                        icon={Trash2}
                        disabled={busyId === item.id}
                        onClick={() => removeCase(item.id)}
                      >
                        Remover
                      </ActionButton>
                    ) : null}
                  </div>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </>
  );
}
