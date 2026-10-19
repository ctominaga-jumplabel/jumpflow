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
  bundle: CoeCompositionBundle;
  query: CoeCompositionQueryInput;
  /** RBAC resolvido no servidor: pode curar o núcleo. */
  canCurate: boolean;
  /** RBAC resolvido no servidor: pode salvar propostas de time. */
  canPropose: boolean;
}

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
}: CoeViewProps) {
  const [tab, setTab] = useState<Tab>("OVERVIEW");
  const activeMembers = members.filter((m) => m.active);

  const tabCounts: Record<Tab, number | undefined> = {
    OVERVIEW: undefined,
    COMPOSITION: bundle.composition.assignments.length || undefined,
    NUCLEUS: activeMembers.length || undefined,
    SQUADS: squads.length || undefined,
  };

  return (
    <div className="space-y-5">
      <nav
        aria-label="Seções do COE"
        className="flex flex-wrap items-center gap-2"
      >
        {TABS.map((value) => (
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
          onCompose={() => setTab("COMPOSITION")}
        />
      ) : null}
      {tab === "COMPOSITION" ? (
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
