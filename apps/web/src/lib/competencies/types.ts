/**
 * Shared, pure types for the Competências (Talentos — Onda 0) module.
 *
 * No server-only imports so these are safe to import from client components,
 * schemas and tests. Mirrors the Prisma models `Skill` (+ `type`),
 * `CompetencyProfile`, `CompetencyProfileItem`, `ConsultantSkill` and the
 * derived gap read-model. See docs/backlog-talentos.md EP12/EP13/EP14.
 */

export type SkillLevel = "BASIC" | "INTERMEDIATE" | "ADVANCED" | "SPECIALIST";
export type SkillType = "TECHNICAL" | "BEHAVIORAL";
export type SkillStatus = "ACTIVE" | "INACTIVE";
export type CompetencyScope = "SENIORITY" | "ROLE" | "AREA";

export const skillLevelLabels: Record<SkillLevel, string> = {
  BASIC: "Básico",
  INTERMEDIATE: "Intermediário",
  ADVANCED: "Avançado",
  SPECIALIST: "Especialista",
};

/** Ordered low → high. Index doubles as the numeric weight for gap math. */
export const skillLevelOrder: SkillLevel[] = [
  "BASIC",
  "INTERMEDIATE",
  "ADVANCED",
  "SPECIALIST",
];

export const skillTypeLabels: Record<SkillType, string> = {
  TECHNICAL: "Técnica",
  BEHAVIORAL: "Comportamental",
};

export const skillStatusLabels: Record<SkillStatus, string> = {
  ACTIVE: "Ativa",
  INACTIVE: "Inativa",
};

export const competencyScopeLabels: Record<CompetencyScope, string> = {
  SENIORITY: "Senioridade",
  ROLE: "Cargo",
  AREA: "Área",
};

/** Numeric weight of a level (0..3), used to compute gaps. */
export function skillLevelWeight(level: SkillLevel): number {
  return skillLevelOrder.indexOf(level);
}

// ── Catálogo (EP12) ──────────────────────────────────────────────────────

export interface SkillCatalogItem {
  id: string;
  name: string;
  category: string | null;
  type: SkillType;
  status: SkillStatus;
  /** Consultores que declaram esta skill (qualquer nível/validação). */
  consultantCount: number;
  /** Perfis de competência que referenciam esta skill. */
  profileItemCount: number;
}

// ── Perfis de competência (EP13) ───────────────────────────────────────────

export interface CompetencyProfileItemView {
  id: string;
  skillId: string;
  skillName: string;
  skillType: SkillType;
  requiredLevel: SkillLevel;
}

export interface CompetencyProfileView {
  id: string;
  name: string;
  scope: CompetencyScope;
  referenceKey: string;
  status: SkillStatus;
  items: CompetencyProfileItemView[];
}

/** Lightweight skill option for selects (catálogo ativo). */
export interface SkillOption {
  id: string;
  name: string;
  category: string | null;
  type: SkillType;
}

// ── Matriz com gap (EP14) ──────────────────────────────────────────────────

export type GapStatus =
  | "GAP" // atual < requerido
  | "MEETS" // atual >= requerido
  | "NOT_ASSESSED" // sem ConsultantSkill
  | "NO_PROFILE"; // consultor sem perfil aplicável

export interface MatrixCell {
  skillId: string;
  requiredLevel: SkillLevel | null;
  currentLevel: SkillLevel | null;
  /** requiredWeight - currentWeight (positivo = lacuna); null se indefinido. */
  gap: number | null;
  status: GapStatus;
}

export interface MatrixConsultantRow {
  consultantId: string;
  consultantName: string;
  seniority: string;
  area: string | null;
  jobTitle: string | null;
  /** Perfil aplicável resolvido, ou null se nenhum. */
  profileId: string | null;
  profileName: string | null;
  cells: MatrixCell[];
}

export interface MatrixSkillColumn {
  skillId: string;
  skillName: string;
  skillType: SkillType;
}

export interface CompetencyMatrix {
  skills: MatrixSkillColumn[];
  consultants: MatrixConsultantRow[];
}

/** Agregado por skill para a visão de time (EP14 US14.03). */
export interface TeamGapRow {
  skillId: string;
  skillName: string;
  skillType: SkillType;
  /** Consultores abaixo do requerido nesta skill. */
  belowCount: number;
  /** Consultores avaliados (com ConsultantSkill) e com perfil aplicável. */
  assessedCount: number;
  /** Gap médio (somente entre consultores avaliados com requerido definido). */
  averageGap: number;
}
