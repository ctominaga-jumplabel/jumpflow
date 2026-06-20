import { skillLevelWeight, type SkillLevel } from "@/lib/competencies/types";
import type { AvailabilityState } from "@/lib/availability/types";
import {
  fitFactorLabels,
  type CandidateSkillInput,
  type FitCandidateInput,
  type FitFactor,
  type FitFactorKey,
  type FitResult,
  type FitSkillDetail,
  type FitTargetInput,
  type RequiredSkillInput,
} from "./types";

/**
 * Núcleo DETERMINÍSTICO da IA de Alocação (§8.2). Função pura: recebe o alvo e os
 * candidatos (rows já moldadas pelo servidor) e devolve um ranking com score
 * 0..100 e o BREAKDOWN transparente por fator. Sem I/O, sem RBAC, sem LLM — a
 * decisão de incluir o fator financeiro chega como o booleano `includeFinancial`
 * (resolvido no servidor a partir de FINANCIAL_ROLES, ver docs/p3-inteligencia-
 * design.md §5). O LLM, quando ligado, apenas verbaliza este resultado.
 *
 * IA é SUGESTÃO: o ranking ordena candidatos, não cria alocação.
 */

// ── Pesos dos fatores (documentados, transparentes) ─────────────────────────
//
// Os pesos somam 1.0. Quando o fator financeiro NÃO entra (requisitante não
// financeiro), os três fatores restantes são RENORMALIZADOS para somar 1.0 —
// assim o score continua numa escala 0..100 comparável, sem "mascarar" a saída
// com um fator zerado escondido. A renormalização preserva a proporção relativa
// entre skills/disponibilidade/histórico.
//
// Racional dos pesos:
// - skills (0.50): aderência técnica é o fator dominante para uma sugestão de
//   alocação — é o que o projeto exige para entregar.
// - availability (0.25): de nada adianta o melhor fit se a pessoa está 100%
//   alocada/férias; pesa metade das skills.
// - history (0.10): relacionamento prévio com o cliente reduz ramp-up; sinal
//   positivo, porém secundário (não penaliza quem nunca atendeu o cliente).
// - financial (0.15): encaixe de custo no valor de venda (margem). Só compõe
//   para FINANCIAL_ROLES; quando ausente, os 0.15 são redistribuídos.
export const FIT_WEIGHTS: Record<FitFactorKey, number> = {
  skills: 0.5,
  availability: 0.25,
  history: 0.1,
  financial: 0.15,
};

/**
 * Número de alocações anteriores no mesmo cliente que satura o fator histórico.
 * 3+ projetos com o cliente = relacionamento consolidado (score01 = 1).
 */
export const HISTORY_SATURATION = 3;

/**
 * Pontuação 0..1 da disponibilidade por estado. FREE/BENCH favorecem (capacidade
 * real ociosa); PARTIAL é parcial; FULL/VACATION/ON_LEAVE penalizam forte
 * (sem capacidade no período). INACTIVE é tratado como desqualificação antes de
 * chegar aqui. `null` (sem janela definida) → neutro 0.5, para não enviesar o
 * ranking quando o requisitante não informou período.
 */
const AVAILABILITY_SCORE: Record<AvailabilityState, number> = {
  FREE: 1,
  BENCH: 1,
  PARTIAL: 0.5,
  FULL: 0.1,
  VACATION: 0,
  ON_LEAVE: 0,
  INACTIVE: 0,
};

// ── Fator: aderência de skills ──────────────────────────────────────────────

/**
 * Resolve o nível VALIDADO que o candidato tem para uma skill (ou null).
 * Assume que `skills` já vem filtrado para VALIDATED pelo servidor.
 */
function levelForSkill(
  skills: ReadonlyArray<CandidateSkillInput>,
  skillId: string,
): SkillLevel | null {
  return skills.find((s) => s.skillId === skillId)?.level ?? null;
}

