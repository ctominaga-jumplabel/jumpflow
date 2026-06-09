import type { Metadata } from "next";
import { PageHeader } from "@/components/ui/PageHeader";
import { ConsultantDirectory } from "@/components/consultants/ConsultantDirectory";

export const metadata: Metadata = { title: "Consultores" };

export default function ConsultoresPage() {
  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Pessoas"
        title="Consultores"
        description="Diretório de consultores com senioridade, área, disponibilidade e principais skills."
      />
      <ConsultantDirectory />
    </div>
  );
}
