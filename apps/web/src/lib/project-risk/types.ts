/**
 * Shared, pure types for the IA de Risco de Projeto (Talentos — Prioridade 3,
 * §8.3 do roadmap; docs/p3-inteligencia-design.md §1.2).
 *
 * No server-only imports so these are safe to import from client components,
 * schemas and tests. O nível de risco é um READ-MODEL computado sob demanda a
 * partir de dados existentes (Project, TimeEntry, Feedback, ProjectSaleRate /
 * ConsultantAllocationCostRate) — sem novo schema (design §4). O núcleo
 * DETERMINÍSTICO vive em `engine.ts`; o sinal opcional de sentimento por LLM é
 * gateado por `NEXT_PUBLIC_AI_RISK_SENTIMENT` e NÃO altera o nível — é exibido à
 * parte (design §1.2, decisão de governança).
 */

// ── Nível e identificadores de sinal ────────────────────────────────────────

/** Semáforo de risco do projeto. */
export type RiskLevel = "GREEN" | "YELLOW" | "RED";

export const riskLevelLabels: Record<RiskLevel, string> = {
  GREEN: "Sob controle",
  YELLOW: "Atenção",
  RED: "Risco alto",
};

/** Identificador estável de cada sinal de risco (para legendas e testes). */
export type RiskSignalKey = "burnRate" | "schedule" | "margin" | "feedback";

export const riskSignalLabels: Record<RiskSignalKey, string> = {
  burnRate: "Consumo de horas (burn rate)",
  schedule: "Prazo",
  margin: "Margem",
  feedback: "Sinais de pessoas (feedbacks)",
};

// ── Entrada do projeto (rows já moldadas pelo servidor) ─────────────────────

/**
 * O projeto reduzido ao mínimo necessário para o cálculo de risco. O servidor é
 * responsável por agregar as horas APPROVED, contar feedbacks CONCERN e (apenas
 * para FINANCIAL_ROLES) computar a margem antes de chamar a função pura. A engine
 * é sem I/O, sem RBAC e sem LLM.
 */
export interface RiskProjectInput {
  projectId: string;
  projectName: string;
  clientName: string | null;
  status: "PROPOSAL" | "ACTIVE" | "PAUSED" | "CLOSED";

  /** Orçamento de horas do projeto (Project.budgetHours). null = sem orçamento. */
  budgetHours: number | null;
  /** Horas APROVADAS apontadas no projeto (soma de TimeEntry APPROVED). */
  approvedHours: number;

  /** Início do projeto (Project.startDate). */
  startDate: Date;
  /** Fim previsto do projeto (Project.endDate). null = sem prazo definido. */
  endDate: Date | null;

  /**
   * Custo total estimado (horas × custo hora) e receita total estimada (horas ×
   * valor de venda). Só populados pelo servidor para FINANCIAL_ROLES; null caso
   * contrário ou quando sem dado financeiro suficiente.
   */
  estimatedCost: number | null;
  estimatedRevenue: number | null;

  /** Feedbacks do tipo CONCERN recentes no projeto / nos consultores do projeto. */
  recentConcernFeedbacks: number;
}

// ── Saída: breakdown transparente ───────────────────────────────────────────

/**
 * A contribuição de um sinal para o score de risco.
 * - `risk01`: intensidade do RISCO do sinal, normalizada 0..1 (0 = sem risco,
 *   1 = risco máximo). Transparente, sem peso.
 * - `weight`: peso do sinal na composição (0..1; somam 1 entre os ativos).
 * - `contribution`: risk01 × weight × 100 (pontos de risco que o sinal adiciona).
 * - `detail`: texto curto explicando o sinal (estruturado, não-IA).
 */
export interface RiskSignal {
  key: RiskSignalKey;
  label: string;
  risk01: number;
  weight: number;
  contribution: number;
  detail: string;
}

/** Resultado de risco de um projeto. */
export interface RiskResult {
  projectId: string;
  projectName: string;
  clientName: string | null;
  /** Nível semáforo derivado do score. */
  level: RiskLevel;
  /** Score de risco 0..100 (inteiro arredondado; quanto maior, pior). */
  score: number;
  /** Composição transparente do score (sinais ativos). */
  signals: RiskSignal[];
  /** Recomendações textuais determinísticas derivadas dos sinais em risco. */
  recommendations: string[];
  /** true quando o sinal de margem foi computado (requisitante FINANCIAL_ROLES). */
  financialIncluded: boolean;
}
