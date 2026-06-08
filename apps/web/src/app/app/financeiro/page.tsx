import type { Metadata } from "next";
import { Wallet } from "lucide-react";
import { ModulePlaceholder } from "@/components/ui/ModulePlaceholder";

export const metadata: Metadata = { title: "Financeiro" };

export default function FinanceiroPage() {
  return (
    <ModulePlaceholder
      title="Financeiro"
      description="Horas aprovadas para faturamento, valor hora, margem e fechamento mensal — com campos sensíveis protegidos por perfil."
      icon={Wallet}
      steps={[
        "Relatório mensal de horas aprovadas.",
        "Valor hora vendido e total estimado por projeto.",
        "Fechamento mensal com bloqueio de lançamentos.",
        "Exportação para faturamento (CSV no MVP).",
      ]}
    />
  );
}