/**
 * Aderência de uma única skill exigida, 0..1.
 * - Sem nível requerido: possui a skill validada → 1; não possui → 0.
 * - Com nível requerido: razão peso-atual / peso-requerido, saturada em 1
 *   (excedente não soma). Sem a skill → 0.
 */
function skillAdherence01(
  required: RequiredSkillInput,
  currentLevel: SkillLevel | null,
): number {
  if (currentLevel === null) return 0;
  if (required.requiredLevel === null) return 1;
  // pesos 0..3; o "requerido mais alto" é BASIC=0 → evitar divisão por zero.
  const req = skillLevelWeight(required.requiredLevel) + 1;
  const cur = skillLevelWeight(currentLevel) + 1;
  return Math.min(1, cur / req);
}

interface SkillFactorResult {
  score01: number;
  details: FitSkillDetail[];
  met: number;
  required: number;
}

function computeSkillFactor(
  target: FitTargetInput,
  candidate: FitCandidateInput,
): SkillFactorResult {
  const required = target.requiredSkills;
  if (required.length === 0) {
    // Sem skills exigidas: o fator é neutro (não diferencia candidatos). 1 evita
    // penalizar todo mundo quando a busca é só por disponibilidade/período.
    return { score01: 1, details: [], met: 0, required: 0 };
  }
  let sum = 0;
  let met = 0;
  const details: FitSkillDetail[] = required.map((req) => {
    const currentLevel = levelForSkill(candidate.skills, req.skillId);
    const adherence = skillAdherence01(req, currentLevel);
    sum += adherence;
    const meets = adherence >= 1;
    if (meets) met += 1;
    return {
      skillId: req.skillId,
      skillName: req.skillName,
      requiredLevel: req.requiredLevel,
      currentLevel,
      meets,
    };
  });
  return { score01: sum / required.length, details, met, required: required.length };
}

// ── Fator: histórico com o cliente ──────────────────────────────────────────

function historyScore01(pastAllocationsWithClient: number): number {
  if (pastAllocationsWithClient <= 0) return 0;
  return Math.min(1, pastAllocationsWithClient / HISTORY_SATURATION);
}

// ── Fator: financeiro (encaixe de custo no valor de venda) ──────────────────

/**
 * Encaixe financeiro 0..1: quanto melhor a margem (custo baixo frente ao valor de
 * venda), maior o score. Usa a margem relativa m = (sale - cost) / sale, clamp
 * 0..1. Dados ausentes (sem custo ou sem valor de venda) → neutro 0.5, para não
 * favorecer nem punir por falta de informação. custo >= venda → 0 (sem margem).
 */
function financialScore01(saleRate: number | null, hourlyCost: number | null): number {
  if (saleRate === null || hourlyCost === null || saleRate <= 0) return 0.5;
  const margin = (saleRate - hourlyCost) / saleRate;
  if (margin <= 0) return 0;
  return Math.min(1, margin);
}

// ── Composição ──────────────────────────────────────────────────────────────

/** Constrói um FitFactor com peso e contribuição já calculados. */
function buildFactor(
  key: FitFactorKey,
  score01: number,
  weight: number,
  detail: string,
): FitFactor {
  const safe01 = clamp01(score01);
  return {
    key,
    label: fitFactorLabels[key],
    score01: safe01,
    weight,
    contribution: safe01 * weight * 100,
    detail,
  };
}

function clamp01(v: number): number {
  if (Number.isNaN(v)) return 0;
  if (v < 0) return 0;
  if (v > 1) return 1;
  return v;
}

function availabilityDetail(state: AvailabilityState | null): string {
  if (state === null) return "Sem período definido (neutro).";
  switch (state) {
    case "FREE":
      return "Livre no período.";
    case "BENCH":
      return "Em bench (ociosidade real).";
    case "PARTIAL":
      return "Parcialmente alocado.";
    case "FULL":
      return "100% alocado no período.";
    case "VACATION":
      return "De férias no período.";
    case "ON_LEAVE":
      return "Afastado no período.";
    case "INACTIVE":
      return "Inativo.";
  }
}

