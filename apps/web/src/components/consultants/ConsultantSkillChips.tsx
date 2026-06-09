import type { ConsultantSkillTag } from "@/lib/mock-data/consultants";

export interface ConsultantSkillChipsProps {
  skills: ConsultantSkillTag[];
  /** Max chips to render before collapsing the rest into "+N". */
  max?: number;
}

/** Compact skill tags for a consultant card. */
export function ConsultantSkillChips({
  skills,
  max = 4,
}: ConsultantSkillChipsProps) {
  const shown = skills.slice(0, max);
  const remaining = skills.length - shown.length;

  return (
    <ul className="flex flex-wrap gap-1.5">
      {shown.map((skill) => (
        <li
          key={skill.skillId}
          className="rounded-md border border-border bg-surface-muted px-2 py-0.5 text-xs font-medium text-medium"
        >
          {skill.name}
        </li>
      ))}
      {remaining > 0 ? (
        <li className="rounded-md border border-border bg-surface px-2 py-0.5 text-xs font-medium text-soft">
          +{remaining}
        </li>
      ) : null}
    </ul>
  );
}
