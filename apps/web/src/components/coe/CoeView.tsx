"use client";

import { useState } from "react";
import { FilterChip } from "@/components/ui/FilterChip";
import { CoeNucleusPanel } from "@/components/coe/CoeNucleusPanel";
import { CoeOverviewPanel } from "@/components/coe/CoeOverviewPanel";
import { CoeCompositionPanel } from "@/components/coe/CoeCompositionPanel";
import { CoeSquadsPanel } from "@/components/coe/CoeSquadsPanel";
import type { CoeCompositionQueryInput } from "@/lib/coe/schemas";
import type {
  AllocationProjectOption,
  AllocationSkillOption,
} from "@/lib/allocation-ai/types";
import type {
  CoeCandidateOption,
  CoeCompositionBundle,
  CoeMemberView,
  CoeSquadView,
} from "@/lib/coe/types";

type Tab = "OVERVIEW" | "COMPOSITION" | "NUCLEUS" | "SQUADS";

const TABS: Tab[] = ["OVERVIEW", "COMPOSITION", "SQUADS", "NUCLEUS"];

const tabLabels: Record<Tab, string> = {
  OVERVIEW: "Visão geral",
  COMPOSITION: "Composição de time",
  NUCLEUS: "Curadoria",
  SQUADS: "Propostas salvas",
};

export interface CoeViewProps {
  members: CoeMemberView[];
  candidateOptions: CoeCandidateOption[];
  projects: AllocationProjectOption[];
  skillOptions: AllocationSkillOption[];
  squads: CoeSquadView[];
  /** `null` quando a subtela de composição não está liberada pela matriz. */
  bundle: CoeCompositionBundle | null;
  query: CoeCompositionQueryInput;
  /** RBAC resolvido no servidor: pode curar o núcleo. */
  canCurate: boolean;
  /** RBAC resolvido no servidor: pode salvar propostas de time. */
  canPropose: boolean;
  /**
   * Subtelas liberadas pela matriz (resolvido no servidor). A visão geral é
   * governada pelo código da tela e está sempre presente. Omitido = todas.
   */
  allowedTabs?: CoeAllowedTabs;
}

export interface CoeAllowedTabs {
  composition: boolean;
  proposals: boolean;
  curation: boolean;
}

const ALL_TABS_ALLOWED: CoeAllowedTabs = {
  composition: true,
  proposals: true,
  curation: true,
};

/**
 * Casca do COE. Abre na VISÃO GERAL — as referências da Jump por área de
 * excelência, para indicar alguém a um projeto ou saber a quem recorrer numa
 * dúvida interna. A composição de time é o aprofundamento para um projeto
 * específico; as propostas são o histórico e a curadoria é o cadastro que
 * alimenta tudo.
 *
 * Os flags de permissão vêm resolvidos do servidor e só governam o que aparece —
 * a fronteira real está nas server actions, que checam papel a cada escrita.
 */
export function CoeView({
  members,
  candidateOptions,
  projects,
  skillOptions,
  squads,
  bundle,
  query,
  canCurate,
  canPropose,
  allowedTabs = ALL_TABS_ALLOWED,
}: CoeViewProps) {
  const [selectedTab, setTab] = useState<Tab>("OVERVIEW");
  const tabAllowed: Record<Tab, boolean> = {
    OVERVIEW: true,
    COMPOSITION: allowedTabs.composition && bundle !== null,
    SQUADS: allowedTabs.proposals,
    NUCLEUS: allowedTabs.curation,
  };
  const visibleTabs = TABS.filter((value) => tabAllowed[value]);
  // Aba negada nunca fica ativa: cai na visão geral.
  const tab: Tab = tabAllowed[selectedTab] ? selectedTab : "OVERVIEW";
  const activeMembers = members.filter((m) => m.active);

  const tabCounts: Record<Tab, number | undefined> = {
    OVERVIEW: undefined,
    COMPOSITION: bundle?.composition.assignments.length || undefined,
    NUCLEUS: activeMembers.length || undefined,
    SQUADS: squads.length || undefined,
  };

  return (
    <div className="space-y-5">
      <nav
        aria-label="Seções do COE"
        className="flex flex-wrap items-center gap-2"
      >
        {visibleTabs.map((value) => (
          <FilterChip
            key={value}
            label={tabLabels[value]}
            count={tabCounts[value]}
            active={tab === value}
            onClick={() => setTab(value)}
          />
        ))}
      </nav>

      {tab === "OVERVIEW" ? (
        <CoeOverviewPanel
          members={members}
          onCompose={
            tabAllowed.COMPOSITION ? () => setTab("COMPOSITION") : undefined
          }
        />
      ) : null}
      {tab === "COMPOSITION" && bundle ? (
        <CoeCompositionPanel
          bundle={bundle}
          query={query}
          projects={projects}
          skillOptions={skillOptions}
          canPropose={canPropose}
        />
      ) : null}
      {tab === "NUCLEUS" ? (
        <CoeNucleusPanel
          members={members}
          candidateOptions={candidateOptions}
          canCurate={canCurate}
        />
      ) : null}
      {tab === "SQUADS" ? (
        <CoeSquadsPanel squads={squads} canPropose={canPropose} />
      ) : null}
    </div>
  );
}
