import { describe, expect, it } from "vitest";
import {
  classifyRisk,
  computeProjectRisk,
  computeProjectRisks,
  RED_THRESHOLD,
  RISK_WEIGHTS,
  YELLOW_THRESHOLD,
} from "./engine";
import type { RiskProjectInput, RiskSignalKey } from "./types";

/**
 * Cobertura do núcleo determinístico da IA de Risco (§8.3): cada sinal isolado,
 * combinações, includeFinancial true/false, projeto sem budget/sem datas, bordas
 * de burn rate e a classificação GREEN/YELLOW/RED. `now` é injetado para
 * determinismo.
 */

const NOW = new Date("2026-06-19T00:00:00.000Z");

function day(offset: number): Date {
  return new Date(NOW.getTime() + offset * 24 * 60 * 60 * 1000);
}

/** Projeto base "saudável": dentro do orçamento, no prazo, sem feedbacks. */
function baseProject(overrides: Partial<RiskProjectInput> = {}): RiskProjectInput {
  return {
    projectId: "p1",
    projectName: "Projeto Base",
    clientName: "Cliente",
    status: "ACTIVE",
    budgetHours: 1000,
    approvedHours: 200,
    startDate: day(-30),
    endDate: day(120),
    estimatedCost: null,
    estimatedRevenue: null,
    recentConcernFeedbacks: 0,
    ...overrides,
  };
}

function signal(result: ReturnType<typeof computeProjectRisk>, key: RiskSignalKey) {
  return result.signals.find((s) => s.key === key);
}

describe("classifyRisk (thresholds GREEN/YELLOW/RED)", () => {
  it("score abaixo do limiar amarelo é GREEN", () => {
    expect(classifyRisk(0)).toBe("GREEN");
    expect(classifyRisk(YELLOW_THRESHOLD - 1)).toBe("GREEN");
  });
  it("score no limiar amarelo (inclusive) é YELLOW", () => {
    expect(classifyRisk(YELLOW_THRESHOLD)).toBe("YELLOW");
    expect(classifyRisk(RED_THRESHOLD - 1)).toBe("YELLOW");
  });
  it("score no limiar vermelho (inclusive) é RED", () => {
    expect(classifyRisk(RED_THRESHOLD)).toBe("RED");
    expect(classifyRisk(100)).toBe("RED");
  });
});

describe("pesos dos sinais", () => {
  it("somam 1.0", () => {
    const sum = Object.values(RISK_WEIGHTS).reduce((a, b) => a + b, 0);
    expect(sum).toBeCloseTo(1, 5);
  });
});

describe("sinal de burn rate (isolado)", () => {
  it("dentro do orçamento e no ritmo → risco baixo", () => {
    const r = computeProjectRisk(baseProject(), false, NOW);
    const burn = signal(r, "burnRate");
    expect(burn).toBeDefined();
    expect(burn!.risk01).toBeLessThan(0.2);
  });

  it("orçamento estourado → risco proporcional ao excedente", () => {
    // 1500h de 1000h = 150% consumido → overrun 0.5
    const r = computeProjectRisk(
      baseProject({ approvedHours: 1500 }),
      false,
      NOW,
    );
    const burn = signal(r, "burnRate")!;
    expect(burn.risk01).toBeCloseTo(0.5, 2);
    expect(burn.detail).toContain("estourado");
  });

  it("orçamento dobrado ou mais → risco máximo (saturado)", () => {
    const r = computeProjectRisk(
      baseProject({ approvedHours: 2500 }),
      false,
      NOW,
    );
    expect(signal(r, "burnRate")!.risk01).toBe(1);
  });

  it("consumo adiantado frente ao prazo decorrido pontua", () => {
    // 20% do prazo decorrido (startDate -30, endDate +120 → 150 dias, 30 elapsed
    // = 0.2) mas 80% do orçamento consumido → pace 0.6 → risco alto.
    const r = computeProjectRisk(
      baseProject({ approvedHours: 800 }),
      false,
      NOW,
    );
    const burn = signal(r, "burnRate")!;
    expect(burn.risk01).toBeGreaterThan(0.5);
    expect(burn.detail).toContain("adiantado");
  });

  it("sem orçamento → neutro 0.3 (não mensurável)", () => {
    const r = computeProjectRisk(
      baseProject({ budgetHours: null }),
      false,
      NOW,
    );
    const burn = signal(r, "burnRate")!;
    expect(burn.risk01).toBeCloseTo(0.3, 5);
    expect(burn.detail).toContain("Sem orçamento");
  });

  it("budgetHours zero é tratado como sem orçamento", () => {
    const r = computeProjectRisk(baseProject({ budgetHours: 0 }), false, NOW);
    expect(signal(r, "burnRate")!.risk01).toBeCloseTo(0.3, 5);
  });

  it("consumo exatamente no orçamento e no ritmo → sem risco", () => {
    // metade do prazo decorrido, metade do orçamento consumido.
    const r = computeProjectRisk(
      baseProject({
        startDate: day(-75),
        endDate: day(75),
        approvedHours: 500,
      }),
      false,
      NOW,
    );
    expect(signal(r, "burnRate")!.risk01).toBe(0);
  });
});

