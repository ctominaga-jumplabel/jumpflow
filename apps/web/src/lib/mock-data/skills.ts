/**
 * Mocked skills catalog + coverage for the MVP "Skills" module.
 *
 * NOTE: not connected to the database yet. Shapes mirror `Skill` /
 * `ConsultantSkill` in docs/modelo-dados.md (catalog skill with a level
 * distribution across consultants). Skill ids match consultants.ts topSkills.
 */

export type SkillLevel = "BASIC" | "INTERMEDIATE" | "ADVANCED" | "SPECIALIST";

export const skillLevelLabels: Record<SkillLevel, string> = {
  BASIC: "Básico",
  INTERMEDIATE: "Intermediário",
  ADVANCED: "Avançado",
  SPECIALIST: "Especialista",
};

/** Ordered for matrix columns / averages (low → high). */
export const skillLevelOrder: SkillLevel[] = [
  "BASIC",
  "INTERMEDIATE",
  "ADVANCED",
  "SPECIALIST",
];

export interface Skill {
  id: string;
  name: string;
  category: string;
  /** Number of consultants declaring this skill at each level. */
  levels: Record<SkillLevel, number>;
}

export const skills: Skill[] = [
  {
    id: "sk-react",
    name: "React",
    category: "Frontend",
    levels: { BASIC: 1, INTERMEDIATE: 2, ADVANCED: 3, SPECIALIST: 1 },
  },
  {
    id: "sk-typescript",
    name: "TypeScript",
    category: "Frontend",
    levels: { BASIC: 2, INTERMEDIATE: 3, ADVANCED: 2, SPECIALIST: 0 },
  },
  {
    id: "sk-ux",
    name: "UX Research",
    category: "Produto",
    levels: { BASIC: 1, INTERMEDIATE: 1, ADVANCED: 1, SPECIALIST: 0 },
  },
  {
    id: "sk-discovery",
    name: "Discovery",
    category: "Produto",
    levels: { BASIC: 0, INTERMEDIATE: 2, ADVANCED: 1, SPECIALIST: 1 },
  },
  {
    id: "sk-node",
    name: "Node.js",
    category: "Backend",
    levels: { BASIC: 1, INTERMEDIATE: 2, ADVANCED: 2, SPECIALIST: 1 },
  },
  {
    id: "sk-python",
    name: "Python",
    category: "Backend",
    levels: { BASIC: 0, INTERMEDIATE: 1, ADVANCED: 3, SPECIALIST: 1 },
  },
  {
    id: "sk-sql",
    name: "SQL",
    category: "Dados",
    levels: { BASIC: 1, INTERMEDIATE: 3, ADVANCED: 2, SPECIALIST: 0 },
  },
  {
    id: "sk-airflow",
    name: "Airflow",
    category: "Dados",
    levels: { BASIC: 1, INTERMEDIATE: 0, ADVANCED: 1, SPECIALIST: 0 },
  },
  {
    id: "sk-ml",
    name: "Machine Learning",
    category: "Dados",
    levels: { BASIC: 1, INTERMEDIATE: 1, ADVANCED: 1, SPECIALIST: 0 },
  },
  {
    id: "sk-aws",
    name: "AWS",
    category: "Cloud",
    levels: { BASIC: 0, INTERMEDIATE: 1, ADVANCED: 2, SPECIALIST: 2 },
  },
  {
    id: "sk-azure",
    name: "Azure",
    category: "Cloud",
    levels: { BASIC: 1, INTERMEDIATE: 1, ADVANCED: 1, SPECIALIST: 0 },
  },
  {
    id: "sk-terraform",
    name: "Terraform",
    category: "Cloud",
    levels: { BASIC: 1, INTERMEDIATE: 0, ADVANCED: 0, SPECIALIST: 1 },
  },
];

/** Total consultants declaring a skill (sum across levels). */
export function skillCoverage(skill: Skill): number {
  return skillLevelOrder.reduce((sum, lvl) => sum + skill.levels[lvl], 0);
}

/** Whether a skill has a senior-capable bench (advanced or specialist). */
export function hasSeniorCoverage(skill: Skill): boolean {
  return skill.levels.ADVANCED + skill.levels.SPECIALIST > 0;
}

export interface SkillCategoryGroup {
  category: string;
  skills: Skill[];
}

/** Group skills by category for the matrix, sorted alphabetically. */
export function groupSkillsByCategory(list: Skill[]): SkillCategoryGroup[] {
  const map = new Map<string, Skill[]>();
  for (const s of list) {
    const arr = map.get(s.category) ?? [];
    arr.push(s);
    map.set(s.category, arr);
  }
  return [...map.entries()]
    .map(([category, skills]) => ({
      category,
      skills: skills.sort((a, b) => a.name.localeCompare(b.name, "pt-BR")),
    }))
    .sort((a, b) => a.category.localeCompare(b.category, "pt-BR"));
}

/**
 * Coverage gaps: skills with thin overall coverage (< minCoverage consultants)
 * or no senior-capable bench. Sorted by coverage ascending (worst first).
 */
export function coverageGaps(list: Skill[], minCoverage = 2): Skill[] {
  return list
    .filter((s) => skillCoverage(s) < minCoverage || !hasSeniorCoverage(s))
    .sort((a, b) => skillCoverage(a) - skillCoverage(b));
}
