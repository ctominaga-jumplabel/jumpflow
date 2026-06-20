/**
 * Shared, pure types for Metas e OKRs (EP 7.2 / docs/roadmap-talentos-gcpec.md).
 *
 * No server-only imports so these are safe from client components, schemas and
 * tests. Mirrors the Prisma models `Objective` and `KeyResult` (+ their enums)
 * and the DERIVED progress read-model (progress is computed in the server, never
 * persisted — see lib/okrs/progress.ts).
 */

export type ObjectiveScope = "CONSULTANT" | "PROJECT" | "AREA" | "COMPANY";

export type ObjectiveStatus = "DRAFT" | "ACTIVE" | "COMPLETED" | "CANCELLED";

export type KeyResultMetric = "NUMBER" | "PERCENT" | "CURRENCY" | "BOOLEAN";

export const objectiveScopeLabels: Record<ObjectiveScope, string> = {
  CONSULTANT: "Consultor",
  PROJECT: "Projeto",
  AREA: "Área",
  COMPANY: "Empresa",
};

export const objectiveStatusLabels: Record<ObjectiveStatus, string> = {
  DRAFT: "Rascunho",
  ACTIVE: "Ativo",
  COMPLETED: "Concluído",
  CANCELLED: "Cancelado",
};

export const keyResultMetricLabels: Record<KeyResultMetric, string> = {
  NUMBER: "Número",
  PERCENT: "Percentual",
  CURRENCY: "Moeda (BRL)",
  BOOLEAN: "Sim/Não",
};

// ── Read-models (OKR) ───────────────────────────────────────────────────────

export interface KeyResultView {
  id: string;
  title: string;
  metricType: KeyResultMetric;
  startValue: number;
  targetValue: number;
  currentValue: number;
  unit: string | null;
  /**
   * Chave de fonte operacional para auto-atualização (ex.: 'hours_total',
   * 'hours_billable'). null = KR manual. Quando reconhecida, o currentValue pode
   * ser recalculado a partir de dado operacional do período/escopo.
   */
  autoSource: string | null;
  /** Progresso derivado (0-100, inteiro) deste KR conforme metricType. */
  progress: number;
}

export interface ObjectiveView {
  id: string;
  scope: ObjectiveScope;
  /** Chave de referência para escopo AREA/COMPANY (ex.: nome da área). */
  referenceKey: string | null;
  title: string;
  description: string | null;
  /** ISO yyyy-mm-dd. */
  periodStart: string;
  periodEnd: string;
  status: ObjectiveStatus;
  ownerUserId: string | null;
  ownerName: string | null;
  consultantId: string | null;
  consultantName: string | null;
  projectId: string | null;
  projectName: string | null;
  keyResults: KeyResultView[];
  /** Rollup do objetivo: média dos progressos dos KRs (0-100, inteiro). */
  progress: number;
  /**
   * O que o ESPECTADOR atual pode fazer neste objetivo. Resolvido no servidor a
   * partir do RBAC (lib/okrs/visibility.ts); a UI só reflete.
   */
  canManage: boolean;
  /**
   * O consultor dono pode atualizar o currentValue dos próprios KRs sem gerenciar
   * a estrutura (escopo CONSULTANT do próprio consultor).
   */
  canUpdateProgress: boolean;
}

// ── Opções para os seletores de criação ─────────────────────────────────────

/** Opção leve de consultor para o seletor de escopo CONSULTANT. */
export interface ConsultantOption {
  id: string;
  name: string;
  seniority: string;
}

/** Opção leve de projeto para o seletor de escopo PROJECT. */
export interface ProjectOption {
  id: string;
  name: string;
}

/**
 * Fonte operacional reconhecida para auto-update de KR. Apenas metadados de UI;
 * a resolução real do valor mora em lib/okrs/auto-source.ts.
 */
export interface AutoSourceOption {
  key: string;
  label: string;
  description: string;
  metricType: KeyResultMetric;
  unit: string | null;
}
