import {
  MIN_RESPONSES_TO_DISCLOSE,
  type ChoiceDistribution,
  type NpsBreakdown,
  type ScaleAverage,
  type SurveyDashboard,
  type SurveyStatus,
  type SurveyType,
} from "./types";

/**
 * Pure aggregation for the Pesquisa de Clima / NPS module (EP 7.1).
 *
 * No I/O: the DB read layer (`lib/db/surveys.ts`) loads the answers and calls
 * these functions, so the math (NPS/eNPS, médias, distribuição) and the
 * minimum-disclosure floor are unit-tested in isolation. The floor is the LGPD
 * guardrail: it must be impossible to surface any aggregation below
 * `MIN_RESPONSES_TO_DISCLOSE` distinct submitted responses
 * (docs/backlog-talentos.md §3).
 */

// ── NPS / eNPS ──────────────────────────────────────────────────────────────

/**
 * Classify a single 0-10 NPS/eNPS score. Standard buckets: 9-10 promoter,
 * 7-8 passive, 0-6 detractor. Out-of-range values are ignored by the caller.
 */
export function classifyNps(
  score: number,
): "promoter" | "passive" | "detractor" {
  if (score >= 9) return "promoter";
  if (score >= 7) return "passive";
  return "detractor";
}

/**
 * Compute the NPS/eNPS score from a list of 0-10 scores. Formula: percentage of
 * promoters minus percentage of detractors, rounded to an integer in -100..100.
 * Scores outside 0-10 are discarded. Empty input → 0 promoters/detractors and
 * score 0 (callers should still gate on the disclosure floor).
 */
export function computeNps(scores: readonly number[]): {
  promoters: number;
  passives: number;
  detractors: number;
  total: number;
  score: number;
} {
  let promoters = 0;
  let passives = 0;
  let detractors = 0;
  for (const raw of scores) {
    if (!Number.isFinite(raw) || raw < 0 || raw > 10) continue;
    const bucket = classifyNps(raw);
    if (bucket === "promoter") promoters += 1;
    else if (bucket === "passive") passives += 1;
    else detractors += 1;
  }
  const total = promoters + passives + detractors;
  const score =
    total === 0
      ? 0
      : Math.round(((promoters - detractors) / total) * 100);
  return { promoters, passives, detractors, total, score };
}

// ── Média de escala (SCALE 1-5) ─────────────────────────────────────────────

/** Average of a list of scale scores, rounded to 2 decimals. 0 when empty. */
export function computeScaleAverage(scores: readonly number[]): {
  average: number;
  count: number;
} {
  const valid = scores.filter((s) => Number.isFinite(s));
  if (valid.length === 0) return { average: 0, count: 0 };
  const sum = valid.reduce((acc, s) => acc + s, 0);
  return {
    average: Math.round((sum / valid.length) * 100) / 100,
    count: valid.length,
  };
}

// ── Distribuição de CHOICE ──────────────────────────────────────────────────

/**
 * Count occurrences per option. Unknown choices (not in `options`) are dropped
 * so a tampered client cannot inject phantom buckets; every declared option is
 * always present (count 0 when nobody picked it).
 */
export function computeChoiceDistribution(
  options: readonly string[],
  values: readonly string[],
): { items: { option: string; count: number }[]; total: number } {
  const counts = new Map<string, number>();
  for (const option of options) counts.set(option, 0);
  let total = 0;
  for (const value of values) {
    if (!counts.has(value)) continue;
    counts.set(value, (counts.get(value) ?? 0) + 1);
    total += 1;
  }
  return {
    items: options.map((option) => ({
      option,
      count: counts.get(option) ?? 0,
    })),
    total,
  };
}

// ── Piso mínimo de exibição (LGPD) ──────────────────────────────────────────

/**
 * Whether a survey with `responseCount` submitted responses may have its
 * aggregations disclosed. Single source of truth for the anonymity floor; the
 * dashboard builder calls this and zeroes every aggregation when it returns
 * false. `floor` is overridable only for tests.
 */
export function canDiscloseAggregation(
  responseCount: number,
  floor: number = MIN_RESPONSES_TO_DISCLOSE,
): boolean {
  return responseCount >= floor;
}

/** Response rate in 0..1 (0 when there are no invitations). */
export function computeResponseRate(
  responseCount: number,
  invitationCount: number,
): number {
  if (invitationCount <= 0) return 0;
  return Math.round((responseCount / invitationCount) * 100) / 100;
}

// ── Montagem do dashboard ───────────────────────────────────────────────────

/** Uma questão com as respostas já coletadas (pura — sem identidade). */
export interface AggregationQuestion {
  id: string;
  text: string;
  type: "SCALE" | "NPS" | "TEXT" | "CHOICE";
  options: string[];
  /** Notas (SCALE/NPS) das respostas a esta questão. */
  scores: number[];
  /** Valores escolhidos (CHOICE) das respostas a esta questão. */
  choices: string[];
}

export interface BuildDashboardInput {
  surveyId: string;
  surveyTitle: string;
  surveyType: SurveyType;
  status: SurveyStatus;
  anonymous: boolean;
  invitationCount: number;
  responseCount: number;
  questions: AggregationQuestion[];
  /** Override do piso (testes); produção usa o default. */
  floor?: number;
}

/**
 * Build the aggregated dashboard. LGPD guardrail: when the response count is
 * below the disclosure floor, EVERY aggregation array is empty — only the
 * counts/rate (never identifying on their own) are returned, with
 * `disclosed: false`. The math itself never touches identity (no consultantId
 * exists in the input by design).
 */
export function buildSurveyDashboard(
  input: BuildDashboardInput,
): SurveyDashboard {
  const floor = input.floor ?? MIN_RESPONSES_TO_DISCLOSE;
  const disclosed = canDiscloseAggregation(input.responseCount, floor);
  const responseRate = computeResponseRate(
    input.responseCount,
    input.invitationCount,
  );

  const nps: NpsBreakdown[] = [];
  const scales: ScaleAverage[] = [];
  const choices: ChoiceDistribution[] = [];

  if (disclosed) {
    for (const q of input.questions) {
      if (q.type === "NPS") {
        const r = computeNps(q.scores);
        nps.push({
          questionId: q.id,
          questionText: q.text,
          promoters: r.promoters,
          passives: r.passives,
          detractors: r.detractors,
          total: r.total,
          score: r.score,
        });
      } else if (q.type === "SCALE") {
        const r = computeScaleAverage(q.scores);
        scales.push({
          questionId: q.id,
          questionText: q.text,
          average: r.average,
          count: r.count,
        });
      } else if (q.type === "CHOICE") {
        const r = computeChoiceDistribution(q.options, q.choices);
        choices.push({
          questionId: q.id,
          questionText: q.text,
          total: r.total,
          items: r.items,
        });
      }
      // TEXT: respostas abertas não são agregadas no dashboard (poderiam
      // reidentificar). Ficam fora do agregado automático por design.
    }
  }

  return {
    surveyId: input.surveyId,
    surveyTitle: input.surveyTitle,
    surveyType: input.surveyType,
    status: input.status,
    anonymous: input.anonymous,
    invitationCount: input.invitationCount,
    responseCount: input.responseCount,
    responseRate,
    minToDisclose: floor,
    disclosed,
    nps,
    scales,
    choices,
  };
}
