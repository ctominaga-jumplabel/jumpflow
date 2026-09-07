/**
 * Shared, pure types for the COE — Centro Operacional de Excelência.
 *
 * No server-only imports so these are safe to import from client components,
 * schemas and tests. O COE responde uma pergunta que a IA de Alocação (§8.2)
 * NÃO responde: ela ranqueia candidatos para UMA vaga; o COE compõe um TIME de
 * N pessoas para N frentes paralelas do mesmo projeto, sem repetir ninguém, e
 * mostra a cobertura de skills e a capacidade AGREGADAS do conjunto.
 *
 * O ranking por slot reusa integralmente a engine determinística da IA de
 * Alocação (`lib/allocation-ai/engine.ts`) — o COE não recalcula fatores, apenas
 * (a) aplica a aderência de senioridade do slot como um ajuste transparente e
 * (b) resolve a atribuição slot↔pessoa. Ver docs/coe-centro-operacional-excelencia.md.
 */

import type { SkillLevel } from "@/lib/competencies/types";
import type {
  AvailabilityPeriod,
  AvailabilityState,
} from "@/lib/availability/types";
import type {
  FitCandidateInput,
  FitResult,
  RequiredSkillInput,
} from "@/lib/allocation-ai/types";

// ── Universo de candidatos ──────────────────────────────────────────────────

/**
 * De onde saem os candidatos da composição.
 * - `COE`: apenas o núcleo curado (consultores estratégicos ativos). Default —
 *   é o propósito da tela.
 * - `ALL`: todos os consultores ativos, quando o núcleo não cobre a demanda.
 *
 * A troca de escopo NÃO dá bônus a ninguém: ela só amplia o universo. Membros do
 * núcleo aparecem marcados (`isCoeMember`) para leitura, sem peso escondido.
 */
export type CoeScope = "COE" | "ALL";

export const coeScopeLabels: Record<CoeScope, string> = {
  COE: "Núcleo do COE",
  ALL: "Todos os consultores",
};

// ── Curadoria do núcleo ─────────────────────────────────────────────────────

/** Um consultor do núcleo, como a tela de curadoria o exibe. */
export interface CoeMemberView {
  id: string;
  consultantId: string;
  consultantName: string;
  seniority: string;
  area: string | null;
  jobTitle: string | null;
  status: "ACTIVE" | "INACTIVE" | "ON_LEAVE";
  focusArea: string;
  note: string | null;
  active: boolean;
  /** Skills VALIDADAS do consultor, para a leitura da curadoria. */
  skills: { skillId: string; skillName: string; level: SkillLevel }[];
  addedByName: string | null;
  createdAt: string;
}

/** Um consultor elegível a entrar no núcleo (ainda não é membro ativo). */
export interface CoeCandidateOption {
  consultantId: string;
  consultantName: string;
  seniority: string;
  area: string | null;
  jobTitle: string | null;
  /** true quando já existe um CoeMember inativo — entrar reativa o registro. */
  previouslyMember: boolean;
}

// ── Slots (frentes paralelas) ───────────────────────────────────────────────

/** De onde vieram os slots da composição. */
export type CoeSlotsSource = "PLANNED_PROFILES" | "MANUAL" | "NONE";

/**
 * Uma FRENTE de trabalho a paralelizar. Um slot = uma pessoa. Slots nascem dos
 * `ProjectPlannedProfile` do projeto (cargo + senioridade + quantidade vindos do
 * CRM, expandidos por quantidade) ou, quando o projeto não tem perfis planejados,
 * de frentes genéricas informadas na tela.
 *
 * `requiredSkills` é hoje o conjunto do PROJETO (união das AllocationSkill) mais
 * as skills informadas manualmente: o schema não liga skill a perfil planejado,
 * então todos os slots do mesmo projeto compartilham a exigência técnica. A
 * senioridade é o que diferencia um slot do outro.
 */
export interface CoeSlotInput {
  /** Chave estável dentro da composição (usada para persistir a proposta). */
  key: string;
  /** Rótulo de exibição, ex.: "Desenvolvedor · Sênior". */
  label: string;
  roleName: string;
  /** Senioridade exigida (valor do enum Prisma `Seniority`) ou null. */
  seniority: string | null;
  requiredSkills: RequiredSkillInput[];
  /** Valor hora de venda de referência (só populado para FINANCIAL_ROLES). */
  saleRate: number | null;
  /** `ProjectPlannedProfile.id` de origem, quando houver. */
  sourceProfileId: string | null;
}

// ── Candidato avaliado para um slot ─────────────────────────────────────────

/**
 * O resultado de avaliar UM candidato para UM slot.
 *
 * `fit` é a saída íntegra da engine da IA de Alocação (score 0..100 com o
 * breakdown por fator). `seniorityDelta` é o ajuste do COE, em PONTOS, exibido
 * ao lado do score — nunca embutido silenciosamente. `slotScore` é a soma
 * saturada em 0..100, e é ela que ordena a atribuição.
 */
export interface CoeSlotCandidate {
  consultantId: string;
  consultantName: string;
  fit: FitResult;
  /** Pontos somados/subtraídos pela aderência de senioridade ao slot. */
  seniorityDelta: number;
  /** Texto curto explicando o delta (estruturado, não-IA). */
  seniorityDetail: string;
  /** clamp(fit.score + seniorityDelta, 0, 100). */
  slotScore: number;
  isCoeMember: boolean;
  coeFocusArea: string | null;
}

