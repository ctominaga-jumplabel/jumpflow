import {
  scoreFactorLabels,
  type ScoreBand,
  type ScoreConsultantInput,
  type ScoreFactor,
  type ScoreFactorKey,
  type ScoreResult,
  type ScoreTrend,
} from "./types";

/**
 * Núcleo DETERMINÍSTICO do Score do Consultor (§8.4). Função pura: recebe um
 * consultor e suas métricas (rows já agregadas pelo servidor) e devolve um score
 * 0..100 e o BREAKDOWN transparente por fator, mais a tendência frente ao ciclo
 * anterior. Sem I/O, sem RBAC, sem LLM — a decisão de incluir o fator financeiro
 * chega como o booleano `includeFinancial` (resolvido no servidor a partir de
 * FINANCIAL_ROLES, ver docs/p3-inteligencia-design.md §5).
 *
 * A narrativa por LLM (atrás de flag) NÃO entra aqui: ela recebe este breakdown
 * pronto e só o verbaliza (design §1.3). IA é SUGESTÃO: o score não toma ação.
 */

// ── Pesos dos fatores (documentados, transparentes) ─────────────────────────
//
// Os pesos somam 1.0. Quando o fator financeiro NÃO entra (requisitante não
// financeiro, p.ex. PEOPLE ou o próprio consultor), os cinco fatores restantes
// são RENORMALIZADOS para somar 1.0 — assim o score continua numa escala 0..100
// comparável, sem "mascarar" a saída com um fator zerado escondido. A
// renormalização preserva a proporção relativa entre os demais fatores.
//
// Racional dos pesos (alinhado ao §8.4: "avaliações, horas, certificações,
// feedbacks, presença e cliente"):
// - evaluations (0.30): a avaliação de desempenho (radar 90/180/360) é o sinal
//   mais rico e direto de qualidade do trabalho — é o coração do score.
// - hours (0.22): consistência de apontamento aprovado vs esperado mede
//   presença e disciplina operacional; é o dado mais objetivo que o JumpFlow tem.
// - feedback (0.15): saldo de feedback (elogios/reconhecimentos vs preocupações)
//   capta o lado relacional/comportamental contínuo entre ciclos formais.
// - certifications (0.10): certificações válidas evidenciam atualização técnica.
// - learning (0.08): cursos concluídos (Universidade) evidenciam capacitação
//   ativa; secundário porque é esforço/insumo, não resultado.
// - financial (0.15): realização financeira (receita realizada vs custo). Só
//   compõe para FINANCIAL_ROLES; quando ausente, os 0.15 são redistribuídos.
export const SCORE_WEIGHTS: Record<ScoreFactorKey, number> = {
  evaluations: 0.3,
  hours: 0.22,
  feedback: 0.15,
  certifications: 0.1,
  learning: 0.08,
  financial: 0.15,
};

// ── Thresholds de faixa (score 0..100) ──────────────────────────────────────
//
// score >= HIGH_THRESHOLD            → HIGH   (alto)
// MEDIUM_THRESHOLD <= score < HIGH_* → MEDIUM (médio)
// score < MEDIUM_THRESHOLD           → LOW    (baixo)
export const HIGH_THRESHOLD = 70;
export const MEDIUM_THRESHOLD = 45;

/** Nº de certificados válidos que satura o fator de certificações (score01 = 1). */
export const CERTIFICATION_SATURATION = 3;

/** Nº de cursos concluídos que satura o fator de capacitação (score01 = 1). */
export const LEARNING_SATURATION = 4;

/**
 * Penalidade por certificado vencido, descontada do fator de certificações
 * (0..1 antes de saturar). Mantida leve: vencer um certificado degrada, não zera.
 */
export const EXPIRED_CERTIFICATE_PENALTY = 0.15;

/**
 * Variação mínima da média de avaliação (escala 1–5) para considerar a tendência
 * UP/DOWN em vez de STABLE — abaixo disso é ruído de arredondamento/amostra.
 */
export const TREND_EPSILON = 0.1;

/** Escala da avaliação (média de score por competência). */
const SCORE_MIN = 1;
const SCORE_MAX = 5;

function clamp01(v: number): number {
  if (Number.isNaN(v)) return 0;
  if (v < 0) return 0;
  if (v > 1) return 1;
  return v;
}

interface FactorComputation {
  score01: number;
  /** false quando o fator é indefinido (sem dado) e entra neutro. */
  available: boolean;
  detail: string;
}

// ── Fator: avaliações ─────────────────────────────────────────────────────────

/**
 * Normaliza a média de avaliação (1–5) para 0..1. Sem avaliação → indefinido,
 * entra NEUTRO (0.5) para não punir quem ainda não passou por ciclo (o consultor
 * recém-chegado não deve ter score artificialmente baixo por isto).
 */
