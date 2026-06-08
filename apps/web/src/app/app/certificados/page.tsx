import type { Metadata } from "next";
import { Award } from "lucide-react";
import { ModulePlaceholder } from "@/components/ui/ModulePlaceholder";

export const metadata: Metadata = { title: "Certificados" };

export default function CertificadosPage() {
  return (
    <ModulePlaceholder
      title="Certificados"
      description="Cadastro de certificações com emissor, validade, anexos e alertas de vencimento para People."
      icon={Award}
      steps={[
        "Cadastro de certificados com emissor e datas.",
        "Anexo de comprovantes.",
        "Alertas de certificados próximos do vencimento.",
        "Validação por RH/People.",
      ]}
    />
  );
}
