import {
  riskSignalLabels,
  type RiskLevel,
  type RiskProjectInput,
  type RiskResult,
  type RiskSignal,
  type RiskSignalKey,
} from "./types";

/**
 * Núcleo DETERMINÍSTICO da IA de Risco de Projeto (§8.3). Função pura: recebe um
 * projeto e suas métricas (rows já agregadas pelo servidor) e devolve um nível
 * GREEN/YELLOW/RED, um score 0..100 e o BREAKDOWN transparente por sinal, mais
 * recomendações textuais simples. Sem I/O, sem RBAC, sem LLM — a decisão de
 * incluir o sinal de margem chega como o booleano `includeFinancial` (resolvido
 * no servidor a partir de FINANCIAL_ROLES, ver docs/p3-inteligencia-design.md §5).
 *
 * O sentimento por LLM (atrás de flag) é um sinal À PARTE e NÃO entra aqui — não
 * altera o nível determinístico (design §1.2). IA é SUGESTÃO: o nível não muda
 * status do projeto.
 */

// ── Pesos dos sinais (documentados, transparentes) ──────────────────────────
//
// Os pesos somam 1.0. Quando o sinal de margem NÃO entra (requisitante não
// financeiro), os três sinais restantes são RENORMALIZADOS para somar 1.0 — o
// score continua numa escala 0..100 comparável, sem "mascarar" a saída com um
// sinal zerado escondido. A renormalização preserva a proporção relativa entre
// burn rate / prazo / feedback.
//
// Racional dos pesos:
// - burnRate (0.40): consumo de orçamento de horas vs prazo decorrido é o sinal
//   operacional mais forte de um projeto descarrilando (estouro ou consumo
//   adiantado). É o coração da IA de risco.
// - schedule (0.30): proximidade/ultrapassagem do prazo com trabalho pendente.
// - margin (0.20): erosão de margem (custo perto/acima da receita). Só compõe
//   para FINANCIAL_ROLES; quando ausente, os 0.20 são redistribuídos.
// - feedback (0.10): sinais de pessoas (feedbacks CONCERN recentes). Secundário
//   mas relevante: clima/insatisfação antecede problema de entrega.
export const RISK_WEIGHTS: Record<RiskSignalKey, number> = {
  burnRate: 0.4,
  schedule: 0.3,
  margin: 0.2,
  feedback: 0.1,
};

// ── Thresholds de classificação (score de risco 0..100) ─────────────────────
//
// score < YELLOW_THRESHOLD            → GREEN  (sob controle)
// YELLOW_THRESHOLD <= score < RED_*   → YELLOW (atenção)
// score >= RED_THRESHOLD              → RED    (risco alto)
export const YELLOW_THRESHOLD = 35;
export const RED_THRESHOLD = 65;

/**
 * Nº de feedbacks CONCERN recentes que satura o sinal de pessoas (risk01 = 1).
 * 3+ preocupações recentes = sinal de pessoas no máximo.
 */
export const FEEDBACK_SATURATION = 3;

/**
 * Folga de consumo adiantado tolerada antes de pontuar risco de burn rate. Se o
 * projeto consumiu até 10 p.p. a mais de orçamento do que de prazo decorrido,
 * ainda é considerado dentro do esperado (ruído de apontamento). Acima disso o
 * consumo adiantado começa a pontuar.
 */
export const BURN_PACE_TOLERANCE = 0.1;

function clamp01(v: number): number {
  if (Number.isNaN(v)) return 0;
  if (v < 0) return 0;
  if (v > 1) return 1;
  return v;
}

/** Fração de tempo decorrido do projeto (0..1) no instante `now`. */
function elapsedFraction(
  startDate: Date,
  endDate: Date | null,
  now: Date,
): number | null {
  if (!endDate) return null;
  const total = endDate.getTime() - startDate.getTime();
  if (total <= 0) return null; // datas inválidas/invertidas → indeterminado
  const elapsed = now.getTime() - startDate.getTime();
  return clamp01(elapsed / total);
}

// ── Sinal: burn rate ─────────────────────────────────────────────────────────

interface SignalResult {
  risk01: number;
  detail: string;
}