function computeEvaluations(input: ScoreConsultantInput): FactorComputation {
  if (input.evaluationAverage === null) {
    return {
      score01: 0.5,
      available: false,
      detail: "Sem avaliação concluída ainda (fator neutro).",
    };
  }
  const score01 = clamp01(
    (input.evaluationAverage - SCORE_MIN) / (SCORE_MAX - SCORE_MIN),
  );
  return {
    score01,
    available: true,
    detail: `Média de avaliação ${input.evaluationAverage.toFixed(1)} de 5,0.`,
  };
}

// ── Fator: horas / presença ───────────────────────────────────────────────────

/**
 * Consistência de apontamento aprovado: razão horas aprovadas / horas esperadas,
 * 0..1. Saturada em 1 (apontar acima do esperado não compõe além do teto, mas
 * também não penaliza). Sem horas esperadas mensuráveis → neutro (0.5).
 */
function computeHours(input: ScoreConsultantInput): FactorComputation {
  if (input.expectedHours <= 0) {
    return {
      score01: 0.5,
      available: false,
      detail: "Sem horas esperadas mensuráveis na janela (fator neutro).",
    };
  }
  const ratio = input.approvedHours / input.expectedHours;
  const score01 = clamp01(ratio);
  return {
    score01,
    available: true,
    detail: `${formatHours(input.approvedHours)}h aprovadas de ${formatHours(
      input.expectedHours,
    )}h esperadas (${Math.round(ratio * 100)}%).`,
  };
}

// ── Fator: certificações ─────────────────────────────────────────────────────

/**
 * Certificados válidos saturam em CERTIFICATION_SATURATION; vencidos descontam
 * uma penalidade leve. Sem nenhum certificado (válido ou vencido) → indefinido,
 * entra NEUTRO (0.5): a ausência de certificado não é, por si, um demérito forte.
 */
function computeCertifications(input: ScoreConsultantInput): FactorComputation {
  const { validCertificates, expiredCertificates } = input;
  if (validCertificates === 0 && expiredCertificates === 0) {
    return {
      score01: 0.5,
      available: false,
      detail: "Sem certificados cadastrados (fator neutro).",
    };
  }
  const base = validCertificates / CERTIFICATION_SATURATION;
  const penalty = expiredCertificates * EXPIRED_CERTIFICATE_PENALTY;
  const score01 = clamp01(base - penalty);
  const expiredNote =
    expiredCertificates > 0 ? `, ${expiredCertificates} vencido(s)` : "";
  return {
    score01,
    available: true,
    detail: `${validCertificates} certificado(s) válido(s)${expiredNote}.`,
  };
}

// ── Fator: capacitação (cursos concluídos) ──────────────────────────────────

/**
 * Cursos concluídos (Enrollment COMPLETED) saturam em LEARNING_SATURATION.
 * Zero cursos → indefinido, entra NEUTRO (0.5): não ter curso registrado não é
 * um demérito forte (pode haver capacitação fora da Universidade).
 */
function computeLearning(input: ScoreConsultantInput): FactorComputation {
  if (input.completedCourses === 0) {
    return {
      score01: 0.5,
      available: false,
      detail: "Sem cursos concluídos registrados (fator neutro).",
    };
  }
  const score01 = clamp01(input.completedCourses / LEARNING_SATURATION);
  return {
    score01,
    available: true,
    detail: `${input.completedCourses} curso(s) concluído(s).`,
  };
}

// ── Fator: saldo de feedback ──────────────────────────────────────────────────

/**
 * Saldo de feedback: positivos (PRAISE/RECOGNITION) elevam, preocupações
 * (CONCERN) reduzem. Normaliza pelo total para virar uma razão estável 0..1
 * centrada em 0.5 (saldo neutro). Sem nenhum feedback → indefinido, entra NEUTRO.
 *
 * IMPORTANTE (LGPD): a engine só recebe CONTAGENS já filtradas por visibilidade
 * pelo servidor; nunca o conteúdo. O score não expõe nem cita feedbacks PRIVATE.
 */
function computeFeedback(input: ScoreConsultantInput): FactorComputation {
  const { positiveFeedbacks, concernFeedbacks } = input;
  const total = positiveFeedbacks + concernFeedbacks;
  if (total === 0) {
    return {
      score01: 0.5,
      available: false,
      detail: "Sem feedbacks no período (fator neutro).",
    };
  }
  // Razão de positivos no total, em 0..1: 100% positivos → 1, 100% concern → 0.
  const score01 = clamp01(positiveFeedbacks / total);
  return {
    score01,
    available: true,
    detail: `${positiveFeedbacks} positivo(s) e ${concernFeedbacks} de preocupação no período.`,
  };
}

// ── Fator: realização financeira (só para FINANCIAL_ROLES) ──────────────────

/**
 * Realização financeira 0..1: margem relativa da receita realizada sobre o custo
 * realizado, m = (receita - custo) / receita, clamp 0..1. Dados ausentes → neutro
 * (0.5). custo >= receita → 0 (sem margem). Só compõe quando includeFinancial.
 */
