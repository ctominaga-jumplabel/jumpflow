import type { Metadata } from "next";
import { PageHeader } from "@/components/ui/PageHeader";
import { ProjectSummaryPanel } from "@/components/projects/ProjectSummaryPanel";
import { ProjectsView } from "@/components/projects/ProjectsView";
import { getCurrentUser } from "@/lib/auth/current-user";
import { FINANCIAL_ROLES, hasRole } from "@/lib/auth/route-permissions";
import type { RoleName } from "@/lib/auth/types";
import { isDatabaseConfigured } from "@/lib/db/config";
import { listBillingTypes } from "@/lib/db/clients";
import {
  listProjectClients,
  listProjectConsultants,
  listProjectManagers,
  listProjects,
  listSkillCatalog,
} from "@/lib/db/projects";
import type { ProjectBillingTypeOption } from "@/lib/projects/types";
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
  // A configuracao de cobranca (motor de regras) e editada pelo Financeiro.
  const canEditBillingConfig = hasRole(user, FINANCIAL_ROLES);
  const [projects, clients, consultants, managers, skills, billingTypeItems] =
    databaseReady
      ? await Promise.all([
          listProjects({ includeFinancials: canViewCommercials }),
          listProjectClients(),
          listProjectConsultants(),
          listProjectManagers(),
          listSkillCatalog(),
          // Tipo de cobrança é comercial: só carrega o catálogo para quem pode ver/editar.
          canViewCommercials ? listBillingTypes() : Promise.resolve([]),
        ])
      : [
          demoProjects,
          demoProjectClients,
          demoProjectConsultants,
          demoProjectManagers,
          demoProjectSkills,
          [],
        ];

  // Only active billing types are offered as options (catalog ordered active-first).
  const billingTypes: ProjectBillingTypeOption[] = (
    billingTypeItems as { id: string; name: string; chargeType: string; active?: boolean }[]
  )
    .filter((item) => item.active !== false)
    .map((item) => ({ id: item.id, name: item.name, chargeType: item.chargeType }));

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Operação"
        title="Projetos"
        description="Carteira de projetos com cliente, status, gestor, período, budget, vínculos e valores de venda."
      />
      <ProjectSummaryPanel projects={projects} />
      <ProjectsView
        mode={databaseReady ? "db" : "demo"}
        projects={projects}
        clients={clients}
        consultants={consultants}
        managers={managers}
        skills={skills}
        billingTypes={billingTypes}
        canManageProjects={canManageProjects}
        canViewCommercials={canViewCommercials}
        canManageSaleRates={canManageSaleRates}
        canEditBillingConfig={canEditBillingConfig}
      />
    </div>
  );
}
