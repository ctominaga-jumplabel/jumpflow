import type { Metadata } from "next";
import { Users } from "lucide-react";
import { ModulePlaceholder } from "@/components/ui/ModulePlaceholder";

export const metadata: Metadata = { title: "Consultores" };

export default function ConsultoresPage() {
  return (
    <ModulePlaceholder
      title="Consultores"
      description="Cadastro de consultores com senioridade, área, status e disponibilidade para alocação em projetos."
      icon={Users}
      steps={[
        "Cadastro de consultores com senioridade e área.",
        "Visão de disponibilidade e percentual alocado.",
        "Histórico de projetos e alocações.",
        "Busca por skill, senioridade e disponibilidade.",
      ]}
    />
  );
}
