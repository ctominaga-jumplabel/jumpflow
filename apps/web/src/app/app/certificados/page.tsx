import type { Metadata } from "next";
import { PageHeader } from "@/components/ui/PageHeader";
import { CertificateSummary } from "@/components/certificates/CertificateSummary";
import { CertificateList } from "@/components/certificates/CertificateList";
import { certificates } from "@/lib/mock-data/certificates";

export const metadata: Metadata = { title: "Certificados" };

export default function CertificadosPage() {
  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Pessoas"
        title="Certificados"
        description="Certificações do time com emissor, validade e destaque para vencidos e próximos do vencimento."
      />
      <CertificateSummary certificates={certificates} />
      <CertificateList certificates={certificates} />
    </div>
  );
}
