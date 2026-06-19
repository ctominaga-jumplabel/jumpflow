import {
  skillLevelWeight,
  type CompetencyMatrix,
  type CompetencyScope,
  type GapStatus,
  type MatrixCell,
  type MatrixConsultantRow,
  type MatrixSkillColumn,
  type SkillLevel,
  type SkillType,
  type TeamGapRow,
} from "./types";

/**
 * Pure domain logic for competency profile resolution and gap analysis.
 *
 * No I/O: callers (matrix read, future PDI, evaluation) pass plain rows and get
 * back the resolved profile / gap. Reusable per docs/backlog-talentos.md
 * US13.03 (resolução de perfil) and US14.02 (gap por consultor).
 */

// ── Resolução de perfil aplicável (US13.03) ────────────────────────────────

/**
 * DP-02 — Precedência de escopo ao resolver o perfil aplicável a um consultor.
 *
 * Decisão (mais específico primeiro): ROLE > SENIORITY > AREA.
 * Racional: o cargo (role/jobTitle) é a referência mais específica do que se
 * espera de uma pessoa; a senioridade refina dentro do cargo; a área é a mais
 * ampla. Quando o consultor casa com perfis de mais de um escopo, vence o de
 * maior precedência. Documentado aqui por ser a fonte da verdade do domínio.
 */
export const SCOPE_PRECEDENCE: CompetencyScope[] = ["ROLE", "SENIORITY", "AREA"];

export interface ResolvableProfile {
  id: string;
  name: string;
  scope: CompetencyScope;
  /** Chave lógica normalizada em MAIÚSCULAS (ver schema). */
  referenceKey: string;
  status: "ACTIVE" | "INACTIVE";
}

export interface ResolvableConsultant {
  seniority: string;
  area: string | null;
  jobTitle: string | null;
}

/** Normaliza um valor do consultor para casar com referenceKey (MAIÚSCULAS). */
function normalizeKey(value: string | null | undefined): string | null {
  if (!value) return null;
  const trimmed = value.trim();
  return trimmed.length === 0 ? null : trimmed.toUpperCase();
}

/** O valor do consultor que casa com um dado escopo. */
function consultantKeyForScope(
  consultant: ResolvableConsultant,
  scope: CompetencyScope,
): string | null {
  switch (scope) {
    case "ROLE":
      return normalizeKey(consultant.jobTitle);
    case "SENIORITY":
      return normalizeKey(consultant.seniority);
    case "AREA":
      return normalizeKey(consultant.area);
  }
}

/**
 * Resolve o perfil de competência aplicável a um consultor entre os perfis
 * ATIVOS fornecidos, respeitando a precedência DP-02 (ROLE > SENIORITY > AREA).
 * Retorna null quando nenhum perfil ativo casa — o chamador trata como gap
 * indefinido (mensagem clara), não como erro (US13.03).
 */
export function resolveApplicableProfile(
  consultant: ResolvableConsultant,
  profiles: ReadonlyArray<ResolvableProfile>,
): ResolvableProfile | null {
  const active = profiles.filter((p) => p.status === "ACTIVE");
  for (const scope of SCOPE_PRECEDENCE) {
    const key = consultantKeyForScope(consultant, scope);
    if (!key) continue;
    const match = active.find((p) => p.scope === scope && p.referenceKey === key);
    if (match) return match;
  }
  return null;
}

// ── Cálculo de gap por célula (US14.02) ─────────────────────────────────────

/**
 * Classifica e calcula o gap de uma skill para um consultor.
 * - Sem perfil aplicável → NO_PROFILE (gap indefinido).
 * - Skill fora do perfil (sem requiredLevel) → não é lacuna: MEETS sem gap.
 * - Sem ConsultantSkill → NOT_ASSESSED (distinto de nível zero).
 * - Caso contrário gap = pesoRequerido - pesoAtual (positivo = lacuna).
 */
export function computeCell(
  skillId: string,
  requiredLevel: SkillLevel | null,
  currentLevel: SkillLevel | null,
  hasProfile: boolean,
): MatrixCell {
  if (!hasProfile) {
    return {
      skillId,
      requiredLevel,
      currentLevel,
      gap: null,
      status: "NO_PROFILE",
    };
  }
  if (requiredLevel === null) {
    // A skill não faz parte do perfil aplicável: não há lacuna a cobrar.
    return {
      skillId,
      requiredLevel: null,
      currentLevel,
      gap: null,
      status: "MEETS",
    };
  }
  if (currentLevel === null) {
    return {
      skillId,
      requiredLevel,
      currentLevel: null,
      gap: null,
      status: "NOT_ASSESSED",
    };
  }
  const gap = skillLevelWeight(requiredLevel) - skillLevelWeight(currentLevel);
  const status: GapStatus = gap > 0 ? "GAP" : "MEETS";
  return { skillId, requiredLevel, currentLevel, gap, status };
}

// ── Agregação por time (US14.03) ────────────────────────────────────────────

/**
 * Agrega o gap por skill ao longo das linhas da matriz para a visão de time.
 * Considera apenas células avaliadas com requerido definido (GAP ou MEETS com
 * gap numérico). Ordena por maior gap médio, depois por mais consultores abaixo.
 */
export function aggregateTeamGap(
  rows: ReadonlyArray<MatrixConsultantRow>,
  columns: ReadonlyArray<MatrixSkillColumn>,
): TeamGapRow[] {
  const bySkill = new Map<
    string,
    { below: number; assessed: number; gapSum: number; column: MatrixSkillColumn }
  >();
  for (const col of columns) {
    bySkill.set(col.skillId, {
      below: 0,
      assessed: 0,
      gapSum: 0,
      column: col,
    });
  }
  for (const row of rows) {
    for (const cell of row.cells) {
      if (cell.gap === null) continue; // NOT_ASSESSED / NO_PROFILE / fora do perfil
      const acc = bySkill.get(cell.skillId);
      if (!acc) continue;
      acc.assessed += 1;
      acc.gapSum += cell.gap;
      if (cell.gap > 0) acc.below += 1;
    }
  }
  return [...bySkill.values()]
    .filter((acc) => acc.assessed > 0)
    .map((acc) => ({
      skillId: acc.column.skillId,
      skillName: acc.column.skillName,
      skillType: acc.column.skillType,
      belowCount: acc.below,
      assessedCount: acc.assessed,
      averageGap: acc.gapSum / acc.assessed,
    }))
    .sort(
      (a, b) =>
        b.averageGap - a.averageGap ||
        b.belowCount - a.belowCount ||
        a.skillName.localeCompare(b.skillName, "pt-BR"),
    );
}

/** Filtra a matriz por tipo de skill (mantém só as colunas/células do tipo). */
export function filterMatrixByType(
  matrix: CompetencyMatrix,
  type: SkillType | "ALL",
): CompetencyMatrix {
  if (type === "ALL") return matrix;
  const skills = matrix.skills.filter((s) => s.skillType === type);
  const keep = new Set(skills.map((s) => s.skillId));
  return {
    skills,
    consultants: matrix.consultants.map((row) => ({
      ...row,
      cells: row.cells.filter((c) => keep.has(c.skillId)),
    })),
  };
}
