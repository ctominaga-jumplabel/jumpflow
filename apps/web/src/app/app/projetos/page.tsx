import type { Metadata } from "next";
import { PageHeader } from "@/components/ui/PageHeader";
import { ProjectSummaryPanel } from "@/components/projects/ProjectSummaryPanel";
import { ProjectsView } from "@/components/projects/ProjectsView";
import { getCurrentUser } from "@/lib/auth/current-user";
import { hasRole } from "@/lib/auth/route-permissions";
import type { RoleName } from "@/lib/auth/types";
import { isDatabaseConfigured } from "@/lib/db/config";
import {
  listProjectClients,
  listProjectConsultants,
  listProjectManagers,
  listProjects,
  listSkillCatalog,
} from "@/lib/db/projects";
import {
  demoProjectClients,
  demoProjectConsultants,
  demoProjectManagers,
  demoProjects,
  demoProjectSkills,
} from "@/lib/projects/mock-data";

export const metadata: Metadata = { title: "Projetos" };

const PROJECT_WRITE_ROLES: RoleName[] = [
  "ADMIN",
  "AREA_MANAGER",
  "PROJECT_MANAGER",
  "SALES",
];
const SALE_RATE_ROLES: RoleName[] = [
  "ADMIN",
  "AREA_MANAGER",
  "FINANCE",
  "SALES",
];

export default async function ProjetosPage() {
  const user = await getCurrentUser();
  const databaseReady = isDatabaseConfigured();
  const canManageProjects = hasRole(user, PROJECT_WRITE_ROLES);
  const canViewCommercials = hasRole(user, SALE_RATE_ROLES);
  const canManageSaleRates = hasRole(user, SALE_RATE_ROLES);
  const [projects, clients, consultants, managers, skills] = databaseReady
    ? await Promise.all([
        listProjects({ includeFinancials: canViewCommercials }),
        listProjectClients(),
        listProjectConsultants(),
        listProjectManagers(),
        listSkillCatalog(),
      ])
    : [
        demoProjects,
        demoProjectClients,
        demoProjectConsultants,
        demoProjectManagers,
        demoProjectSkills,
      ];

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Operacao"
        title="Projetos"
        description="Carteira de projetos com cliente, status, gestor, periodo, budget, vinculos e valores de venda."
      />
      <ProjectSummaryPanel projects={projects} />
      <ProjectsView
        mode={databaseReady ? "db" : "demo"}
        projects={projects}
        clients={clients}
        consultants={consultants}
        managers={managers}
        skills={skills}
        canManageProjects={canManageProjects}
        canViewCommercials={canViewCommercials}
        canManageSaleRates={canManageSaleRates}
      />
    </div>
  );
}
