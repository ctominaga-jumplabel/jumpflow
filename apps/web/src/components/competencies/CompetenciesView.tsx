"use client";

import { useState } from "react";
import { FilterChip } from "@/components/ui/FilterChip";
import { SkillCatalogManager } from "./SkillCatalogManager";
import { CompetencyProfilesManager } from "./CompetencyProfilesManager";
import { CompetencyGapMatrix } from "./CompetencyGapMatrix";
import type {
  CompetencyMatrix,
  CompetencyProfileView,
  SkillCatalogItem,
  SkillOption,
  TeamGapRow,
} from "@/lib/competencies/types";

type Tab = "MATRIX" | "CATALOG" | "PROFILES";

const tabLabels: Record<Tab, string> = {
  MATRIX: "Matriz & Gap",
  CATALOG: "Catálogo de skills",
  PROFILES: "Perfis de competência",
};

const tabOrder: Tab[] = ["MATRIX", "CATALOG", "PROFILES"];

export interface CompetenciesViewProps {
  canManage: boolean;
  catalog: SkillCatalogItem[];
  profiles: CompetencyProfileView[];
  skillOptions: SkillOption[];
  matrix: CompetencyMatrix;
  teamGap: TeamGapRow[];
}

/**
 * Orchestrator do módulo de Competências. Três superfícies em abas: matriz/gap
 * (leitura para gestão), catálogo de skills e perfis (escrita ADMIN/PEOPLE). A
 * escrita é gated no servidor; aqui `canManage` apenas controla a UI.
 */
export function CompetenciesView({
  canManage,
  catalog,
  profiles,
  skillOptions,
  matrix,
  teamGap,
}: CompetenciesViewProps) {
  const [tab, setTab] = useState<Tab>("MATRIX");

  return (
    <div className="space-y-5">
      <nav
        aria-label="Seções de competências"
        className="flex flex-wrap items-center gap-2"
      >
        {tabOrder.map((value) => (
          <FilterChip
            key={value}
            label={tabLabels[value]}
            active={tab === value}
            onClick={() => setTab(value)}
          />
        ))}
      </nav>

      {tab === "MATRIX" ? (
        <CompetencyGapMatrix matrix={matrix} teamGap={teamGap} />
      ) : null}
      {tab === "CATALOG" ? (
        <SkillCatalogManager catalog={catalog} canManage={canManage} />
      ) : null}
      {tab === "PROFILES" ? (
        <CompetencyProfilesManager
          profiles={profiles}
          skillOptions={skillOptions}
          canManage={canManage}
        />
      ) : null}
    </div>
  );
}
