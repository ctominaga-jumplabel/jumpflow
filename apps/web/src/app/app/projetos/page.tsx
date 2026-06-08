import type { Metadata } from "next";
import { FolderKanban } from "lucide-react";
import { ModulePlaceholder } from "@/components/ui/ModulePlaceholder";

export const metadata: Metadata = { title: "Projetos" };

export default function ProjetosPage() {
  return (
    <ModulePlaceholder
      title="Projetos"
      description="Cadastro de projetos com cliente, gestor responsável, status, budget de horas e dados financeiros protegidos por perfil."
      icon={FolderKanban}
      steps={[
        "Cadastro de projetos vinculados a clientes.",
        "Definição de gestor responsável e status do projeto.",
        "Budget de horas e valor hora vendido (com auditoria).",
        "Acompanhamento de horas planejadas vs. realizadas.",
      ]}
    />
  );
}
