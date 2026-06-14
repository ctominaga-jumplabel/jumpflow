import type { Metadata } from "next";
import { PageHeader } from "@/components/ui/PageHeader";
import { ConsultantDirectory } from "@/components/consultants/ConsultantDirectory";
import { getCurrentUser } from "@/lib/auth/current-user";
import { FINANCIAL_ROLES, hasRole } from "@/lib/auth/route-permissions";
import type { RoleName } from "@/lib/auth/types";
import { isDatabaseConfigured } from "@/lib/db/config";
import { listConsultantDirectory } from "@/lib/db/consultants";
import { consultants as demoConsultants } from "@/lib/mock-data/consultants";

export const metadata: Metadata = { title: "Consultores" };

const PEOPLE_ROLES: RoleName[] = ["ADMIN", "PEOPLE"];

export default async function ConsultoresPage() {
  const user = await getCurrentUser();
  const databaseReady = isDatabaseConfigured();
  const consultants = databaseReady
    ? await listConsultantDirectory()
    : demoConsultants;

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Pessoas"
        title="Consultores"
        description="Diretorio de consultores com senioridade, area, disponibilidade e principais skills."
      />
      <ConsultantDirectory
        consultants={consultants}
        canManagePeople={hasRole(user, PEOPLE_ROLES)}
        canManageFinancials={hasRole(user, FINANCIAL_ROLES)}
      />
    </div>
  );
}
