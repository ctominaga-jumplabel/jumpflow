import type { Metadata } from "next";
import { Wallet } from "lucide-react";
import { ModulePlaceholder } from "@/components/ui/ModulePlaceholder";
import { requireRole } from "@/lib/auth/guards";

export const metadata: Metadata = { title: "Financeiro" };

export default async function FinanceiroPage() {
  // Financial data is role-protected; non-authorized users go to /access-denied.
  await requireRole(["ADMIN", "AREA_MANAGER", "FINANCE"]);

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
