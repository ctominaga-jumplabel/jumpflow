import type { Metadata } from "next";
import { PageHeader } from "@/components/ui/PageHeader";
import { ConsultantDirectory } from "@/components/consultants/ConsultantDirectory";
import { getCurrentUser } from "@/lib/auth/current-user";
import { FINANCIAL_ROLES, hasRole } from "@/lib/auth/route-permissions";
import { hasRoleOrPermission } from "@/lib/auth/guards";
import {
  CONSULTANT_BANK_CODE,
  CONSULTANT_COMPENSATION_CODE,
  CONSULTANT_CURRICULUM_CODE,
  CONSULTANT_DOCUMENTS_CODE,
  CONSULTANT_PERSONAL_CODE,
} from "@/lib/auth/permission-codes";
import type { RoleName } from "@/lib/auth/types";
import { isDatabaseConfigured } from "@/lib/db/config";
import { listConsultantDirectory } from "@/lib/db/consultants";
import { consultants as demoConsultants } from "@/lib/mock-data/consultants";

export const metadata: Metadata = { title: "Consultores" };

const PEOPLE_ROLES: RoleName[] = ["ADMIN", "PEOPLE"];

export default async function ConsultoresPage({
  searchParams,
}: {
  searchParams?: Promise<{ novo?: string }>;
}) {
  const user = await getCurrentUser();
  const databaseReady = isDatabaseConfigured();
  const consultants = databaseReady
    ? await listConsultantDirectory()
    : demoConsultants;
  const params = (await searchParams) ?? {};

  // M1: cada grupo do cadastro é liberável pela Matriz (role OU permissão). O
  // fallback de papel preserva o comportamento histórico: grupos "de People"
  // caem em PEOPLE_ROLES; o grupo de valores cai em FINANCIAL_ROLES. A Matriz
  // apenas AMPLIA (ex.: People/DP ganha o grupo de valores; PM/Comercial ganham
  // leitura de Pessoais/Currículo).
  const groupPerm = async (roles: RoleName[], code: string) => ({
    view: await hasRoleOrPermission(user, roles, code, "view"),
    edit: await hasRoleOrPermission(user, roles, code, "edit"),
  });
  const [personal, documents, curriculum, bank, compensation] =
    await Promise.all([
      groupPerm(PEOPLE_ROLES, CONSULTANT_PERSONAL_CODE),
      groupPerm(PEOPLE_ROLES, CONSULTANT_DOCUMENTS_CODE),
      groupPerm(PEOPLE_ROLES, CONSULTANT_CURRICULUM_CODE),
      groupPerm(PEOPLE_ROLES, CONSULTANT_BANK_CODE),
      groupPerm(FINANCIAL_ROLES, CONSULTANT_COMPENSATION_CODE),
    ]);
  const groupPerms = { personal, documents, curriculum, bank, compensation };
  // Remuneração é visível a papéis financeiros OU a quem a Matriz liberar.
  const canManageFinancials = compensation.view;

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
        canManageFinancials={canManageFinancials}
        groupPerms={groupPerms}
        initialConsultantId={params.novo}
      />
    </div>
  );
}
