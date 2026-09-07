"use client";

import { useState } from "react";
import { FilterChip } from "@/components/ui/FilterChip";
import { CoeNucleusPanel } from "@/components/coe/CoeNucleusPanel";
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

type Tab = "COMPOSITION" | "NUCLEUS" | "SQUADS";

const tabLabels: Record<Tab, string> = {
  COMPOSITION: "Composição de time",
  NUCLEUS: "Núcleo",
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
 * Casca do COE com as três superfícies da tela. A composição abre primeiro
 * porque é o trabalho do dia a dia; a curadoria do núcleo é o cadastro que a
 * alimenta e as propostas são o histórico.
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
  const [tab, setTab] = useState<Tab>("COMPOSITION");
  const activeMembers = members.filter((m) => m.active);

  const tabCounts: Record<Tab, number | undefined> = {
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
        {(["COMPOSITION", "NUCLEUS", "SQUADS"] as Tab[]).map((value) => (
          <FilterChip
            key={value}
            label={tabLabels[value]}
            count={tabCounts[value]}
            active={tab === value}
            onClick={() => setTab(value)}
          />
        ))}
      </nav>

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