describe("sinal de prazo (isolado)", () => {
  it("projeto CLOSED → sem risco de prazo", () => {
    const r = computeProjectRisk(
      baseProject({ status: "CLOSED" }),
      false,
      NOW,
    );
    expect(signal(r, "schedule")!.risk01).toBe(0);
  });

  it("sem endDate → neutro 0.3", () => {
    const r = computeProjectRisk(baseProject({ endDate: null }), false, NOW);
    const sch = signal(r, "schedule")!;
    expect(sch.risk01).toBeCloseTo(0.3, 5);
    expect(sch.detail).toContain("Sem data de término");
  });

  it("prazo vencido com projeto aberto → risco alto", () => {
    const r = computeProjectRisk(
      baseProject({ endDate: day(-10), approvedHours: 200 }),
      false,
      NOW,
    );
    const sch = signal(r, "schedule")!;
    expect(sch.risk01).toBeGreaterThanOrEqual(0.7);
    expect(sch.detail).toContain("vencido");
  });

  it("perto do fim com muito trabalho pendente → risco médio", () => {
    // 90% do prazo decorrido (start -135, end +15 → 150 dias, 135 elapsed = 0.9),
    // só 10% do orçamento consumido (muito pendente).
    const r = computeProjectRisk(
      baseProject({
        startDate: day(-135),
        endDate: day(15),
        approvedHours: 100,
      }),
      false,
      NOW,
    );
    const sch = signal(r, "schedule")!;
    expect(sch.risk01).toBeGreaterThan(0);
    expect(sch.detail).toContain("pendente");
  });

  it("dentro do prazo com folga → sem risco", () => {
    const r = computeProjectRisk(baseProject(), false, NOW);
    expect(signal(r, "schedule")!.risk01).toBe(0);
  });
});

describe("sinal de feedbacks CONCERN (isolado)", () => {
  it("sem feedbacks → sem risco", () => {
    const r = computeProjectRisk(baseProject(), false, NOW);
    expect(signal(r, "feedback")!.risk01).toBe(0);
  });

  it("escala até saturar em 3", () => {
    const r1 = computeProjectRisk(
      baseProject({ recentConcernFeedbacks: 1 }),
      false,
      NOW,
    );
    const r3 = computeProjectRisk(
      baseProject({ recentConcernFeedbacks: 3 }),
      false,
      NOW,
    );
    const r5 = computeProjectRisk(
      baseProject({ recentConcernFeedbacks: 5 }),
      false,
      NOW,
    );
    expect(signal(r1, "feedback")!.risk01).toBeCloseTo(1 / 3, 5);
    expect(signal(r3, "feedback")!.risk01).toBe(1);
    expect(signal(r5, "feedback")!.risk01).toBe(1);
  });
});

describe("sinal de margem (gateado por includeFinancial)", () => {
  it("NÃO entra quando includeFinancial=false", () => {
    const r = computeProjectRisk(
      baseProject({ estimatedCost: 100, estimatedRevenue: 100 }),
      false,
      NOW,
    );
    expect(signal(r, "margin")).toBeUndefined();
    expect(r.financialIncluded).toBe(false);
    expect(r.signals.map((s) => s.key)).toEqual([
      "burnRate",
      "schedule",
      "feedback",
    ]);
  });

  it("entra quando includeFinancial=true", () => {
    const r = computeProjectRisk(
      baseProject({ estimatedCost: 50, estimatedRevenue: 100 }),
      true,
      NOW,
    );
    expect(signal(r, "margin")).toBeDefined();
    expect(r.financialIncluded).toBe(true);
  });

  it("margem negativa → risco máximo", () => {
    const r = computeProjectRisk(
      baseProject({ estimatedCost: 120, estimatedRevenue: 100 }),
      true,
      NOW,
    );
    const m = signal(r, "margin")!;
    expect(m.risk01).toBe(1);
    expect(m.detail).toContain("negativa");
  });

  it("margem saudável (>=30%) → risco baixo", () => {
    const r = computeProjectRisk(
      baseProject({ estimatedCost: 50, estimatedRevenue: 100 }),
      true,
      NOW,
    );
    expect(signal(r, "margin")!.risk01).toBe(0);
  });

  it("dados financeiros ausentes com flag on → neutro 0.3", () => {
    const r = computeProjectRisk(
      baseProject({ estimatedCost: null, estimatedRevenue: null }),
      true,
      NOW,
    );
    expect(signal(r, "margin")!.risk01).toBeCloseTo(0.3, 5);
  });
});