/**
 * Calcula o fit de UM candidato. `includeFinancial` controla se o fator
 * financeiro entra na composição; quando false, os pesos dos demais fatores são
 * renormalizados para somar 1.0 (sem fator financeiro oculto na saída).
 */
export function computeFit(
  target: FitTargetInput,
  candidate: FitCandidateInput,
  includeFinancial: boolean,
): FitResult {
  const skill = computeSkillFactor(target, candidate);
  const availability01 =
    candidate.availabilityState === null
      ? 0.5
      : AVAILABILITY_SCORE[candidate.availabilityState];
  const history01 = historyScore01(candidate.pastAllocationsWithClient);

  // Fatores ativos e seus pesos brutos. O financeiro só entra quando solicitado.
  const activeKeys: FitFactorKey[] = ["skills", "availability", "history"];
  if (includeFinancial) activeKeys.push("financial");
  const totalWeight = activeKeys.reduce((acc, k) => acc + FIT_WEIGHTS[k], 0);

  const scoreFor: Record<FitFactorKey, number> = {
    skills: skill.score01,
    availability: availability01,
    history: history01,
    financial: includeFinancial
      ? financialScore01(target.saleRate, candidate.hourlyCost)
      : 0,
  };

  const detailFor: Record<FitFactorKey, string> = {
    skills:
      skill.required === 0
        ? "Nenhuma skill exigida (neutro)."
        : `${skill.met}/${skill.required} skills atendem o nível requerido.`,
    availability: availabilityDetail(candidate.availabilityState),
    history:
      candidate.pastAllocationsWithClient > 0
        ? `${candidate.pastAllocationsWithClient} alocação(ões) anterior(es) com o cliente.`
        : "Sem histórico com o cliente.",
    financial: financialDetail(target.saleRate, candidate.hourlyCost),
  };

  const factors: FitFactor[] = activeKeys.map((key) =>
    buildFactor(key, scoreFor[key], FIT_WEIGHTS[key] / totalWeight, detailFor[key]),
  );

  const score = Math.round(
    factors.reduce((acc, f) => acc + f.contribution, 0),
  );

  return {
    consultantId: candidate.consultantId,
    consultantName: candidate.consultantName,
    seniority: candidate.seniority,
    area: candidate.area,
    jobTitle: candidate.jobTitle,
    score,
    availabilityState: candidate.availabilityState,
    factors,
    skillDetails: skill.details,
    skillsMet: skill.met,
    skillsRequired: skill.required,
    financialIncluded: includeFinancial,
  };
}

function financialDetail(saleRate: number | null, hourlyCost: number | null): string {
  if (saleRate === null || hourlyCost === null || saleRate <= 0) {
    return "Custo ou valor de venda indisponível (neutro).";
  }
  const margin = ((saleRate - hourlyCost) / saleRate) * 100;
  if (margin <= 0) return "Custo iguala ou supera o valor de venda (sem margem).";
  return `Margem estimada de ${Math.round(margin)}% sobre o valor de venda.`;
}

/**
 * Ranqueia todos os candidatos a uma alocação. Consultores INACTIVE são
 * descartados (não são sugestão válida). Ordena por score desc, com desempate
 * estável por mais skills atendidas, depois nome (pt-BR).
 */
export function rankCandidates(
  target: FitTargetInput,
  candidates: ReadonlyArray<FitCandidateInput>,
  includeFinancial: boolean,
): FitResult[] {
  return candidates
    .filter((c) => c.status !== "INACTIVE")
    .map((c) => computeFit(target, c, includeFinancial))
    .sort(
      (a, b) =>
        b.score - a.score ||
        b.skillsMet - a.skillsMet ||
        a.consultantName.localeCompare(b.consultantName, "pt-BR"),
    );
}
