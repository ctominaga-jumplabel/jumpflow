import type { Metadata } from "next";
import { PageHeader } from "@/components/ui/PageHeader";
import { EmptyState } from "@/components/ui/EmptyState";
import { GraduationCap } from "lucide-react";
import { CompetenciesView } from "@/components/competencies/CompetenciesView";
import { requireRole } from "@/lib/auth/guards";
import {
  COMPETENCY_READ_ROLES,
  COMPETENCY_WRITE_ROLES,
  hasRole,
} from "@/lib/auth/route-permissions";
import { isDatabaseConfigured } from "@/lib/db/config";
import {
  getCompetencyMatrix,
  getTeamGap,
  listActiveSkillOptions,
  listCompetencyProfiles,
  listSkillCatalog,
} from "@/lib/db/competencies";
import { assertModuleEnabled } from "@/lib/modules/disabled-modules";

export const metadata: Metadata = { title: "Competências" };

export default async function CompetenciasPage() {
  // Módulo desligado (EP-M07): retorna 404 antes de qualquer fetch. Dados e
  // actions permanecem intactos; reabilitar = remover de disabled-modules.ts.
  assertModuleEnabled("COMPETENCIAS");
  const user = await requireRole(COMPETENCY_READ_ROLES);
  const databaseReady = isDatabaseConfigured();
  const canManage = hasRole(user, COMPETENCY_WRITE_ROLES);

  if (!databaseReady) {
    // Degradação graciosa honesta: o catálogo e os perfis são dados reais; sem
    // DB não há fallback silencioso para mock (US12.03).
    return (
      <div className="space-y-6">
        <PageHeader
          eyebrow="Talentos"
          title="Competências"
          description="Catálogo de skills, perfis de competência e matriz de gap (requerido × atual)."
        />
        <EmptyState
          icon={GraduationCap}
          title="Banco de dados não configurado"
          description="O módulo de competências consome o catálogo persistido. Configure o banco para gerenciar skills, perfis e gap."
        />
      </div>
    );
  }

  const [catalog, profiles, skillOptions, matrix, teamGap] = await Promise.all([
    listSkillCatalog(),
    listCompetencyProfiles(),
    listActiveSkillOptions(),
    getCompetencyMatrix(user),
    getTeamGap(user),
  ]);

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Talentos"
        title="Competências"
        description="Catálogo de skills (técnicas e comportamentais), perfis de competência por escopo e matriz de gap (requerido × atual) do time."
      />
      <CompetenciesView
        canManage={canManage}
        catalog={catalog}
        profiles={profiles}
        skillOptions={skillOptions}
        matrix={matrix}
        teamGap={teamGap}
      />
    </div>
  );
}
