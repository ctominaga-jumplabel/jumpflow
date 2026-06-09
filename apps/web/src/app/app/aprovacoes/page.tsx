import type { Metadata } from "next";
import { PageHeader } from "@/components/ui/PageHeader";
import { ApprovalQueue } from "@/components/approvals/ApprovalQueue";
import { requireRole } from "@/lib/auth/guards";

export const metadata: Metadata = { title: "Aprovações" };

export default async function AprovacoesPage() {
  // Approvals are role-protected; keep in sync with the route-permissions map.
  await requireRole(["ADMIN", "AREA_MANAGER", "PROJECT_MANAGER"]);

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Operação"
        title="Aprovações"
        description="Triagem de horas pendentes com aprovação, reprovação justificada e histórico de decisões."
      />
      <ApprovalQueue />
    </div>
  );
}
