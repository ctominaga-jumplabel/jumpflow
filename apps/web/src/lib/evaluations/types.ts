/**
 * Shared, pure types for the Avaliação de Desempenho module (EP16).
 *
 * No server-only imports so these are safe to import from client components,
 * schemas and tests. Mirrors the Prisma models `EvaluationCycle`, `Evaluation`,
 * `EvaluationResponse` and `EvaluationAnswer`. The radar/gap/history read-models
 * are derived shapes. See docs/backlog-talentos.md EP16 and
 * docs/roadmap-talentos-gcpec.md §6.2.
 */

export type EvaluationType = "SELF_90" | "MANAGER_180" | "FULL_360";
export type EvaluationCycleStatus = "DRAFT" | "OPEN" | "CLOSED";
export type EvaluationStatus = "PENDING" | "IN_PROGRESS" | "COMPLETED";
export type EvaluationRelationship =
  | "SELF"
  | "MANAGER"
  | "PEER"
  | "CLIENT"
  | "SUBORDINATE";

export const evaluationTypeLabels: Record<EvaluationType, string> = {
  SELF_90: "Autoavaliação (90°)",
  MANAGER_180: "Gestor + autoavaliação (180°)",
  FULL_360: "Avaliação completa (360°)",
};

export const evaluationCycleStatusLabels: Record<EvaluationCycleStatus, string> =
  {
    DRAFT: "Rascunho",
    OPEN: "Aberto",
    CLOSED: "Fechado",
  };

export const evaluationStatusLabels: Record<EvaluationStatus, string> = {
  PENDING: "Pendente",
  IN_PROGRESS: "Em andamento",
  COMPLETED: "Concluída",
};

export const evaluationRelationshipLabels: Record<
  EvaluationRelationship,
  string
> = {
  SELF: "Autoavaliação",
  MANAGER: "Gestor",
  PEER: "Par",
  CLIENT: "Cliente",
  SUBORDINATE: "Liderado",
};

// ── Ciclos (US16.01) ────────────────────────────────────────────────────────

/** Cycle summary for the management list. */
export interface EvaluationCycleSummary {
  id: string;
  name: string;
  type: EvaluationType;
  status: EvaluationCycleStatus;
  periodStart: string;
  periodEnd: string;
  /** Quantidade de avaliados (Evaluation) já geradas no ciclo. */
  evaluationCount: number;
  /** Avaliações concluídas (todas as respostas submetidas). */
  completedCount: number;
}

// ── Caixa de entrada do avaliador (US16.03) ─────────────────────────────────

/** Skill a ser pontuada no formulário (derivada do perfil aplicável). */
export interface EvaluationFormSkill {
  skillId: string;
  skillName: string;
  skillType: "TECHNICAL" | "BEHAVIORAL";
}

/** Resposta atribuída ao avaliador atual (uma EvaluationResponse). */
export interface EvaluationAssignment {
  responseId: string;
  evaluationId: string;
  cycleId: string;
  cycleName: string;
  cycleStatus: EvaluationCycleStatus;
  relationship: EvaluationRelationship;
  status: EvaluationStatus;
  submittedAt: string | null;
  subjectConsultantId: string;
  subjectConsultantName: string;
  /** Skills do formulário (perfil aplicável ao avaliado). */
  skills: EvaluationFormSkill[];
  /** Respostas já preenchidas por skill (score/comentário). */
  answers: Record<string, { score: number; comment: string | null }>;
}

// ── Resultado: radar, gap, histórico (US16.04 / US16.05) ────────────────────

/** Média por competência consolidando todos os avaliadores (anonimizado). */
export interface RadarAxis {
  skillId: string;
  skillName: string;
  skillType: "TECHNICAL" | "BEHAVIORAL";
  /** Média de score (1-5) entre todas as respostas submetidas. */
  averageScore: number;
  /** Quantidade de notas que compuseram a média. */
  sampleCount: number;
}

/** Linha do gap: score médio convertido × nível requerido do perfil. */
export interface EvaluationGapRow {
  skillId: string;
  skillName: string;
  skillType: "TECHNICAL" | "BEHAVIORAL";
  /** Média de score (1-5) avaliada para a skill. */
  averageScore: number;
  /** Peso equivalente da média na escala de nível (0-3). */
  assessedWeight: number;
  /** Nível requerido (peso 0-3) do perfil aplicável, ou null se fora do perfil. */
  requiredWeight: number | null;
  /** requiredWeight - assessedWeight (positivo = lacuna); null se sem requerido. */
  gap: number | null;
  status: "GAP" | "MEETS" | "NO_REQUIREMENT";
}

/** Resultado consolidado de uma avaliação fechada. */
export interface EvaluationResult {
  evaluationId: string;
  cycleId: string;
  cycleName: string;
  cycleType: EvaluationType;
  cycleStatus: EvaluationCycleStatus;
  periodEnd: string;
  subjectConsultantId: string;
  subjectConsultantName: string;
  /** Perfil aplicável resolvido (US13.03), ou null. */
  profileName: string | null;
  radar: RadarAxis[];
  gap: EvaluationGapRow[];
  /**
   * Quantos avaliadores submeteram, por relacionamento. Agregado (anonimato de
   * peer — DP-05): nunca expõe a resposta individual de um par.
   */
  raterCountByRelationship: Partial<Record<EvaluationRelationship, number>>;
}

/** Série histórica por competência ao longo de ciclos fechados (US16.05). */
export interface HistoryPoint {
  cycleId: string;
  cycleName: string;
  periodEnd: string;
  averageScore: number;
}

export interface HistorySeries {
  skillId: string;
  skillName: string;
  skillType: "TECHNICAL" | "BEHAVIORAL";
  points: HistoryPoint[];
}
