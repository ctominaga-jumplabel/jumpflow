import type { Metadata } from "next";
import { Clock } from "lucide-react";
import { ModulePlaceholder } from "@/components/ui/ModulePlaceholder";

export const metadata: Metadata = { title: "Horas" };

export default function HorasPage() {
  return (
    <ModulePlaceholder
      title="Horas"
      description="Lançamento semanal de horas por projeto, com tipos de atividade, horas faturáveis e envio para aprovação."
      icon={Clock}
      steps={[
        "Grade semanal de lançamento por projeto e atividade.",
        "Copiar semana anterior para acelerar o apontamento.",
        "Validação de horas e envio para aprovação.",
        "Indicação de pendências e prazos de lançamento.",
      ]}
    />
  );
}
