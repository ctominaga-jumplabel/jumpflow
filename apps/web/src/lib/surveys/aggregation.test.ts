import { describe, expect, it } from "vitest";
import {
  buildSurveyDashboard,
  canDiscloseAggregation,
  classifyNps,
  computeChoiceDistribution,
  computeNps,
  computeResponseRate,
  computeScaleAverage,
  type AggregationQuestion,
} from "./aggregation";
import { MIN_RESPONSES_TO_DISCLOSE } from "./types";

describe("classifyNps", () => {
  it("buckets 0-6 as detractor, 7-8 passive, 9-10 promoter", () => {
    expect(classifyNps(0)).toBe("detractor");
    expect(classifyNps(6)).toBe("detractor");
    expect(classifyNps(7)).toBe("passive");
    expect(classifyNps(8)).toBe("passive");
    expect(classifyNps(9)).toBe("promoter");
    expect(classifyNps(10)).toBe("promoter");
  });
});

describe("computeNps", () => {
  it("computes eNPS as %promoters - %detractors, rounded", () => {
    // 4 promoters (10,9,9,10), 1 passive (7), 5 detractors (0..6)
    const scores = [10, 9, 9, 10, 7, 0, 3, 5, 6, 6];
    const r = computeNps(scores);
    expect(r.promoters).toBe(4);
    expect(r.passives).toBe(1);
    expect(r.detractors).toBe(5);
    expect(r.total).toBe(10);
    // (40% - 50%) = -10
    expect(r.score).toBe(-10);
  });

  it("returns +100 when everyone is a promoter", () => {
    expect(computeNps([9, 10, 9, 10]).score).toBe(100);
  });

  it("returns -100 when everyone is a detractor", () => {
    expect(computeNps([0, 1, 6, 5]).score).toBe(-100);
  });

  it("ignores out-of-range scores", () => {
    const r = computeNps([9, 11, -1, 8]);
    expect(r.total).toBe(2); // only 9 and 8 counted
    expect(r.promoters).toBe(1);
    expect(r.passives).toBe(1);
  });

  it("returns score 0 for empty input", () => {
    expect(computeNps([])).toEqual({
      promoters: 0,
      passives: 0,
      detractors: 0,
      total: 0,
      score: 0,
    });
  });

  it("rounds the score to an integer", () => {
    // 1 promoter, 2 detractors → (33.3% - 66.6%) = -33
    expect(computeNps([10, 0, 0]).score).toBe(-33);
  });
});

describe("computeScaleAverage", () => {
  it("averages and rounds to 2 decimals", () => {
    const r = computeScaleAverage([5, 4, 4]);
    expect(r.average).toBeCloseTo(4.33, 2);
    expect(r.count).toBe(3);
  });

  it("returns 0 for empty input", () => {
    expect(computeScaleAverage([])).toEqual({ average: 0, count: 0 });
  });
});

describe("computeChoiceDistribution", () => {
  it("counts each declared option, including zeros", () => {
    const r = computeChoiceDistribution(
      ["Sim", "Não", "Talvez"],
      ["Sim", "Sim", "Não"],
    );
    expect(r.total).toBe(3);
    expect(r.items).toEqual([
      { option: "Sim", count: 2 },
      { option: "Não", count: 1 },
      { option: "Talvez", count: 0 },
    ]);
  });

  it("drops values not in the declared options (anti-tamper)", () => {
    const r = computeChoiceDistribution(["A", "B"], ["A", "Z", "B", "B"]);
    expect(r.total).toBe(3);
    expect(r.items).toEqual([
      { option: "A", count: 1 },
      { option: "B", count: 2 },
    ]);
  });
});

describe("computeResponseRate", () => {
  it("computes rate and guards zero invitations", () => {
    expect(computeResponseRate(3, 6)).toBe(0.5);
    expect(computeResponseRate(0, 0)).toBe(0);
    expect(computeResponseRate(5, 0)).toBe(0);
  });
});

