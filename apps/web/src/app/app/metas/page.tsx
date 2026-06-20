import type { Metadata } from "next";
import { Flag } from "lucide-react";
import { PageHeader } from "@/components/ui/PageHeader";
import { EmptyState } from "@/components/ui/EmptyState";
import { ObjectivesView } from "@/components/okrs/ObjectivesView";
import { requireRole } from "@/lib/auth/guards";
import { isDatabaseConfigured } from "@/lib/db/config";
import {
  listObjectives,
  listOkrConsultantOptions,
  listOkrProjectOptions,
} from "@/lib/db/okrs";
import { OKR_READ_ROLES, isBroadManager, isPeople } from "@/lib/okrs/visibility";
import type { RoleName } from "@/lib/auth/roles";

export const metadata: Metadata = { title: "Metas" };

/** Pode criar/gerenciar estrutura de OKR (porta de entrada; a fronteira fina é no servidor). */
function canManageStructure(roles: readonly RoleName[]): boolean {
  return (
    isBroadManager(roles) ||
    isPeople(roles) ||
    roles.includes("PROJECT_MANAGER")
  );
}

export default async function MetasPage() {
  const user = await requireRole(OKR_READ_ROLES);
  const databaseReady = isDatabaseConfigured();
  const canManage = canManageStructure(user.roles);

  if (!databaseReady) {
    // Degradação graciosa honesta: objetivos e Key Results são dados persistidos;
    // sem DB não há fallback silencioso para mock.
    return (
      <div className="space-y-6">
        <PageHeader
          eyebrow="Talentos"
          title="Metas e OKRs"
          description="Objetivos por escopo (consultor, projeto, área e empresa) com Key Results e progresso."
        />
        <EmptyState
          icon={Flag}
          title="Banco de dados não configurado"
          description="O módulo de Metas consome objetivos e Key Results persistidos. Configure o banco para criar OKRs e acompanhar o progresso."
        />
      </div>
    );
  }

  const [objectives, consultants, projects] = await Promise.all([
    listObjectives(user),
    canManage ? listOkrConsultantOptions(user) : Promise.resolve([]),
    canManage ? listOkrProjectOptions(user) : Promise.resolve([]),
  ]);

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Talentos"
        title="Metas e OKRs"
        description="Defina objetivos por escopo e acompanhe os Key Results. O progresso é derivado automaticamente dos valores (start → atual → alvo); KRs com fonte operacional podem sincronizar do dado real. O consultor atualiza o valor dos próprios KRs; a estrutura é da gestão."
      />
      <ObjectivesView
        canManage={canManage}
        objectives={objectives}
        consultants={consultants}
        projects={projects}
      />
    </div>
  );
}
