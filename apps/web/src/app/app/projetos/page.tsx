import type { Metadata } from "next";
import { PageHeader } from "@/components/ui/PageHeader";
import { ProjectSummaryPanel } from "@/components/projects/ProjectSummaryPanel";
import { ProjectList } from "@/components/projects/ProjectList";
import { getCurrentUser } from "@/lib/auth/current-user";
import { FINANCIAL_ROLES, hasRole } from "@/lib/auth/route-permissions";
import { projects } from "@/lib/mock-data/projects";

export const metadata: Metadata = { title: "Projetos" };

export default async function ProjetosPage() {
  // Financial fields (valor hora, budget) are role-protected even though the
  // module itself is readable by all authenticated users. We resolve the
  // capability on the server and pass it down; the UI only masks the display.
  const user = await getCurrentUser();
  const canViewFinancials = hasRole(user, FINANCIAL_ROLES);

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Operação"
        title="Projetos"
        description="Carteira de projetos com cliente, status, gestor, período, budget e alocação."
      />
      <ProjectSummaryPanel projects={projects} />
      <ProjectList canViewFinancials={canViewFinancials} projects={projects} />
    </div>
  );
}