describe("canDiscloseAggregation (minimum floor)", () => {
  it("uses the documented floor by default", () => {
    expect(MIN_RESPONSES_TO_DISCLOSE).toBe(3);
    expect(canDiscloseAggregation(2)).toBe(false);
    expect(canDiscloseAggregation(3)).toBe(true);
    expect(canDiscloseAggregation(4)).toBe(true);
  });

  it("honors a custom floor", () => {
    expect(canDiscloseAggregation(4, 5)).toBe(false);
    expect(canDiscloseAggregation(5, 5)).toBe(true);
  });
});

const npsQuestion = (over: Partial<AggregationQuestion> = {}): AggregationQuestion => ({
  id: "q1",
  text: "Recomendaria?",
  type: "NPS",
  options: [],
  scores: [9, 10, 0],
  choices: [],
  ...over,
});

describe("buildSurveyDashboard — disclosure floor (LGPD)", () => {
  it("hides ALL aggregations below the floor, keeping only counts/rate", () => {
    const dash = buildSurveyDashboard({
      surveyId: "s1",
      surveyTitle: "Clima",
      surveyType: "NPS",
      status: "OPEN",
      anonymous: true,
      invitationCount: 5,
      responseCount: 2, // below floor (3)
      questions: [npsQuestion()],
    });
    expect(dash.disclosed).toBe(false);
    expect(dash.nps).toEqual([]);
    expect(dash.scales).toEqual([]);
    expect(dash.choices).toEqual([]);
    // counts + rate still present (não identificam por si só)
    expect(dash.invitationCount).toBe(5);
    expect(dash.responseCount).toBe(2);
    expect(dash.responseRate).toBe(0.4);
    expect(dash.minToDisclose).toBe(3);
  });

  it("discloses aggregations at or above the floor", () => {
    const dash = buildSurveyDashboard({
      surveyId: "s1",
      surveyTitle: "Clima",
      surveyType: "NPS",
      status: "CLOSED",
      anonymous: true,
      invitationCount: 4,
      responseCount: 3,
      questions: [
        npsQuestion({ scores: [10, 9, 0] }),
        {
          id: "q2",
          text: "Satisfação",
          type: "SCALE",
          options: [],
          scores: [5, 4, 3],
          choices: [],
        },
        {
          id: "q3",
          text: "Modelo de trabalho",
          type: "CHOICE",
          options: ["Remoto", "Híbrido"],
          scores: [],
          choices: ["Remoto", "Remoto", "Híbrido"],
        },
        {
          id: "q4",
          text: "Comentário",
          type: "TEXT",
          options: [],
          scores: [],
          choices: [],
        },
      ],
    });
    expect(dash.disclosed).toBe(true);
    expect(dash.nps).toHaveLength(1);
    expect(dash.nps[0].score).toBe(33); // 2 promoters, 1 detractor → 66-33
    expect(dash.scales).toHaveLength(1);
    expect(dash.scales[0].average).toBe(4);
    expect(dash.choices).toHaveLength(1);
    expect(dash.choices[0].total).toBe(3);
    // TEXT is never aggregated (could reidentify)
    expect(dash.nps.find((n) => n.questionId === "q4")).toBeUndefined();
  });

  it("never aggregates TEXT questions even when disclosed", () => {
    const dash = buildSurveyDashboard({
      surveyId: "s1",
      surveyTitle: "Clima",
      surveyType: "CLIMATE",
      status: "OPEN",
      anonymous: true,
      invitationCount: 10,
      responseCount: 8,
      questions: [
        { id: "t", text: "Aberta", type: "TEXT", options: [], scores: [], choices: [] },
      ],
    });
    expect(dash.disclosed).toBe(true);
    expect(dash.nps).toEqual([]);
    expect(dash.scales).toEqual([]);
    expect(dash.choices).toEqual([]);
  });
});
