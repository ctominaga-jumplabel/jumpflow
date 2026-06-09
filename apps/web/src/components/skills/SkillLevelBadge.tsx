import { StatusBadge, type StatusTone } from "@/components/ui/StatusBadge";
import { skillLevelLabels, type SkillLevel } from "@/lib/mock-data/skills";

const toneByLevel: Record<SkillLevel, StatusTone> = {
  BASIC: "neutral",
  INTERMEDIATE: "info",
  ADVANCED: "success",
  SPECIALIST: "warning",
};

export interface SkillLevelBadgeProps {
  level: SkillLevel;
  /** Optional count suffix (e.g. "Avançado · 3"). */
  count?: number;
}

/** Pill for a skill proficiency level. */
export function SkillLevelBadge({ level, count }: SkillLevelBadgeProps) {
  return (
    <StatusBadge tone={toneByLevel[level]}>
      {skillLevelLabels[level]}
      {typeof count === "number" ? ` · ${count}` : ""}
    </StatusBadge>
  );
}
