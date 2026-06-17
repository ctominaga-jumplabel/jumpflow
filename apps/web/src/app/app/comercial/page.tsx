import type { Metadata } from "next";
import { PageHeader } from "@/components/ui/PageHeader";
import { CommercialView } from "@/components/commercial/CommercialView";
import { requireRole } from "@/lib/auth/guards";
import { SALE_RATE_ROLES } from "@/lib/auth/route-permissions";
import { isDatabaseConfigured } from "@/lib/db/config";
import { listBillingTypes } from "@/lib/db/clients";
import { listProjectConsultants, listProjects } from "@/lib/db/projects";
import type { ProjectBillingTypeOption } from "@/lib/projects/types";
import { demoProjectConsultants, demoProjects } from "@/lib/projects/mock-data";

export const metadata: Metadata = { title: "Comercial" };

export default async function ComercialPage() {
  // Valores de venda são comerciais e protegidos por papel.
  await requireRole(SALE_RATE_ROLES);

  const databaseReady = isDatabaseConfigured();
  const [projects, consultants, billingTypeItems] = databaseReady
    ? await Promise.all([
        // Comercial vê e edita valores: carrega os campos financeiros.
        listProjects({ includeFinancials: true }),
        listProjectConsultants(),
        listBillingTypes(),
      ])
    : [demoProjects, demoProjectConsultants, []];

  const billingTypes: ProjectBillingTypeOption[] = (
    billingTypeItems as {
      id: string;
      name: string;
      chargeType: string;
      active?: boolean;
    }[]
  )
    .filter((item) => item.active !== false)
    .map((item) => ({ id: item.id, name: item.name, chargeType: item.chargeType }));

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Comercial"
        title="Precificação"
        description="Tipo de cobrança, budget e valores de venda por projeto. Cliente, status e período são definidos pela Operação."
      />
      <CommercialView
        mode={databaseReady ? "db" : "demo"}
        projects={projects}
        consultants={consultants}
        billingTypes={billingTypes}
      />
    </div>
  );
}
