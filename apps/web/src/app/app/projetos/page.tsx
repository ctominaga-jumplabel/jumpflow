import type { Metadata } from "next";
import { PageHeader } from "@/components/ui/PageHeader";
import { ProjectSummaryPanel } from "@/components/projects/ProjectSummaryPanel";
import {
  ProjectsView,
  type ProjectDetailTab,
} from "@/components/projects/ProjectsView";
import { getCurrentUser } from "@/lib/auth/current-user";
import { SUBSCREEN_CODES } from "@/lib/auth/permission-codes";
import { canEach } from "@/lib/auth/permissions";
import {
  FINANCIAL_ROLES,
  hasRole,
  PROJECT_TRACKING_BROAD_ROLES,
  PROJECT_TRACKING_VIEW_ROLES,
  PROJECT_WRITE_ROLES,
  SALE_RATE_ROLES,
} from "@/lib/auth/route-permissions";
import { isDatabaseConfigured } from "@/lib/db/config";
import { resolveDbUser } from "@/lib/db/users";
import { listBillingTypes } from "@/lib/db/clients";
import {
  listProjectClients,
  listProjectConsultants,
  listProjectManagers,
  listProjects,
  listSkillCatalog,
} from "@/lib/db/projects";
import type { ProjectBillingTypeOption, ProjectItem } from "@/lib/projects/types";
import {
  demoProjectClients,
  demoProjectConsultants,
  demoProjectManagers,
  demoProjects,
  demoProjectSkills,
} from "@/lib/projects/mock-data";

export const metadata: Metadata = { title: "Projetos" };

// Subtelas do detalhe 360 do projeto → código da matriz de permissões. O
// detalhe em si (e a lista) segue governado pelo código da tela (PROJETOS).
const DETAIL_TAB_CODES = {
  ALLOCATIONS: SUBSCREEN_CODES.projects.links,
  SKILLS: SUBSCREEN_CODES.projects.skills,
  APPROVAL: SUBSCREEN_CODES.projects.approval,
  RATES: SUBSCREEN_CODES.projects.saleValues,
  RECEIVABLES: SUBSCREEN_CODES.projects.expectedReceipts,
  BILLING: SUBSCREEN_CODES.projects.billing,
  TRACKING: SUBSCREEN_CODES.projects.tracking,
} as const satisfies Record<ProjectDetailTab, string>;

type DetailTabAccess = Record<ProjectDetailTab, boolean>;

/**
 * Remove do payload enviado ao cliente os dados das subtelas negadas pela
 * matriz (a aba some E o dado não trafega). Os flags de pendência da lista
 * (hasActiveSaleRate/hasBillingConfig) não são valores e seguem intactos.
 */
function omitDeniedDetailData(
  project: ProjectItem,
  access: DetailTabAccess,
): ProjectItem {
  // Os vínculos alimentam Vínculos, Skills, Aprovação (regras por consultor) e
  // o escopo do valor de venda: só saem quando nenhuma dessas abas é liberada.
  const needsAllocations =
    access.ALLOCATIONS || access.SKILLS || access.APPROVAL || access.RATES;
  return {
    ...project,
    allocations: needsAllocations
      ? access.SKILLS
        ? project.allocations
        : project.allocations.map((item) => ({ ...item, skills: [] }))
      : [],
    saleRates: access.RATES ? project.saleRates : [],
    paymentType: access.RATES ? project.paymentType : undefined,
    receivables: access.RECEIVABLES ? project.receivables : [],
    billingConfig: access.BILLING ? project.billingConfig : undefined,
    autoApprovalRule: access.APPROVAL ? project.autoApprovalRule : undefined,
    autoApprovalConsultantRules: access.APPROVAL
      ? project.autoApprovalConsultantRules
      : [],
  };
}

export default async function ProjetosPage() {
  const user = await getCurrentUser();
  const databaseReady = isDatabaseConfigured();
  const matrix = await canEach(Object.values(DETAIL_TAB_CODES));
  const tabAccess = Object.fromEntries(
    Object.entries(DETAIL_TAB_CODES).map(([tab, code]) => [tab, matrix[code]]),
  ) as DetailTabAccess;
  const allowedDetailTabs = (
    Object.keys(DETAIL_TAB_CODES) as ProjectDetailTab[]
  ).filter((tab) => tabAccess[tab]);
  const canManageProjects = hasRole(user, PROJECT_WRITE_ROLES);
  const canViewCommercials = hasRole(user, SALE_RATE_ROLES);
  const canManageSaleRates = hasRole(user, SALE_RATE_ROLES);
  // A configuracao de cobranca (motor de regras) e editada pelo Financeiro.
  const canEditBillingConfig = hasRole(user, FINANCIAL_ROLES);
  // Recebimentos previstos são valores de receita: escrita para o Comercial ou
  // o Financeiro (mesmo gate/mascaramento dos valores de venda).
  const canManageReceivables =
    hasRole(user, SALE_RATE_ROLES) || hasRole(user, FINANCIAL_ROLES);
  // Acompanhamento (D5): visível a Financeiro/Comercial (todos os projetos) e ao
  // PROJECT_MANAGER (só os próprios). Quando o usuário é PM sem papel amplo,
  // resolvemos o id REAL para restringir a aba aos projetos que ele gerencia; o
  // servidor revalida esse escopo na server action de qualquer forma.
  const canViewTracking =
    hasRole(user, PROJECT_TRACKING_VIEW_ROLES) && tabAccess.TRACKING;
  const trackingBroad = hasRole(user, PROJECT_TRACKING_BROAD_ROLES);
  const trackingManagerUserId =
    databaseReady &&
    canViewTracking &&
    !trackingBroad &&
    hasRole(user, "PROJECT_MANAGER") &&
    user
      ? ((await resolveDbUser(user))?.id ?? "__no-manager__")
      : null;
  const [loadedProjects, clients, consultants, managers, skills, billingTypeItems] =
    databaseReady
      ? await Promise.all([
          listProjects({ includeFinancials: canViewCommercials }),
          listProjectClients(),
          // Consultores alimentam os modais de vínculo e de valor de venda; o
          // catálogo de skills, só a aba Skills. Não carrega para abas negadas.
          tabAccess.ALLOCATIONS || tabAccess.RATES
            ? listProjectConsultants()
            : Promise.resolve([]),
          listProjectManagers(),
          tabAccess.SKILLS ? listSkillCatalog() : Promise.resolve([]),
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
  const projects = loadedProjects.map((project) =>
    omitDeniedDetailData(project, tabAccess),
  );

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
        description="Ciclo de vida dos projetos: cliente, status, gestor, período, vínculos e skills. Valores de venda e regras de cobrança ficam com Comercial e Financeiro."
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
        canManageReceivables={canManageReceivables}
        canViewTracking={canViewTracking}
        trackingManagerUserId={trackingManagerUserId}
        allowedDetailTabs={allowedDetailTabs}
      />
    </div>
  );
}
