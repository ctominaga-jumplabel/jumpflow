import type { Metadata } from "next";
import { GraduationCap } from "lucide-react";
import { ModulePlaceholder } from "@/components/ui/ModulePlaceholder";

export const metadata: Metadata = { title: "Skills" };

export default function SkillsPage() {
  return (
    <ModulePlaceholder
      title="Skills"
      description="Matriz de competências técnicas e comportamentais dos consultores, com nível, experiência e validação por gestor."
      icon={GraduationCap}
      steps={[
        "Catálogo de skills por categoria.",
        "Skills do consultor com nível e anos de experiência.",
        "Validação de skills declaradas por gestor.",
        "Matriz de skills e busca para alocação comercial.",
      ]}
    />
  );
}
