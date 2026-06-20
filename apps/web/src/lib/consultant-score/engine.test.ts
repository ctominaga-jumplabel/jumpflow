import { describe, expect, it } from "vitest";
import {
  CERTIFICATION_SATURATION,
  classifyScore,
  computeConsultantScore,
  computeConsultantScores,
  HIGH_THRESHOLD,
  LEARNING_SATURATION,
  MEDIUM_THRESHOLD,
  SCORE_WEIGHTS,
  TREND_EPSILON,
} from "./engine";
import type { ScoreConsultantInput, ScoreFactorKey } from "./types";

/**
 * Cobertura do núcleo determinístico do Score do Consultor (§8.4): cada fator
 * isolado, includeFinancial true/false (com renormalização de pesos), consultor
 * sem avaliação / sem dados, bordas (certificados vencidos, cursos/feedback
 * saturando, margem negativa) e a tendência (UP/DOWN/STABLE/UNKNOWN). A engine é
 * pura — nenhum `now` é necessário (a janela já chega agregada como horas).
 */

/** Consultor base "neutro": sem nenhum dado. Todos os fatores entram neutros. */
function baseConsultant(
  overrides: Partial<ScoreConsultantInput> = {},
): ScoreConsultantInput {
  return {
    consultantId: "c1",
    consultantName: "Base",
    seniority: "MID_LEVEL",
    area: "Engenharia",
    jobTitle: null,
    status: "ACTIVE",
    evaluationAverage: null,
    previousEvaluationAverage: null,
    approvedHours: 0,
    expectedHours: 0,
    validCertificates: 0,
    expiredCertificates: 0,
    completedCourses: 0,
    positiveFeedbacks: 0,
    concernFeedbacks: 0,
    realizedRevenue: null,
    realizedCost: null,
    ...overrides,
  };
}

function factor(result: ReturnType<typeof computeConsultantScore>, key: ScoreFactorKey) {
  return result.factors.find((f) => f.key === key);
}

describe("classifyScore", () => {
  it("classifica nas faixas pelos thresholds", () => {
    expect(classifyScore(HIGH_THRESHOLD)).toBe("HIGH");
    expect(classifyScore(HIGH_THRESHOLD - 1)).toBe("MEDIUM");
    expect(classifyScore(MEDIUM_THRESHOLD)).toBe("MEDIUM");
    expect(classifyScore(MEDIUM_THRESHOLD - 1)).toBe("LOW");
    expect(classifyScore(0)).toBe("LOW");
    expect(classifyScore(100)).toBe("HIGH");
  });
});

describe("computeConsultantScore — pesos e renormalização", () => {
  it("sem financeiro: 5 fatores ativos, pesos somam ~1", () => {
    const r = computeConsultantScore(baseConsultant(), false);
    expect(r.factors).toHaveLength(5);
    expect(r.factors.some((f) => f.key === "financial")).toBe(false);
    const sumWeights = r.factors.reduce((a, f) => a + f.weight, 0);
    expect(sumWeights).toBeCloseTo(1, 6);
    expect(r.financialIncluded).toBe(false);
  });

  it("com financeiro: 6 fatores ativos, pesos somam ~1", () => {
    const r = computeConsultantScore(baseConsultant(), true);
    expect(r.factors).toHaveLength(6);
    expect(r.factors.some((f) => f.key === "financial")).toBe(true);
    const sumWeights = r.factors.reduce((a, f) => a + f.weight, 0);
    expect(sumWeights).toBeCloseTo(1, 6);
    expect(r.financialIncluded).toBe(true);
  });

  it("renormaliza preservando proporção entre os fatores não-financeiros", () => {
    const withFin = computeConsultantScore(baseConsultant(), true);
    const withoutFin = computeConsultantScore(baseConsultant(), false);
    const ratioWith =
      withFin.factors.find((f) => f.key === "evaluations")!.weight /
      withFin.factors.find((f) => f.key === "hours")!.weight;
    const ratioWithout =
      withoutFin.factors.find((f) => f.key === "evaluations")!.weight /
      withoutFin.factors.find((f) => f.key === "hours")!.weight;
    expect(ratioWith).toBeCloseTo(ratioWithout, 6);
    // proporção bruta dos pesos documentados:
    expect(ratioWithout).toBeCloseTo(
      SCORE_WEIGHTS.evaluations / SCORE_WEIGHTS.hours,
      6,
    );
  });

  it("consultor totalmente neutro (sem dado) tem score ~50 (todos os fatores 0.5)", () => {
    const r = computeConsultantScore(baseConsultant(), false);
    // 5 fatores neutros (0.5) → ~50
    expect(r.score).toBe(50);
    expect(r.band).toBe("MEDIUM");
    // todos marcados como indisponíveis (sem dado)
    expect(r.factors.every((f) => !f.available)).toBe(true);
  });
});

