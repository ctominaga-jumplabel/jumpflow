/**
 * Shared, pure types for the PDI — Plano de Desenvolvimento Individual (EP17).
 *
 * No server-only imports so these are safe to import from client components,
 * schemas and tests. Mirrors the Prisma models `DevelopmentPlan` and
 * `DevelopmentAction` (+ their enums) and the derived progress read-model.
 * See docs/backlog-talentos.md EP17 and docs/roadmap-talentos-gcpec.md §6.4.
 */

import type { SkillLevel, SkillType } from "@/lib/competencies/types";

export type DevelopmentPlanStatus = "ACTIVE" | "COMPLETED" | "CANCELLED";

export type DevelopmentActionType =
  | "TRAINING"
  | "MENTORSHIP"
  | "CERTIFICATION"
  | "PROJECT"
  | "READING";

export type DevelopmentActionStatus =
  | "PLANNED"
  | "IN_PROGRESS"
  | "DONE"
  | "CANCELLED";

export const developmentPlanStatusLabels: Record<
  DevelopmentPlanStatus,
  string
> = {
  ACTIVE: "Ativo",
  COMPLETED: "Concluído",
  CANCELLED: "Cancelado",
};

export const developmentActionTypeLabels: Record<
  DevelopmentActionType,
  string
> = {
  TRAINING: "Treinamento",
  MENTORSHIP: "Mentoria",
  CERTIFICATION: "Certificação",
  PROJECT: "Projeto",
  READING: "Leitura",
};

export const developmentActionStatusLabels: Record<
  DevelopmentActionStatus,
  string
> = {
  PLANNED: "Planejada",
  IN_PROGRESS: "Em andamento",
  DONE: "Concluída",
  CANCELLED: "Cancelada",
};

// ── Read-models (PDI) ───────────────────────────────────────────────────────

export interface DevelopmentActionView {
  id: string;
  type: DevelopmentActionType;
  targetSkillId: string | null;
  targetSkillName: string | null;
  description: string;
  /** ISO yyyy-mm-dd (ou null se sem prazo). */
  dueAt: string | null;
  status: DevelopmentActionStatus;
  evidenceNote: string | null;
}

export interface DevelopmentPlanView {
  id: string;
  consultantId: string;
  consultantName: string;
  /** Ciclo de avaliação que originou o PDI, quando houver. */
  cycleId: string | null;
  cycleName: string | null;
  ownerUserId: string | null;
  ownerName: string | null;
  status: DevelopmentPlanStatus;
  /** ISO yyyy-mm-dd. */
  periodStart: string;
  periodEnd: string;
  actions: DevelopmentActionView[];
  progress: PlanProgress;
  /**
   * O que o ESPECTADOR atual pode fazer neste plano. Resolvido no servidor a
   * partir do RBAC/LGPD (lib/development/visibility.ts); a UI só reflete.
   */
  canManage: boolean;
  /** O consultor dono pode atualizar status/evidência das próprias ações. */
  canUpdateProgress: boolean;
}

/** Progresso derivado das ações (% concluídas + vencidas). */
export interface PlanProgress {
  total: number;
  done: number;
  /** Ações com dueAt < hoje e status diferente de DONE/CANCELLED. */
  overdue: number;
  /** Percentual concluído (0-100, inteiro). Considera só ações não canceladas. */
  donePercent: number;
}

// ── Sugestão de ações a partir do gap (US17.01) ─────────────────────────────

/** Skill com gap positivo derivada do gap analysis (entrada da geração). */
export interface GapSkillInput {
  skillId: string;
  skillName: string;
  skillType: SkillType;
  requiredLevel: SkillLevel;
  /** Nível atual declarado, ou null se não avaliado. */
  currentLevel: SkillLevel | null;
  /** requiredWeight - currentWeight (>0 = lacuna). */
  gap: number;
}

/**
 * Ação sugerida (NÃO persistida) revisável pelo humano antes de salvar — mesma
 * filosofia de SkillSuggestion. O usuário pode editar/remover antes de criar o
 * PDI; nada é gravado sem confirmação (US17.01).
 */
export interface SuggestedAction {
  type: DevelopmentActionType;
  targetSkillId: string;
  targetSkillName: string;
  description: string;
}

/** Opção leve de consultor para o seletor de criação de PDI. */
export interface ConsultantOption {
  id: string;
  name: string;
  seniority: string;
}