/** Um slot resolvido: quem foi atribuído e quais são as alternativas. */
export interface CoeSlotAssignment {
  slot: CoeSlotInput;
  /** null quando não sobrou candidato disponível para este slot. */
  assigned: CoeSlotCandidate | null;
  /**
   * Melhores candidatos NÃO atribuídos a este slot, ordenados. A UI usa para a
   * troca manual; `applyManualAssignment` cuida do efeito colateral de puxar
   * alguém que já ocupa outro slot.
   */
  alternatives: CoeSlotCandidate[];
}

/** A composição completa do time. */
export interface CoeComposition {
  assignments: CoeSlotAssignment[];
  /** Slots que ficaram sem ninguém (demanda maior que o universo disponível). */
  unfilled: number;
}

// ── Cobertura de skills do TIME (não do indivíduo) ──────────────────────────

/**
 * Uma skill exigida, vista pelo conjunto: basta UMA pessoa do time cobrir para a
 * frente estar coberta. É exatamente o que a leitura individual não responde.
 */
export interface CoeSkillCoverage {
  skillId: string;
  skillName: string;
  requiredLevel: SkillLevel | null;
  /** Maior nível VALIDADO presente no time (null = ninguém tem a skill). */
  bestLevel: SkillLevel | null;
  /** Nomes dos membros que atendem o nível requerido. */
  coveredBy: string[];
  covered: boolean;
}

export interface CoeCoverageSummary {
  skills: CoeSkillCoverage[];
  covered: number;
  required: number;
  /** covered / required (1 quando não há exigência). */
  coverage01: number;
}

// ── Capacidade agregada do TIME por semana ──────────────────────────────────

/** Capacidade livre do time em uma semana da janela. */
export interface CoeCapacityWeek {
  periodKey: string;
  shortLabel: string;
  label: string;
  /** Soma do % livre dos membros (0..100 por membro). */
  freePercent: number;
  /** Membros com alguma capacidade livre nesta semana. */
  membersWithCapacity: number;
  /** Membros sem nenhuma capacidade (100% alocado, férias, afastado). */
  membersBlocked: number;
}

export interface CoeCapacitySummary {
  weeks: CoeCapacityWeek[];
  /** Soma de `freePercent` na janela inteira. */
  totalFreePercent: number;
  /**
   * Equivalente em pessoas-integrais na janela: totalFreePercent / (100 × semanas).
   * Responde "quantas frentes esse time consegue tocar em paralelo".
   */
  headcountEquivalent: number;
  /** Membros considerados (os efetivamente atribuídos). */
  members: number;
}

/** Uma linha de disponibilidade reduzida ao necessário para a agregação. */
export interface CoeAvailabilityRow {
  consultantId: string;
  cells: {
    periodKey: string;
    state: AvailabilityState;
    allocationPercent: number;
  }[];
}

// ── Entrada da engine ───────────────────────────────────────────────────────

/**
 * Um candidato do COE: o input da engine da IA de Alocação mais os metadados de
 * curadoria. A senioridade real vem de `FitCandidateInput.seniority`.
 */
export interface CoeCandidateInput extends FitCandidateInput {
  isCoeMember: boolean;
  coeFocusArea: string | null;
}

// ── Bundle entregue à tela ──────────────────────────────────────────────────

export interface CoeCompositionBundle {
  projectId: string | null;
  projectName: string | null;
  clientName: string | null;
  slotsSource: CoeSlotsSource;
  composition: CoeComposition;
  /** Janela semanal considerada (colunas da capacidade). */
  periods: AvailabilityPeriod[];
  /** Disponibilidade dos consultores que aparecem na composição. */
  availabilityRows: CoeAvailabilityRow[];
  /** União das skills exigidas (para a cobertura agregada). */
  requiredSkills: RequiredSkillInput[];
  /** true quando o fator financeiro entrou (requisitante FINANCIAL_ROLES). */
  financialIncluded: boolean;
  scope: CoeScope;
  /** Tamanho do universo de candidatos efetivamente considerado. */
  candidatePoolSize: number;
  /** Tamanho do núcleo ativo (para a tela sugerir ampliar o escopo). */
  coePoolSize: number;
  /** Aviso operacional honesto (ex.: projeto sem perfis planejados). */
  notice: string | null;
  /** true quando o resultado veio do mock (DB indisponível). */
  fromMock: boolean;
}

// ── Propostas salvas ────────────────────────────────────────────────────────

export type CoeSquadStatus = "DRAFT" | "PROPOSED" | "ARCHIVED";

export const coeSquadStatusLabels: Record<CoeSquadStatus, string> = {
  DRAFT: "Rascunho",
  PROPOSED: "Proposta",
  ARCHIVED: "Arquivada",
};

export interface CoeSquadMemberView {
  consultantId: string;
  consultantName: string;
  slotKey: string;
  slotLabel: string;
  slotScore: number;
}

export interface CoeSquadView {
  id: string;
  name: string;
  status: CoeSquadStatus;
  projectId: string;
  projectName: string;
  clientName: string;
  periodStart: string | null;
  weeks: number;
  note: string | null;
  members: CoeSquadMemberView[];
  createdByName: string | null;
  createdAt: string;
}
