import type { Metadata } from "next";
import { ClipboardCheck } from "lucide-react";
import { ModulePlaceholder } from "@/components/ui/ModulePlaceholder";
import { requireRole } from "@/lib/auth/guards";

export const metadata: Metadata = { title: "Aprovações" };

export default async function AprovacoesPage() {
  // Approvals are role-protected; keep in sync with route-permissions map.
  await requireRole(["ADMIN", "AREA_MANAGER", "PROJECT_MANAGER"]);

  return (
    <ModulePlaceholder
      title="Aprovações"
      description="Fluxo de aprovação e reprovação de horas por projeto e período, com comentários e reenvio após correção."
      icon={ClipboardCheck}
      steps={[
        "Lista de horas pendentes por projeto e período.",
        "Aprovação individual ou em lote.",
        "Reprovação com justificativa obrigatória.",
        "Histórico de decisões e reenvio após correção.",
      ]}
    />
  );
}
