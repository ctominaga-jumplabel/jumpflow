import type { Metadata } from "next";
import { Sprout } from "lucide-react";
import { PageHeader } from "@/components/ui/PageHeader";
import { EmptyState } from "@/components/ui/EmptyState";
import { DevelopmentView } from "@/components/development/DevelopmentView";
import { requireRole } from "@/lib/auth/guards";
import { isDatabaseConfigured } from "@/lib/db/config";
import {
  listDevelopmentPlans,
  listManageableConsultants,
} from "@/lib/db/development";
import { listActiveSkillOptions } from "@/lib/db/competencies";
import {
  DEVELOPMENT_READ_ROLES,
  isBroadManager,
} from "@/lib/development/visibility";
import type { RoleName } from "@/lib/auth/roles";

export const metadata: Metadata = { title: "PDI" };

function canManageStructure(roles: readonly RoleName[]): boolean {
  return (
    isBroadManager(roles) ||
    roles.includes("AREA_MANAGER") ||
    roles.includes("PROJECT_MANAGER")
  );
}

export default async function PdiPage() {
  const user = await requireRole(DEVELOPMENT_READ_ROLES);
  const databaseReady = isDatabaseConfigured();
  const canManage = canManageStructure(user.roles);

  if (!databaseReady) {
    // Degradação graciosa honesta: PDI é dado pessoal de desenvolvimento
    // persistido; sem DB não há fallback silencioso para mock (LGPD §3).
    return (
      <div className="space-y-6">
        <PageHeader
          eyebrow="Talentos"
          title="PDI"
          description="Plano de Desenvolvimento Individual a partir do gap de competências."
        />
        <EmptyState
          icon={Sprout}
          title="Banco de dados não configurado"
          description="O módulo de PDI consome dados pessoais persistidos. Configure o banco para criar planos, gerar ações a partir do gap e acompanhar o progresso."
        />
      </div>
    );
  }

  const [plans, consultants, skillOptions] = await Promise.all([
    listDevelopmentPlans(user),
    canManage ? listManageableConsultants(user) : Promise.resolve([]),
    canManage ? listActiveSkillOptions() : Promise.resolve([]),
  ]);

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Talentos"
        title="PDI — Plano de Desenvolvimento Individual"
        description="Crie planos a partir do gap de competências, acompanhe as ações (treinamento, mentoria, certificação) e o progresso. O consultor atualiza o andamento das próprias ações; a estrutura é da gestão."
      />
      <DevelopmentView
        canManage={canManage}
        plans={plans}
        consultants={consultants}
        skillOptions={skillOptions}
      />
    </div>
  );
}
