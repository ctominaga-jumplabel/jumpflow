/**
 * Shared, pure types for the IA de Alocação (Talentos — Prioridade 3, §8.2).
 *
 * No server-only imports so these are safe to import from client components,
 * schemas and tests. The ranking is a READ-MODEL computed on demand from
 * existing data (ConsultantSkill, AllocationSkill, Allocation, ProjectSaleRate,
 * ConsultantAllocationCostRate) — no new schema (docs/p3-inteligencia-design.md
 * §4). The deterministic core lives in `engine.ts`; the optional LLM explanation
 * is gated by `NEXT_PUBLIC_AI_ALLOCATION` and never reorders/recalculates.
 */

import type { SkillLevel } from "@/lib/competencies/types";
import type { AvailabilityState } from "@/lib/availability/types";

// ── Entrada de skill requerida ──────────────────────────────────────────────

/**
 * Uma skill exigida pelo alvo da alocação. `requiredLevel` é o nível mínimo
 * desejado (de AllocationSkill.level ou informado manualmente). null = a skill é
 * exigida sem nível mínimo específico (qualquer nível validado cobre).
 */
export interface RequiredSkillInput {
  skillId: string;
  skillName: string;
  requiredLevel: SkillLevel | null;
}

/** Uma skill VALIDADA que o candidato declara, com nível. */
export interface CandidateSkillInput {
  skillId: string;
  level: SkillLevel;
}

// ── Entrada do candidato (consultor) ────────────────────────────────────────

/**
 * O candidato reduzido ao mínimo necessário para o cálculo de fit. O servidor é
 * responsável por filtrar `skills` para apenas as VALIDATED antes de chamar a
 * função pura (a engine assume que toda skill recebida está validada).
 */
export interface FitCandidateInput {
  consultantId: string;
  consultantName: string;
  seniority: string;
  area: string | null;
  jobTitle: string | null;
  /** Skills VALIDADAS do consultor (validationStatus = VALIDATED). */
  skills: CandidateSkillInput[];
  /**
   * Estado de disponibilidade no período-alvo (do read-model de availability).
   * null quando não há janela definida (período não informado) — disponibilidade
   * entra como neutra nesse caso.
   */
  availabilityState: AvailabilityState | null;
  /** Alocações anteriores (qualquer status) no mesmo cliente do alvo. */
  pastAllocationsWithClient: number;
  /**
   * Custo médio hora do consultor (de ConsultantAllocationCostRate). null quando
   * sem registro. Só é populado pelo servidor para FINANCIAL_ROLES.
   */
  hourlyCost: number | null;
  /** Status do consultor (INACTIVE é desqualificado para sugestão). */
  status: "ACTIVE" | "INACTIVE" | "ON_LEAVE";
}

// ── Alvo da alocação ────────────────────────────────────────────────────────

export interface FitTargetInput {
  /** Skills requeridas pelo alvo (vazio = sem exigência de skill). */
  requiredSkills: RequiredSkillInput[];
  /**
   * Valor hora de venda de referência do projeto/alocação (de ProjectSaleRate),
   * usado como teto para o fator financeiro. null quando indisponível.
   */
  saleRate: number | null;
}

// ── Saída: breakdown transparente ───────────────────────────────────────────

/** Identificador estável de cada fator do score (para legendas e testes). */
export type FitFactorKey =
  | "skills"
  | "availability"
  | "history"
  | "financial";

export const fitFactorLabels: Record<FitFactorKey, string> = {
  skills: "Aderência de skills",
  availability: "Disponibilidade",
  history: "Histórico com o cliente",
  financial: "Encaixe financeiro",
};

/**
 * A contribuição de um fator para o score final.
 * - `score01`: aderência do fator, normalizada 0..1 (transparente, sem peso).
 * - `weight`: peso do fator na composição (0..1; somam 1 entre os ativos).
 * - `contribution`: score01 × weight × 100 (pontos que o fator adiciona ao total).
 * - `detail`: texto curto explicando o fator (estruturado, não-IA).
 */
export interface FitFactor {
  key: FitFactorKey;
  label: string;
  score01: number;
  weight: number;
  contribution: number;
  detail: string;
}

/** Detalhe por skill exigida, para a UI mostrar gap a gap. */
export interface FitSkillDetail {
  skillId: string;
  skillName: string;
  requiredLevel: SkillLevel | null;
  /** Nível VALIDADO do candidato, ou null se não possui. */
  currentLevel: SkillLevel | null;
  /** true se cobre o nível requerido (ou possui a skill quando sem nível mínimo). */
  meets: boolean;
}

/** Resultado de fit de um candidato a uma alocação. */
export interface FitResult {
  consultantId: string;
  consultantName: string;
  seniority: string;
  area: string | null;
  jobTitle: string | null;
  /** Score final 0..100 (inteiro arredondado). */
  score: number;
  availabilityState: AvailabilityState | null;
  /** Composição transparente do score (fatores ativos). */
  factors: FitFactor[];
  /** Detalhe por skill exigida (para a UI). */
  skillDetails: FitSkillDetail[];
  /** Quantas skills exigidas o candidato cobre / total exigido. */
  skillsMet: number;
  skillsRequired: number;
  /** true quando o fator financeiro foi computado (requisitante FINANCIAL_ROLES). */
  financialIncluded: boolean;
}

/** Opção de projeto para o seletor da UI. */
export interface AllocationProjectOption {
  id: string;
  name: string;
  clientId: string;
  clientName: string;
}

/** Opção de skill para o seletor manual da UI (catálogo ativo). */
export interface AllocationSkillOption {
  id: string;
  name: string;
  category: string | null;
}
