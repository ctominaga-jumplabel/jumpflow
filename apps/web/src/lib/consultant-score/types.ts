/**
 * Shared, pure types for the Score do Consultor (Talentos — Prioridade 3,
 * §8.4 do roadmap; docs/p3-inteligencia-design.md §1.3).
 *
 * No server-only imports so these are safe to import from client components,
 * schemas and tests. O score é um READ-MODEL computado sob demanda a partir de
 * dados existentes (Evaluation*, TimeEntry, Certificate, Feedback, Enrollment e,
 * só para FINANCIAL_ROLES, realização/custo) — sem novo schema (design §4). O
 * núcleo DETERMINÍSTICO vive em `engine.ts`; a narrativa por LLM é gateada por
 * `NEXT_PUBLIC_AI_SCORE_NARRATIVE` e NÃO recalcula o número (design §1.3).
 */

// ── Identificadores de fator ─────────────────────────────────────────────────

/** Identificador estável de cada fator do score (para legendas e testes). */
export type ScoreFactorKey =
  | "evaluations"
  | "hours"
  | "certifications"
  | "learning"
  | "feedback"
  | "financial";

export const scoreFactorLabels: Record<ScoreFactorKey, string> = {
  evaluations: "Avaliações de desempenho",
  hours: "Consistência de apontamento",
  certifications: "Certificações válidas",
  learning: "Capacitação (cursos)",
  feedback: "Saldo de feedback",
  financial: "Realização financeira",
};

// ── Entrada por consultor (rows já agregadas pelo servidor) ──────────────────

/**
 * O consultor reduzido ao mínimo necessário para o cálculo do score. O servidor é
 * responsável por agregar as médias de avaliação, as horas APROVADAS, contar
 * certificados válidos, cursos concluídos, o saldo de feedback (já respeitando a
 * visibilidade — sem expor conteúdo) e (apenas para FINANCIAL_ROLES) a realização
 * financeira antes de chamar a função pura. A engine é sem I/O, sem RBAC e sem
 * LLM.
 */
export interface ScoreConsultantInput {
  consultantId: string;
  consultantName: string;
  seniority: string;
  area: string | null;
  jobTitle: string | null;
  status: "ACTIVE" | "INACTIVE" | "ON_LEAVE";

  // ── Avaliações ────────────────────────────────────────────────────────────
  /**
   * Média geral das notas de avaliação na escala 1–5 (consolidando todas as
   * competências e avaliadores do ciclo mais recente fechado). null quando o
   * consultor nunca foi avaliado (fator indefinido, não zero).
   */
  evaluationAverage: number | null;
  /**
   * Média do ciclo anterior (penúltimo fechado), na mesma escala 1–5, para a
   * TENDÊNCIA. null quando não há histórico anterior.
   */
  previousEvaluationAverage: number | null;

  // ── Horas / presença ────────────────────────────────────────────────────────
  /**
   * Horas APROVADAS apontadas na janela de avaliação (soma de TimeEntry APPROVED).
   */
  approvedHours: number;
  /**
   * Horas esperadas na janela (capacidade nominal: dias úteis × jornada). > 0.
   * 0 quando não há janela mensurável (fator neutro).
   */
  expectedHours: number;

  // ── Certificações ─────────────────────────────────────────────────────────
  /** Certificados VÁLIDOS (status VALIDATED e não vencidos). */
  validCertificates: number;
  /** Certificados vencidos (penalidade leve sobre o fator). */
  expiredCertificates: number;

  // ── Capacitação ─────────────────────────────────────────────────────────────
  /** Matrículas (Enrollment) com status COMPLETED. */
  completedCourses: number;

  // ── Saldo de feedback (sem conteúdo, só contagem; respeita visibilidade) ────
  /** Feedbacks positivos no escopo (PRAISE + RECOGNITION). */
  positiveFeedbacks: number;
  /** Feedbacks de preocupação no escopo (CONCERN). */
  concernFeedbacks: number;

  // ── Realização financeira (só para FINANCIAL_ROLES) ─────────────────────────
  /**
   * Receita estimada realizada (horas faturáveis aprovadas × valor de venda) e
   * custo estimado (horas aprovadas × custo hora) na janela. Só populados pelo
   * servidor para FINANCIAL_ROLES; null caso contrário ou sem dado suficiente.
   */
  realizedRevenue: number | null;
  realizedCost: number | null;
}

// ── Saída: breakdown transparente ───────────────────────────────────────────

/**
 * A contribuição de um fator para o score final.
 * - `score01`: desempenho do fator, normalizado 0..1 (transparente, sem peso).
 * - `weight`: peso do fator na composição (0..1; somam 1 entre os ativos).
 * - `contribution`: score01 × weight × 100 (pontos que o fator adiciona ao total).
 * - `available`: false quando o fator é indefinido (sem dado) e entrou neutro.
 * - `detail`: texto curto explicando o fator (estruturado, não-IA).
 */
export interface ScoreFactor {
  key: ScoreFactorKey;
  label: string;
  score01: number;
  weight: number;
  contribution: number;
  available: boolean;
  detail: string;
}

/** Tendência do score frente ao ciclo anterior (derivada das médias de avaliação). */
export type ScoreTrend = "UP" | "DOWN" | "STABLE" | "UNKNOWN";

export const scoreTrendLabels: Record<ScoreTrend, string> = {
  UP: "Em evolução",
  DOWN: "Em queda",
  STABLE: "Estável",
  UNKNOWN: "Sem histórico",
};

/** Faixa qualitativa do score, para rótulo/semáforo na UI. */
export type ScoreBand = "HIGH" | "MEDIUM" | "LOW";

export const scoreBandLabels: Record<ScoreBand, string> = {
  HIGH: "Alto",
  MEDIUM: "Médio",
  LOW: "Baixo",
};

/** Resultado de score de um consultor. */
export interface ScoreResult {
  consultantId: string;
  consultantName: string;
  seniority: string;
  area: string | null;
  jobTitle: string | null;
  /** Score final 0..100 (inteiro arredondado; quanto maior, melhor). */
  score: number;
  /** Faixa qualitativa derivada do score. */
  band: ScoreBand;
  /** Composição transparente do score (fatores ativos). */
  factors: ScoreFactor[];
  /** Tendência frente ao ciclo anterior (UNKNOWN quando sem histórico). */
  trend: ScoreTrend;
  /** Variação da média de avaliação (1–5) frente ao ciclo anterior, ou null. */
  evaluationDelta: number | null;
  /** true quando o fator de realização financeira foi computado (FINANCIAL_ROLES). */
  financialIncluded: boolean;
}