describe("renormalização de pesos", () => {
  it("sem margem, os 3 sinais somam peso 1.0", () => {
    const r = computeProjectRisk(baseProject(), false, NOW);
    const sum = r.signals.reduce((acc, s) => acc + s.weight, 0);
    expect(sum).toBeCloseTo(1, 5);
  });

  it("com margem, os 4 sinais somam peso 1.0", () => {
    const r = computeProjectRisk(
      baseProject({ estimatedCost: 50, estimatedRevenue: 100 }),
      true,
      NOW,
    );
    const sum = r.signals.reduce((acc, s) => acc + s.weight, 0);
    expect(sum).toBeCloseTo(1, 5);
  });

  it("o score é a soma das contribuições", () => {
    const r = computeProjectRisk(
      baseProject({ approvedHours: 1500, recentConcernFeedbacks: 3 }),
      false,
      NOW,
    );
    const sumContrib = r.signals.reduce((acc, s) => acc + s.contribution, 0);
    expect(r.score).toBe(Math.round(sumContrib));
  });
});

describe("classificação combinada GREEN/YELLOW/RED", () => {
  it("projeto saudável → GREEN", () => {
    const r = computeProjectRisk(baseProject(), false, NOW);
    expect(r.level).toBe("GREEN");
    expect(r.score).toBeLessThan(YELLOW_THRESHOLD);
  });

  it("estouro + atraso + feedbacks → RED", () => {
    const r = computeProjectRisk(
      baseProject({
        approvedHours: 1500,
        endDate: day(-20),
        recentConcernFeedbacks: 3,
        estimatedCost: 150,
        estimatedRevenue: 100,
      }),
      true,
      NOW,
    );
    expect(r.level).toBe("RED");
    expect(r.score).toBeGreaterThanOrEqual(RED_THRESHOLD);
  });

  it("consumo adiantado moderado + 1 feedback → YELLOW", () => {
    const r = computeProjectRisk(
      baseProject({
        approvedHours: 700,
        recentConcernFeedbacks: 1,
      }),
      false,
      NOW,
    );
    expect(r.level).toBe("YELLOW");
  });
});

describe("recomendações determinísticas", () => {
  it("projeto saudável → recomendação de rotina", () => {
    const r = computeProjectRisk(baseProject(), false, NOW);
    expect(r.recommendations).toHaveLength(1);
    expect(r.recommendations[0]).toContain("rotina");
  });

  it("burn rate em risco gera recomendação de orçamento", () => {
    const r = computeProjectRisk(
      baseProject({ approvedHours: 1500 }),
      false,
      NOW,
    );
    expect(
      r.recommendations.some((rec) => rec.toLowerCase().includes("orçamento")),
    ).toBe(true);
  });

  it("recomendações ordenadas por gravidade do sinal", () => {
    const r = computeProjectRisk(
      baseProject({
        approvedHours: 2500, // burn risk máximo
        endDate: day(-5), // schedule risco alto
        recentConcernFeedbacks: 3, // feedback risco médio-alto
      }),
      false,
      NOW,
    );
    // a primeira recomendação corresponde ao sinal de maior risco (burn=1).
    expect(r.recommendations[0].toLowerCase()).toContain("orçamento");
  });
});

describe("projeto sem budget e sem datas (bordas)", () => {
  it("não lança e produz um resultado coerente", () => {
    const r = computeProjectRisk(
      baseProject({ budgetHours: null, endDate: null, approvedHours: 0 }),
      false,
      NOW,
    );
    expect(r.signals).toHaveLength(3);
    // burn neutro 0.3, schedule neutro 0.3, feedback 0 → score modesto.
    expect(r.score).toBeGreaterThan(0);
    expect(r.level).toBeDefined();
  });

  it("datas invertidas (end antes de start) não quebram o cálculo de prazo", () => {
    const r = computeProjectRisk(
      baseProject({ startDate: day(10), endDate: day(-10) }),
      false,
      NOW,
    );
    // endDate no passado relativo a NOW → prazo vencido.
    expect(signal(r, "schedule")!.risk01).toBeGreaterThan(0);
  });
});

describe("computeProjectRisks (lista ordenada)", () => {
  it("ordena por gravidade: RED → YELLOW → GREEN", () => {
    const green = baseProject({ projectId: "g", projectName: "Green" });
    const red = baseProject({
      projectId: "r",
      projectName: "Red",
      approvedHours: 2500,
      endDate: day(-30),
      recentConcernFeedbacks: 3,
    });
    const yellow = baseProject({
      projectId: "y",
      projectName: "Yellow",
      approvedHours: 700,
      recentConcernFeedbacks: 1,
    });
    const results = computeProjectRisks([green, red, yellow], false, NOW);
    expect(results.map((r) => r.projectId)).toEqual(["r", "y", "g"]);
  });

  it("lista vazia → resultado vazio", () => {
    expect(computeProjectRisks([], false, NOW)).toEqual([]);
  });
});