function computeFinancial(input: ScoreConsultantInput): FactorComputation {
  const { realizedRevenue, realizedCost } = input;
  if (
    realizedRevenue === null ||
    realizedCost === null ||
    realizedRevenue <= 0
  ) {
    return {
      score01: 0.5,
      available: false,
      detail: "Receita ou custo realizado indisponível (fator neutro).",
    };
  }
  const margin = (realizedRevenue - realizedCost) / realizedRevenue;
  if (margin <= 0) {
    return {
      score01: 0,
      available: true,
      detail: `Custo realizado (${formatMoney(realizedCost)}) iguala ou supera a receita (${formatMoney(realizedRevenue)}).`,
    };
  }
  return {
    score01: clamp01(margin),
    available: true,
    detail: `Margem realizada de ${Math.round(margin * 100)}% sobre a receita.`,
  };
}

// ── Tendência ────────────────────────────────────────────────────────────────

/**
 * Tendência a partir das médias de avaliação (atual vs anterior). UNKNOWN quando
 * não há histórico anterior; UP/DOWN/STABLE conforme a variação frente ao epsilon.
 */
function computeTrend(input: ScoreConsultantInput): {
  trend: ScoreTrend;
  delta: number | null;
} {
  if (
    input.evaluationAverage === null ||
    input.previousEvaluationAverage === null
  ) {
    return { trend: "UNKNOWN", delta: null };
  }
  const delta = input.evaluationAverage - input.previousEvaluationAverage;
  if (delta > TREND_EPSILON) return { trend: "UP", delta };
  if (delta < -TREND_EPSILON) return { trend: "DOWN", delta };
  return { trend: "STABLE", delta };
}

// ── Composição ───────────────────────────────────────────────────────────────

function buildFactor(
  key: ScoreFactorKey,
  comp: FactorComputation,
  weight: number,
): ScoreFactor {
  const safe01 = clamp01(comp.score01);
  return {
    key,
    label: scoreFactorLabels[key],
    score01: safe01,
    weight,
    contribution: safe01 * weight * 100,
    available: comp.available,
    detail: comp.detail,
  };
}

/** Classifica o score na faixa qualitativa. */
export function classifyScore(score: number): ScoreBand {
  if (score >= HIGH_THRESHOLD) return "HIGH";
  if (score >= MEDIUM_THRESHOLD) return "MEDIUM";
  return "LOW";
}

/**
 * Computa o score de UM consultor. `includeFinancial` controla se o fator de
 * realização financeira entra na composição; quando false, os pesos dos demais
 * fatores são renormalizados para somar 1.0 (sem fator financeiro oculto na
 * saída).
 */
export function computeConsultantScore(
  input: ScoreConsultantInput,
  includeFinancial: boolean,
): ScoreResult {
  const comps: Record<ScoreFactorKey, FactorComputation> = {
    evaluations: computeEvaluations(input),
    hours: computeHours(input),
    feedback: computeFeedback(input),
    certifications: computeCertifications(input),
    learning: computeLearning(input),
    financial: includeFinancial
      ? computeFinancial(input)
      : { score01: 0, available: false, detail: "" },
  };

  const activeKeys: ScoreFactorKey[] = [
    "evaluations",
    "hours",
    "feedback",
    "certifications",
    "learning",
  ];
  if (includeFinancial) activeKeys.push("financial");
  const totalWeight = activeKeys.reduce((acc, k) => acc + SCORE_WEIGHTS[k], 0);

  const factors: ScoreFactor[] = activeKeys.map((key) =>
    buildFactor(key, comps[key], SCORE_WEIGHTS[key] / totalWeight),
  );

  const score = Math.round(
    factors.reduce((acc, f) => acc + f.contribution, 0),
  );
  const band = classifyScore(score);
  const { trend, delta } = computeTrend(input);

  return {
    consultantId: input.consultantId,
    consultantName: input.consultantName,
    seniority: input.seniority,
    area: input.area,
    jobTitle: input.jobTitle,
    score,
    band,
    factors,
    trend,
    evaluationDelta: delta,
    financialIncluded: includeFinancial,
  };
}

/**
 * Computa o score de uma lista de consultores. Consultores INACTIVE são
 * descartados (não entram no ranking de score ativo). Ordena por score desc,
 * depois nome (pt-BR) — quem tem maior score aparece primeiro.
 */
export function computeConsultantScores(
  inputs: ReadonlyArray<ScoreConsultantInput>,
  includeFinancial: boolean,
): ScoreResult[] {
  return inputs
    .filter((c) => c.status !== "INACTIVE")
    .map((c) => computeConsultantScore(c, includeFinancial))
    .sort(
      (a, b) =>
        b.score - a.score ||
        a.consultantName.localeCompare(b.consultantName, "pt-BR"),
    );
}

// ── Formatação auxiliar ──────────────────────────────────────────────────────

function formatHours(value: number): string {
  return Number.isInteger(value) ? String(value) : value.toFixed(1);
}

function formatMoney(value: number): string {
  return `R$ ${value.toLocaleString("pt-BR", { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;
}