/**
 * Risco de consumo de horas, 0..1. Combina dois aspectos:
 * - Estouro de orçamento: horas aprovadas acima do orçamento é risco direto e
 *   crescente (excedente proporcional ao orçamento, saturado em 1).
 * - Consumo adiantado: % de orçamento consumido muito acima do % de prazo
 *   decorrido indica que o projeto vai estourar antes do fim.
 * Sem orçamento → indeterminado (neutro 0.3): não dá para medir burn rate, mas
 * a ausência de orçamento já é, por si, um pequeno sinal de descontrole.
 */
function computeBurnRate(
  project: RiskProjectInput,
  elapsed: number | null,
): SignalResult {
  const { budgetHours, approvedHours } = project;
  if (budgetHours === null || budgetHours <= 0) {
    return {
      risk01: 0.3,
      detail: `Sem orçamento de horas definido — burn rate não pode ser medido (${formatHours(approvedHours)}h apontadas).`,
    };
  }

  const consumed = approvedHours / budgetHours; // fração do orçamento consumida

  // Estouro de orçamento: cada 100% acima do orçamento → risco máximo.
  let overrunRisk = 0;
  if (consumed > 1) {
    overrunRisk = clamp01(consumed - 1);
  }

  // Consumo adiantado frente ao prazo decorrido (quando há prazo).
  let paceRisk = 0;
  if (elapsed !== null && elapsed > 0 && consumed <= 1) {
    const pace = consumed - elapsed; // >0 = consumindo mais rápido que o prazo
    if (pace > BURN_PACE_TOLERANCE) {
      // pace 0.1 → ~0 risco; pace 0.6 → ~1 risco.
      paceRisk = clamp01((pace - BURN_PACE_TOLERANCE) / 0.5);
    }
  }

  const risk01 = Math.max(overrunRisk, paceRisk);

  let detail: string;
  if (consumed > 1) {
    detail = `Orçamento estourado: ${Math.round(consumed * 100)}% das horas consumidas (${formatHours(approvedHours)}h de ${formatHours(budgetHours)}h).`;
  } else if (paceRisk > 0 && elapsed !== null) {
    detail = `Consumo adiantado: ${Math.round(consumed * 100)}% do orçamento com ${Math.round(elapsed * 100)}% do prazo decorrido.`;
  } else {
    detail = `${Math.round(consumed * 100)}% do orçamento consumido (${formatHours(approvedHours)}h de ${formatHours(budgetHours)}h).`;
  }
  return { risk01, detail };
}

// ── Sinal: prazo ──────────────────────────────────────────────────────────────

/**
 * Risco de prazo, 0..1. Considera proximidade/ultrapassagem do endDate com
 * trabalho pendente (orçamento de horas ainda não consumido).
 * - Sem endDate → indeterminado (neutro 0.3): sem prazo, sem controle de prazo.
 * - Projeto CLOSED → sem risco de prazo (0).
 * - endDate ultrapassado e projeto ainda aberto → risco alto, escalado pelo
 *   atraso e pelo trabalho pendente.
 * - Próximo do fim (>=80% do prazo) com muito orçamento pendente → risco médio.
 */
function computeSchedule(
  project: RiskProjectInput,
  elapsed: number | null,
  now: Date,
): SignalResult {
  if (project.status === "CLOSED") {
    return { risk01: 0, detail: "Projeto encerrado — sem risco de prazo." };
  }
  if (!project.endDate) {
    return {
      risk01: 0.3,
      detail: "Sem data de término definida — prazo não pode ser acompanhado.",
    };
  }

  const remaining01 = remainingWork01(project); // 0..1 de orçamento pendente

  // Atraso: endDate no passado e projeto ainda aberto.
  if (now.getTime() > project.endDate.getTime()) {
    const overdueDays = Math.floor(
      (now.getTime() - project.endDate.getTime()) / DAY_MS,
    );
    // Atraso por si só já é risco alto (0.7), agravado pelo trabalho pendente.
    const risk01 = clamp01(0.7 + 0.3 * remaining01);
    return {
      risk01,
      detail:
        remaining01 > 0
          ? `Prazo vencido há ${overdueDays} dia(s) com ~${Math.round(remaining01 * 100)}% do orçamento ainda pendente.`
          : `Prazo vencido há ${overdueDays} dia(s) (projeto ainda não encerrado).`,
    };
  }

  // No prazo: risco cresce conforme se aproxima do fim com trabalho pendente.
  if (elapsed !== null && elapsed >= 0.8 && remaining01 > 0.3) {
    const risk01 = clamp01((elapsed - 0.8) / 0.2) * remaining01;
    return {
      risk01,
      detail: `${Math.round(elapsed * 100)}% do prazo decorrido com ~${Math.round(remaining01 * 100)}% do orçamento pendente.`,
    };
  }

  return {
    risk01: 0,
    detail:
      elapsed !== null
        ? `Dentro do prazo (${Math.round(elapsed * 100)}% decorrido).`
        : "Dentro do prazo.",
  };
}

