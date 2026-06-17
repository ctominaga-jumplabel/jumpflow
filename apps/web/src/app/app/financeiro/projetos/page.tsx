import type { Metadata } from "next";
import { PageHeader } from "@/components/ui/PageHeader";
import { ProjectBillingView } from "@/components/financial/ProjectBillingView";
import { requireRole } from "@/lib/auth/guards";
import { FINANCIAL_ROLES } from "@/lib/auth/route-permissions";
import { isDatabaseConfigured } from "@/lib/db/config";
import { listProjects } from "@/lib/db/projects";
import { demoProjects } from "@/lib/projects/mock-data";

export const metadata: Metadata = { title: "Cobrança de projetos" };

export default async function FinanceiroProjetosPage() {
  // Regras de cobrança são financeiras e protegidas por papel.
  await requireRole(FINANCIAL_ROLES);

  const databaseReady = isDatabaseConfigured();
  const projects = databaseReady
    ? await listProjects({ includeFinancials: true })
    : demoProjects;

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Financeiro"
        title="Cobrança de projetos"
        description="Regra de cobrança por projeto (motor parametrizável). Valor de venda, cliente, status e período são read-only aqui."
      />
      <ProjectBillingView
        mode={databaseReady ? "db" : "demo"}
        projects={projects}
      />
    </div>
  );
}
