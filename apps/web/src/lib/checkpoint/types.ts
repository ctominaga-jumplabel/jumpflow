/**
 * Shared, pure types + labels for the Checkpoint / 1-on-1 module (Melhoria #4,
 * FATIA 5 — telas). No server-only imports so these are safe to import from
 * client components and tests. Mirrors `lib/feedback/types.ts` and the Prisma
 * models `Checkpoint`, `Opportunity` and `Case` (plus their enums).
 *
 * The read-model itself (`CheckpointViewModel`) lives in `lib/db/checkpoint.ts`
 * because the DB layer owns the RBAC/LGPD field redaction; this file only adds
 * the UI labels/tones and the insight read-models that the new read helper
 * (`lib/db/checkpoint-insights.ts`) projects.
 */

export type CheckpointType = "ONE_ON_ONE" | "CHECKPOINT";
export type CheckpointVisibility = "PRIVATE" | "SHARED";
export type CheckpointStatus = "DRAFT" | "RECORDED" | "EXTRACTED" | "ARCHIVED";
export type PipelineStatus = "NONE" | "PENDING" | "DONE" | "FAILED";

export type OpportunityKind =
  | "EXPANSION"
  | "UPSELL"
  | "RISK"
  | "REFERRAL"
  | "RENEWAL";
export type OpportunityPriority = "LOW" | "MEDIUM" | "HIGH";
export type InsightStatus = "PENDING" | "ACCEPTED" | "DISMISSED";

export const checkpointTypeLabels: Record<CheckpointType, string> = {
  ONE_ON_ONE: "1-on-1",
  CHECKPOINT: "Checkpoint",
};

export const checkpointVisibilityLabels: Record<CheckpointVisibility, string> = {
  PRIVATE: "Privado",
  SHARED: "Compartilhado",
};

export const opportunityKindLabels: Record<OpportunityKind, string> = {
  EXPANSION: "Expansão",
  UPSELL: "Upsell",
  RISK: "Risco",
  REFERRAL: "Indicação",
  RENEWAL: "Renovação",
};

export const opportunityPriorityLabels: Record<OpportunityPriority, string> = {
  LOW: "Baixa",
  MEDIUM: "Média",
  HIGH: "Alta",
};

export const insightStatusLabels: Record<InsightStatus, string> = {
  PENDING: "Pendente",
  ACCEPTED: "Aceito",
  DISMISSED: "Descartado",
};

/** Tone hint for the insight status chip (maps to StatusBadge tone). */
export const insightStatusTone: Record<
  InsightStatus,
  "neutral" | "success" | "warning"
> = {
  PENDING: "neutral",
  ACCEPTED: "success",
  DISMISSED: "warning",
};

/** Tone hint for the priority chip (maps to StatusBadge tone). */
export const opportunityPriorityTone: Record<
  OpportunityPriority,
  "neutral" | "info" | "warning"
> = {
  LOW: "neutral",
  MEDIUM: "info",
  HIGH: "warning",
};

// ── Insight read-models (projected by lib/db/checkpoint-insights.ts) ─────────

/** An Opportunity candidate as projected for the insights panel. */
export interface OpportunityInsightItem {
  id: string;
  kind: OpportunityKind;
  title: string;
  description: string | null;
  priority: OpportunityPriority;
  /** Trecho-evidência da conversa que originou a sugestão (rastreio da IA). */
  sourceQuote: string | null;
  aiGenerated: boolean;
  status: InsightStatus;
}

/** A Case candidate as projected for the insights panel. */
export interface CaseInsightItem {
  id: string;
  title: string;
  summary: string | null;
  outcome: string | null;
  sourceQuote: string | null;
  aiGenerated: boolean;
  status: InsightStatus;
}

/**
 * Insights de UM checkpoint, já escopados por RBAC/LGPD no servidor: só viajam
 * para quem pode ver o CRU do checkpoint (gestão/autor). O consultor avaliado
 * NUNCA recebe estes candidatos (vem vazio). Skills NÃO entram aqui — caem na
 * curadoria existente em /app/skills (apenas linkamos, não duplicamos).
 */
export interface CheckpointInsights {
  opportunities: OpportunityInsightItem[];
  cases: CaseInsightItem[];
}

/** Lightweight option for the consultor-alvo / projeto selects. */
export interface CheckpointOption {
  id: string;
  name: string;
}