/** Fração de orçamento de horas ainda não consumida (0..1); 0 quando sem orçamento. */
function remainingWork01(project: RiskProjectInput): number {
  if (project.budgetHours === null || project.budgetHours <= 0) return 0;
  return clamp01(1 - project.approvedHours / project.budgetHours);
}

// ── Sinal: margem (só para FINANCIAL_ROLES) ─────────────────────────────────

/**
 * Risco de margem, 0..1. Quanto menor a margem (custo perto/acima da receita),
 * maior o risco. Dados ausentes → neutro 0.3 (não dá para medir, mas margem
 * desconhecida não é tranquilizadora). custo >= receita → risco máximo.
 */
function computeMargin(project: RiskProjectInput): SignalResult {
  const { estimatedCost, estimatedRevenue } = project;
  if (
    estimatedCost === null ||
    estimatedRevenue === null ||
    estimatedRevenue <= 0
  ) {
    return {
      risk01: 0.3,
      detail: "Custo ou receita estimada indisponível — margem não pode ser medida.",
    };
  }
  const margin = (estimatedRevenue - estimatedCost) / estimatedRevenue;
  if (margin <= 0) {
    return {
      risk01: 1,
      detail: `Margem negativa: custo estimado (${formatMoney(estimatedCost)}) iguala ou supera a receita (${formatMoney(estimatedRevenue)}).`,
    };
  }
  // Margem saudável >= 30% → risco baixo; margem 0% → risco máximo. Linear no meio.
  const risk01 = clamp01(1 - margin / 0.3);
  return {
    risk01,
    detail: `Margem estimada de ${Math.round(margin * 100)}% sobre a receita.`,
  };
}

// ── Sinal: feedbacks CONCERN ─────────────────────────────────────────────────

function computeFeedback(project: RiskProjectInput): SignalResult {
  const n = project.recentConcernFeedbacks;
  if (n <= 0) {
    return { risk01: 0, detail: "Sem feedbacks de preocupação recentes." };
  }
  const risk01 = clamp01(n / FEEDBACK_SATURATION);
  return {
    risk01,
    detail: `${n} feedback(s) de preocupação (CONCERN) recente(s) no projeto/equipe.`,
  };
}

// ── Recomendações determinísticas ────────────────────────────────────────────

/**
 * Gera recomendações textuais simples a partir dos sinais em risco. Determinística
 * (não-IA): cada recomendação só aparece quando o sinal correspondente passa de um
 * limiar de atenção. Ordenadas por gravidade do sinal (maior risk01 primeiro).
 */
function buildRecommendations(signals: RiskSignal[]): string[] {
  const recs: { key: RiskSignalKey; risk01: number; text: string }[] = [];
  const byKey = new Map(signals.map((s) => [s.key, s]));

  const burn = byKey.get("burnRate");
  if (burn && burn.risk01 >= 0.3) {
    recs.push({
      key: "burnRate",
      risk01: burn.risk01,
      text: "Revisar o orçamento de horas e o ritmo de apontamento; renegociar escopo ou budget se o consumo seguir adiantado.",
    });
  }
  const schedule = byKey.get("schedule");
  if (schedule && schedule.risk01 >= 0.3) {
    recs.push({
      key: "schedule",
      risk01: schedule.risk01,
      text: "Revisar o cronograma e a data de término; repactuar prazo com o cliente ou reforçar a alocação para o trabalho pendente.",
    });
  }
  const margin = byKey.get("margin");
  if (margin && margin.risk01 >= 0.3) {
    recs.push({
      key: "margin",
      risk01: margin.risk01,
      text: "Analisar a composição de custo vs valor de venda; ajustar a alocação (senioridade/custo) ou rever o valor de venda.",
    });
  }
  const feedback = byKey.get("feedback");
  if (feedback && feedback.risk01 >= 0.34) {
    recs.push({
      key: "feedback",
      risk01: feedback.risk01,
      text: "Conversar com a equipe alocada e o cliente sobre as preocupações registradas; tratar a causa antes que vire problema de entrega.",
    });
  }

  recs.sort((a, b) => b.risk01 - a.risk01);
  const ordered = recs.map((r) => r.text);
  if (ordered.length === 0) {
    return ["Projeto sob controle pelos sinais determinísticos — manter o acompanhamento de rotina."];
  }
  return ordered;
}