describe("fator: avaliações", () => {
  it("sem avaliação → neutro e indisponível", () => {
    const r = computeConsultantScore(baseConsultant({ evaluationAverage: null }), false);
    const f = factor(r, "evaluations")!;
    expect(f.score01).toBe(0.5);
    expect(f.available).toBe(false);
  });

  it("normaliza a média 1..5 para 0..1", () => {
    expect(
      factor(computeConsultantScore(baseConsultant({ evaluationAverage: 1 }), false), "evaluations")!
        .score01,
    ).toBeCloseTo(0, 6);
    expect(
      factor(computeConsultantScore(baseConsultant({ evaluationAverage: 3 }), false), "evaluations")!
        .score01,
    ).toBeCloseTo(0.5, 6);
    expect(
      factor(computeConsultantScore(baseConsultant({ evaluationAverage: 5 }), false), "evaluations")!
        .score01,
    ).toBeCloseTo(1, 6);
  });
});

describe("fator: horas / presença", () => {
  it("sem horas esperadas → neutro e indisponível", () => {
    const f = factor(computeConsultantScore(baseConsultant({ expectedHours: 0 }), false), "hours")!;
    expect(f.score01).toBe(0.5);
    expect(f.available).toBe(false);
  });

  it("razão aprovadas/esperadas, saturada em 1", () => {
    expect(
      factor(computeConsultantScore(baseConsultant({ approvedHours: 80, expectedHours: 160 }), false), "hours")!
        .score01,
    ).toBeCloseTo(0.5, 6);
    expect(
      factor(computeConsultantScore(baseConsultant({ approvedHours: 200, expectedHours: 160 }), false), "hours")!
        .score01,
    ).toBe(1);
    const f = factor(
      computeConsultantScore(baseConsultant({ approvedHours: 160, expectedHours: 160 }), false),
      "hours",
    )!;
    expect(f.score01).toBe(1);
    expect(f.available).toBe(true);
  });
});

describe("fator: certificações", () => {
  it("sem certificado → neutro e indisponível", () => {
    const f = factor(computeConsultantScore(baseConsultant(), false), "certifications")!;
    expect(f.score01).toBe(0.5);
    expect(f.available).toBe(false);
  });

  it("válidos saturam; vencidos descontam penalidade leve", () => {
    const full = factor(
      computeConsultantScore(baseConsultant({ validCertificates: CERTIFICATION_SATURATION }), false),
      "certifications",
    )!;
    expect(full.score01).toBe(1);
    expect(full.available).toBe(true);

    const withExpired = factor(
      computeConsultantScore(baseConsultant({ validCertificates: 0, expiredCertificates: 2 }), false),
      "certifications",
    )!;
    // base 0, penalidade 2*0.15 → clamp 0
    expect(withExpired.score01).toBe(0);
    expect(withExpired.available).toBe(true);
  });
});

describe("fator: capacitação", () => {
  it("sem curso → neutro e indisponível", () => {
    const f = factor(computeConsultantScore(baseConsultant(), false), "learning")!;
    expect(f.score01).toBe(0.5);
    expect(f.available).toBe(false);
  });

  it("cursos concluídos saturam em LEARNING_SATURATION", () => {
    expect(
      factor(computeConsultantScore(baseConsultant({ completedCourses: LEARNING_SATURATION }), false), "learning")!
        .score01,
    ).toBe(1);
    expect(
      factor(computeConsultantScore(baseConsultant({ completedCourses: LEARNING_SATURATION + 5 }), false), "learning")!
        .score01,
    ).toBe(1);
    expect(
      factor(computeConsultantScore(baseConsultant({ completedCourses: 1 }), false), "learning")!
        .score01,
    ).toBeCloseTo(1 / LEARNING_SATURATION, 6);
  });
});

describe("fator: saldo de feedback", () => {
  it("sem feedback → neutro e indisponível", () => {
    const f = factor(computeConsultantScore(baseConsultant(), false), "feedback")!;
    expect(f.score01).toBe(0.5);
    expect(f.available).toBe(false);
  });

  it("razão de positivos no total", () => {
    expect(
      factor(computeConsultantScore(baseConsultant({ positiveFeedbacks: 4, concernFeedbacks: 0 }), false), "feedback")!
        .score01,
    ).toBe(1);
    expect(
      factor(computeConsultantScore(baseConsultant({ positiveFeedbacks: 0, concernFeedbacks: 3 }), false), "feedback")!
        .score01,
    ).toBe(0);
    expect(
      factor(computeConsultantScore(baseConsultant({ positiveFeedbacks: 2, concernFeedbacks: 2 }), false), "feedback")!
        .score01,
    ).toBeCloseTo(0.5, 6);
  });
});

