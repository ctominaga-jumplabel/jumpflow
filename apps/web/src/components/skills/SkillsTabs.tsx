"use client";

import { useState, type ReactNode } from "react";
import { FilterChip } from "@/components/ui/FilterChip";
import { MyCurriculumTab } from "@/components/skills/MyCurriculumTab";

type Tab = "SKILLS" | "CURRICULUM" | "CATALOG";

const tabLabels: Record<Tab, string> = {
  SKILLS: "Skills",
  CURRICULUM: "Meu Currículo",
  CATALOG: "Catálogo",
};

/**
 * Abas da tela /app/skills. A aba "Skills" recebe o conteudo ja renderizado no
 * servidor (matriz + sugestoes + cobertura) via prop `skillsContent`, mantendo
 * a busca de dados no server component da page. A aba "Meu Curriculo" e
 * totalmente client (carrega o proprio curriculo sob demanda por server action
 * de escopo de dono) e recebe o gate da leitura de currículo por IA. A aba
 * "Catálogo" (gerenciamento de skills) só aparece quando `catalogContent` é
 * fornecido — a page só passa esse conteúdo para quem tem permissão de escrita.
 * Mantem o conteudo de Skills montado para preservar o estado ao alternar as
 * abas.
 */
export function SkillsTabs({
  skillsContent,
  catalogContent,
  aiImportEnabled = false,
}: {
  skillsContent: ReactNode;
  catalogContent?: ReactNode;
  aiImportEnabled?: boolean;
}) {
  const [tab, setTab] = useState<Tab>("SKILLS");

  const tabOrder: Tab[] = catalogContent
    ? ["SKILLS", "CURRICULUM", "CATALOG"]
    : ["SKILLS", "CURRICULUM"];

  return (
    <div className="space-y-5">
      <nav
        aria-label="Seções de skills"
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

      <div hidden={tab !== "SKILLS"}>{skillsContent}</div>
      {tab === "CURRICULUM" ? (
        <MyCurriculumTab aiImportEnabled={aiImportEnabled} />
      ) : null}
      {tab === "CATALOG" && catalogContent ? <div>{catalogContent}</div> : null}
    </div>
  );
}