// ── Composição ───────────────────────────────────────────────────────────────

function buildSignal(
  key: RiskSignalKey,
  risk01: number,
  weight: number,
  detail: string,
): RiskSignal {
  const safe01 = clamp01(risk01);
  return {
    key,
    label: riskSignalLabels[key],
    risk01: safe01,
    weight,
    contribution: safe01 * weight * 100,
    detail,
  };
}

/** Classifica o score de risco no semáforo. */
export function classifyRisk(score: number): RiskLevel {
  if (score >= RED_THRESHOLD) return "RED";
  if (score >= YELLOW_THRESHOLD) return "YELLOW";
  return "GREEN";
}

/**
 * Computa o risco de UM projeto. `includeFinancial` controla se o sinal de
 * margem entra na composição; quando false, os pesos dos demais sinais são
 * renormalizados para somar 1.0 (sem sinal de margem oculto na saída). `now`
 * injetável para testes determinísticos.
 */
export function computeProjectRisk(
  project: RiskProjectInput,
  includeFinancial: boolean,
  now: Date = new Date(),
): RiskResult {
  const elapsed = elapsedFraction(project.startDate, project.endDate, now);

  const burn = computeBurnRate(project, elapsed);
  const schedule = computeSchedule(project, elapsed, now);
  const margin = includeFinancial ? computeMargin(project) : null;
  const feedback = computeFeedback(project);

  const activeKeys: RiskSignalKey[] = ["burnRate", "schedule", "feedback"];
  if (includeFinancial) activeKeys.push("margin");
  const totalWeight = activeKeys.reduce((acc, k) => acc + RISK_WEIGHTS[k], 0);

  const risk01For: Record<RiskSignalKey, number> = {
    burnRate: burn.risk01,
    schedule: schedule.risk01,
    margin: margin?.risk01 ?? 0,
    feedback: feedback.risk01,
  };
  const detailFor: Record<RiskSignalKey, string> = {
    burnRate: burn.detail,
    schedule: schedule.detail,
    margin: margin?.detail ?? "",
    feedback: feedback.detail,
  };

  const signals: RiskSignal[] = activeKeys.map((key) =>
    buildSignal(key, risk01For[key], RISK_WEIGHTS[key] / totalWeight, detailFor[key]),
  );

  const score = Math.round(
    signals.reduce((acc, s) => acc + s.contribution, 0),
  );
  const level = classifyRisk(score);
  const recommendations = buildRecommendations(signals);

  return {
    projectId: project.projectId,
    projectName: project.projectName,
    clientName: project.clientName,
    level,
    score,
    signals,
    recommendations,
    financialIncluded: includeFinancial,
  };
}

/**
 * Computa o risco de uma lista de projetos. Ordena por gravidade: nível
 * (RED → YELLOW → GREEN), depois score desc, depois nome (pt-BR) — os projetos
 * que mais exigem atenção aparecem primeiro.
 */
export function computeProjectRisks(
  projects: ReadonlyArray<RiskProjectInput>,
  includeFinancial: boolean,
  now: Date = new Date(),
): RiskResult[] {
  const levelRank: Record<RiskLevel, number> = { RED: 0, YELLOW: 1, GREEN: 2 };
  return projects
    .map((p) => computeProjectRisk(p, includeFinancial, now))
    .sort(
      (a, b) =>
        levelRank[a.level] - levelRank[b.level] ||
        b.score - a.score ||
        a.projectName.localeCompare(b.projectName, "pt-BR"),
    );
}

// ── Formatação auxiliar ──────────────────────────────────────────────────────

const DAY_MS = 24 * 60 * 60 * 1000;

function formatHours(value: number): string {
  return Number.isInteger(value) ? String(value) : value.toFixed(1);
}

function formatMoney(value: number): string {
  return `R$ ${value.toLocaleString("pt-BR", { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;
}