describe("fator: realização financeira (só quando includeFinancial)", () => {
  it("não entra quando includeFinancial = false", () => {
    const r = computeConsultantScore(
      baseConsultant({ realizedRevenue: 1000, realizedCost: 500 }),
      false,
    );
    expect(factor(r, "financial")).toBeUndefined();
  });

  it("dados ausentes → neutro e indisponível", () => {
    const f = factor(
      computeConsultantScore(baseConsultant({ realizedRevenue: null, realizedCost: null }), true),
      "financial",
    )!;
    expect(f.score01).toBe(0.5);
    expect(f.available).toBe(false);
  });

  it("margem positiva normaliza; custo >= receita → 0", () => {
    const good = factor(
      computeConsultantScore(baseConsultant({ realizedRevenue: 1000, realizedCost: 700 }), true),
      "financial",
    )!;
    expect(good.score01).toBeCloseTo(0.3, 6);
    expect(good.available).toBe(true);

    const bad = factor(
      computeConsultantScore(baseConsultant({ realizedRevenue: 1000, realizedCost: 1200 }), true),
      "financial",
    )!;
    expect(bad.score01).toBe(0);
    expect(bad.available).toBe(true);
  });
});

describe("tendência", () => {
  it("UNKNOWN sem histórico (sem média atual ou anterior)", () => {
    expect(computeConsultantScore(baseConsultant(), false).trend).toBe("UNKNOWN");
    expect(
      computeConsultantScore(baseConsultant({ evaluationAverage: 4 }), false).trend,
    ).toBe("UNKNOWN");
    expect(computeConsultantScore(baseConsultant(), false).evaluationDelta).toBeNull();
  });

  it("UP / DOWN / STABLE conforme a variação frente ao epsilon", () => {
    const up = computeConsultantScore(
      baseConsultant({ evaluationAverage: 4.5, previousEvaluationAverage: 4.0 }),
      false,
    );
    expect(up.trend).toBe("UP");
    expect(up.evaluationDelta).toBeCloseTo(0.5, 6);

    const down = computeConsultantScore(
      baseConsultant({ evaluationAverage: 3.0, previousEvaluationAverage: 4.0 }),
      false,
    );
    expect(down.trend).toBe("DOWN");

    const stable = computeConsultantScore(
      baseConsultant({
        evaluationAverage: 4.0 + TREND_EPSILON / 2,
        previousEvaluationAverage: 4.0,
      }),
      false,
    );
    expect(stable.trend).toBe("STABLE");
  });
});

describe("score combinado — consultor forte", () => {
  it("dados fortes em todos os fatores produzem score alto e banda HIGH", () => {
    const r = computeConsultantScore(
      baseConsultant({
        evaluationAverage: 4.8,
        previousEvaluationAverage: 4.2,
        approvedHours: 500,
        expectedHours: 500,
        validCertificates: 3,
        completedCourses: 4,
        positiveFeedbacks: 6,
        concernFeedbacks: 0,
        realizedRevenue: 100000,
        realizedCost: 40000,
      }),
      true,
    );
    expect(r.score).toBeGreaterThanOrEqual(HIGH_THRESHOLD);
    expect(r.band).toBe("HIGH");
    expect(r.trend).toBe("UP");
    expect(r.factors.every((f) => f.available)).toBe(true);
  });

  it("contribution = score01 * weight * 100 e soma = score", () => {
    const r = computeConsultantScore(
      baseConsultant({ evaluationAverage: 4, approvedHours: 100, expectedHours: 100 }),
      false,
    );
    for (const f of r.factors) {
      expect(f.contribution).toBeCloseTo(f.score01 * f.weight * 100, 6);
    }
    const sum = r.factors.reduce((a, f) => a + f.contribution, 0);
    expect(r.score).toBe(Math.round(sum));
  });
});

describe("computeConsultantScores — lista", () => {
  it("descarta INACTIVE e ordena por score desc", () => {
    const inputs: ScoreConsultantInput[] = [
      baseConsultant({ consultantId: "low", consultantName: "Zé", evaluationAverage: 2 }),
      baseConsultant({ consultantId: "high", consultantName: "Ana", evaluationAverage: 5, approvedHours: 100, expectedHours: 100, validCertificates: 3, completedCourses: 4, positiveFeedbacks: 5 }),
      baseConsultant({ consultantId: "inactive", consultantName: "Inativo", status: "INACTIVE", evaluationAverage: 5 }),
    ];
    const results = computeConsultantScores(inputs, false);
    expect(results.map((r) => r.consultantId)).toEqual(["high", "low"]);
    expect(results.some((r) => r.consultantId === "inactive")).toBe(false);
  });

  it("desempate por nome (pt-BR) com scores iguais", () => {
    const inputs: ScoreConsultantInput[] = [
      baseConsultant({ consultantId: "b", consultantName: "Bruno" }),
      baseConsultant({ consultantId: "a", consultantName: "Ana" }),
    ];
    const results = computeConsultantScores(inputs, false);
    expect(results.map((r) => r.consultantName)).toEqual(["Ana", "Bruno"]);
  });
});
