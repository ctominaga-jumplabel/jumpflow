import { TriangleAlert, ShieldCheck } from "lucide-react";
import { SectionPanel } from "@/components/ui/SectionPanel";
import { StatusBadge } from "@/components/ui/StatusBadge";
import {
  coverageGaps,
  hasSeniorCoverage,
  skillCoverage,
  type Skill,
} from "@/lib/mock-data/skills";

export interface SkillCoveragePanelProps {
  skills: Skill[];
  minCoverage?: number;
}

/**
 * Highlights skills that need attention: thin overall coverage or no
 * senior-capable bench (advanced/specialist). Worst-covered first.
 */
export function SkillCoveragePanel({
  skills,
  minCoverage = 2,
}: SkillCoveragePanelProps) {
  const gaps = coverageGaps(skills, minCoverage);

  return (
    <SectionPanel
      title="Gaps de cobertura"
      description="Skills com pouca cobertura ou sem nível sênior."
    >
      {gaps.length === 0 ? (
        <div className="flex items-center gap-3 px-5 py-6 text-sm text-medium">
          <span className="grid size-8 place-items-center rounded-md bg-success-soft text-success">
            <ShieldCheck aria-hidden="true" className="size-4" />
          </span>
          Todas as skills têm cobertura adequada.
        </div>
      ) : (
        <ul className="divide-y divide-border">
          {gaps.map((skill) => {
            const coverage = skillCoverage(skill);
            const noSenior = !hasSeniorCoverage(skill);
            return (
              <li
                key={skill.id}
                className="flex items-start gap-3 px-5 py-3.5"
              >
                <span className="mt-0.5 grid size-8 shrink-0 place-items-center rounded-md bg-warning-soft text-warning">
                  <TriangleAlert aria-hidden="true" className="size-4" />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium text-strong">
                    {skill.name}
                  </p>
                  <p className="text-xs text-soft">{skill.category}</p>
                </div>
                <div className="flex shrink-0 flex-col items-end gap-1">
                  <StatusBadge tone={coverage <= 1 ? "danger" : "warning"}>
                    {coverage} {coverage === 1 ? "consultor" : "consultores"}
                  </StatusBadge>
                  {noSenior ? (
                    <span className="text-xs text-soft">Sem sênior</span>
                  ) : null}
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </SectionPanel>
  );
}
