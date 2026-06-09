"use client";

import { useMemo, useState } from "react";
import { GraduationCap } from "lucide-react";
import { DataToolbar } from "@/components/ui/DataToolbar";
import { FilterChip } from "@/components/ui/FilterChip";
import { SectionPanel } from "@/components/ui/SectionPanel";
import { EmptyState } from "@/components/ui/EmptyState";
import { StatusBadge } from "@/components/ui/StatusBadge";
import {
  skillCoverage,
  skillLevelLabels,
  skillLevelOrder,
  skills as allSkills,
  type Skill,
  type SkillLevel,
} from "@/lib/mock-data/skills";

const levelBar: Record<SkillLevel, string> = {
  BASIC: "bg-surface-muted",
  INTERMEDIATE: "bg-brand",
  ADVANCED: "bg-success",
  SPECIALIST: "bg-marker",
};

export interface SkillMatrixProps {
  skills?: Skill[];
}

/**
 * Skill matrix: one row per skill with coverage count and a stacked level
 * distribution bar. Filterable by category. Levels: básico → especialista.
 */
export function SkillMatrix({ skills = allSkills }: SkillMatrixProps) {
  const [category, setCategory] = useState<string>("ALL");

  const categories = useMemo(
    () =>
      [...new Set(skills.map((s) => s.category))].sort((a, b) =>
        a.localeCompare(b, "pt-BR"),
      ),
    [skills],
  );

  const rows = useMemo(
    () =>
      (category === "ALL"
        ? skills
        : skills.filter((s) => s.category === category)
      )
        .slice()
        .sort((a, b) => skillCoverage(b) - skillCoverage(a)),
    [skills, category],
  );

  return (
    <div className="space-y-4">
      <DataToolbar
        filters={
          <>
            <FilterChip
              label="Todas"
              active={category === "ALL"}
              onClick={() => setCategory("ALL")}
            />
            {categories.map((c) => (
              <FilterChip
                key={c}
                label={c}
                active={category === c}
                onClick={() => setCategory(c)}
              />
            ))}
          </>
        }
        actions={
          <ul className="flex flex-wrap items-center gap-2">
            {skillLevelOrder.map((level) => (
              <li key={level} className="flex items-center gap-1.5 text-xs text-soft">
                <span
                  className={`size-2.5 rounded-sm ${levelBar[level]} ring-1 ring-ink/20`}
                  aria-hidden="true"
                />
                {skillLevelLabels[level]}
              </li>
            ))}
          </ul>
        }
      />

      <SectionPanel
        title="Matriz de skills"
        description={`${rows.length} ${rows.length === 1 ? "skill" : "skills"} · distribuição por nível`}
      >
        {rows.length === 0 ? (
          <div className="px-5 py-10">
            <EmptyState
              icon={GraduationCap}
              title="Nenhuma skill nesta categoria"
              description="Selecione outra categoria para ver a matriz."
            />
          </div>
        ) : (
          <ul className="divide-y divide-border">
            {rows.map((skill) => {
              const coverage = skillCoverage(skill);
              return (
                <li key={skill.id} className="px-5 py-3.5">
                  <div className="flex items-center justify-between gap-3">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium text-strong">
                        {skill.name}
                      </p>
                      <p className="text-xs text-soft">{skill.category}</p>
                    </div>
                    <StatusBadge tone={coverage <= 1 ? "warning" : "neutral"}>
                      {coverage} {coverage === 1 ? "consultor" : "consultores"}
                    </StatusBadge>
                  </div>
                  <div
                    className="mt-2 flex h-2 overflow-hidden rounded-full bg-surface-muted"
                    role="img"
                    aria-label={skillLevelOrder
                      .map(
                        (lvl) =>
                          `${skillLevelLabels[lvl]}: ${skill.levels[lvl]}`,
                      )
                      .join(", ")}
                  >
                    {skillLevelOrder.map((level) =>
                      skill.levels[level] > 0 ? (
                        <div
                          key={level}
                          className={levelBar[level]}
                          style={{
                            width: `${(skill.levels[level] / Math.max(coverage, 1)) * 100}%`,
                          }}
                        />
                      ) : null,
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </SectionPanel>
    </div>
  );
}
