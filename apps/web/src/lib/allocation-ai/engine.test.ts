import { describe, expect, it } from "vitest";
import {
  computeFit,
  rankCandidates,
  FIT_WEIGHTS,
  HISTORY_SATURATION,
} from "./engine";
import type {
  FitCandidateInput,
  FitResult,
  FitTargetInput,
  RequiredSkillInput,
} from "./types";

// ── Helpers ─────────────────────────────────────────────────────────────────

function req(
  skillId: string,
  requiredLevel: RequiredSkillInput["requiredLevel"] = null,
): RequiredSkillInput {
  return { skillId, skillName: skillId, requiredLevel };
}

function candidate(
  over: Partial<FitCandidateInput> = {},
): FitCandidateInput {
  return {
    consultantId: "c1",
    consultantName: "Consultor",
    seniority: "MID_LEVEL",
    area: null,
    jobTitle: null,
    skills: [],
    availabilityState: null,
    pastAllocationsWithClient: 0,
    hourlyCost: null,
    status: "ACTIVE",
    ...over,
  };
}

function target(over: Partial<FitTargetInput> = {}): FitTargetInput {
  return { requiredSkills: [], saleRate: null, ...over };
}

const factor = (r: FitResult, key: string) =>
  r.factors.find((f) => f.key === key)!;

// ── Aderência de skills ──────────────────────────────────────────────────────

describe("computeFit — aderência de skills", () => {
  it("aderência total: cobre todas as skills no nível requerido", () => {
    const r = computeFit(
      target({ requiredSkills: [req("react", "ADVANCED"), req("node", "INTERMEDIATE")] }),
      candidate({
        skills: [
          { skillId: "react", level: "ADVANCED" },
          { skillId: "node", level: "SPECIALIST" },
        ],
      }),
      false,
    );
    expect(factor(r, "skills").score01).toBe(1);
    expect(r.skillsMet).toBe(2);
    expect(r.skillsRequired).toBe(2);
    expect(r.skillDetails.every((d) => d.meets)).toBe(true);
  });

  it("aderência parcial: cobre uma de duas skills", () => {
    const r = computeFit(
      target({ requiredSkills: [req("react", "ADVANCED"), req("node", "ADVANCED")] }),
      candidate({
        skills: [
          { skillId: "react", level: "ADVANCED" },
          // node ausente
        ],
      }),
      false,
    );
    // react = 1, node = 0 → média 0.5
    expect(factor(r, "skills").score01).toBeCloseTo(0.5, 5);
    expect(r.skillsMet).toBe(1);
    const node = r.skillDetails.find((d) => d.skillId === "node")!;
    expect(node.meets).toBe(false);
    expect(node.currentLevel).toBeNull();
  });

  it("aderência zero: não possui nenhuma skill exigida", () => {
    const r = computeFit(
      target({ requiredSkills: [req("react", "ADVANCED")] }),
      candidate({ skills: [{ skillId: "outra", level: "SPECIALIST" }] }),
      false,
    );
    expect(factor(r, "skills").score01).toBe(0);
    expect(r.skillsMet).toBe(0);
  });

  it("nível abaixo do requerido conta proporcionalmente e não 'meets'", () => {
    const r = computeFit(
      target({ requiredSkills: [req("react", "SPECIALIST")] }),
      candidate({ skills: [{ skillId: "react", level: "INTERMEDIATE" }] }),
      false,
    );
    // pesos +1: cur=2, req=4 → 0.5
    expect(factor(r, "skills").score01).toBeCloseTo(0.5, 5);
    expect(r.skillDetails[0].meets).toBe(false);
    expect(r.skillsMet).toBe(0);
  });

  it("excedente de nível satura em 1 (não passa de 100%)", () => {
    const r = computeFit(
      target({ requiredSkills: [req("react", "BASIC")] }),
      candidate({ skills: [{ skillId: "react", level: "SPECIALIST" }] }),
      false,
    );
    expect(factor(r, "skills").score01).toBe(1);
    expect(r.skillDetails[0].meets).toBe(true);
  });

  it("skill sem nível requerido: possuir valida (1), não possuir zera (0)", () => {
    const has = computeFit(
      target({ requiredSkills: [req("react", null)] }),
      candidate({ skills: [{ skillId: "react", level: "BASIC" }] }),
      false,
    );
    expect(has.skillDetails[0].meets).toBe(true);
    expect(factor(has, "skills").score01).toBe(1);

    const missing = computeFit(
      target({ requiredSkills: [req("react", null)] }),
      candidate({ skills: [] }),
      false,
    );
    expect(missing.skillDetails[0].meets).toBe(false);
    expect(factor(missing, "skills").score01).toBe(0);
  });

  it("sem skills exigidas: fator de skills é neutro (1) e não diferencia", () => {
    const r = computeFit(target({ requiredSkills: [] }), candidate(), false);
    expect(factor(r, "skills").score01).toBe(1);
    expect(r.skillsRequired).toBe(0);
    expect(r.skillDetails).toHaveLength(0);
  });
});

// ── Disponibilidade ──────────────────────────────────────────────────────────

describe("computeFit — disponibilidade", () => {
  it("FREE e BENCH favorecem (1.0)", () => {
    expect(
      factor(computeFit(target(), candidate({ availabilityState: "FREE" }), false), "availability")
        .score01,
    ).toBe(1);
    expect(
      factor(computeFit(target(), candidate({ availabilityState: "BENCH" }), false), "availability")
        .score01,
    ).toBe(1);
  });

  it("PARTIAL pontua intermediário, FULL penaliza forte", () => {
    expect(
      factor(computeFit(target(), candidate({ availabilityState: "PARTIAL" }), false), "availability")
        .score01,
    ).toBe(0.5);
    expect(
      factor(computeFit(target(), candidate({ availabilityState: "FULL" }), false), "availability")
        .score01,
    ).toBe(0.1);
  });

  it("VACATION e ON_LEAVE zeram a disponibilidade", () => {
    expect(
      factor(computeFit(target(), candidate({ availabilityState: "VACATION" }), false), "availability")
        .score01,
    ).toBe(0);
    expect(
      factor(computeFit(target(), candidate({ availabilityState: "ON_LEAVE" }), false), "availability")
        .score01,
    ).toBe(0);
  });

  it("sem período (null) → disponibilidade neutra 0.5", () => {
    expect(
      factor(computeFit(target(), candidate({ availabilityState: null }), false), "availability")
        .score01,
    ).toBe(0.5);
  });

  it("disponibilidade variando muda o score final", () => {
    const t = target({ requiredSkills: [req("react", "ADVANCED")] });
    const skills = [{ skillId: "react", level: "ADVANCED" as const }];
    const free = computeFit(t, candidate({ skills, availabilityState: "FREE" }), false);
    const full = computeFit(t, candidate({ skills, availabilityState: "FULL" }), false);
    expect(free.score).toBeGreaterThan(full.score);
  });
});

// ── Histórico com o cliente ──────────────────────────────────────────────────

describe("computeFit — histórico com o cliente", () => {
  it("sem histórico → 0", () => {
    expect(
      factor(computeFit(target(), candidate({ pastAllocationsWithClient: 0 }), false), "history")
        .score01,
    ).toBe(0);
  });

  it("satura em HISTORY_SATURATION alocações", () => {
    expect(
      factor(
        computeFit(target(), candidate({ pastAllocationsWithClient: HISTORY_SATURATION }), false),
        "history",
      ).score01,
    ).toBe(1);
    expect(
      factor(
        computeFit(target(), candidate({ pastAllocationsWithClient: HISTORY_SATURATION + 5 }), false),
        "history",
      ).score01,
    ).toBe(1);
  });

  it("histórico parcial é proporcional", () => {
    const r = computeFit(target(), candidate({ pastAllocationsWithClient: 1 }), false);
    expect(factor(r, "history").score01).toBeCloseTo(1 / HISTORY_SATURATION, 5);
  });
});

// ── Fator financeiro / includeFinancial ──────────────────────────────────────

describe("computeFit — fator financeiro gateado por includeFinancial", () => {
  it("includeFinancial=false: fator financeiro NÃO entra na composição", () => {
    const r = computeFit(
      target({ saleRate: 200 }),
      candidate({ hourlyCost: 100 }),
      false,
    );
    expect(r.factors.some((f) => f.key === "financial")).toBe(false);
    expect(r.financialIncluded).toBe(false);
  });

  it("includeFinancial=false: pesos dos 3 fatores renormalizam para somar 1", () => {
    const r = computeFit(target(), candidate(), false);
    const sum = r.factors.reduce((acc, f) => acc + f.weight, 0);
    expect(sum).toBeCloseTo(1, 5);
    // skills mantém proporção: 0.5 / (0.5+0.25+0.1)
    const expectedSkills = FIT_WEIGHTS.skills / (FIT_WEIGHTS.skills + FIT_WEIGHTS.availability + FIT_WEIGHTS.history);
    expect(factor(r, "skills").weight).toBeCloseTo(expectedSkills, 5);
  });

  it("includeFinancial=true: fator financeiro entra e pesos somam 1 com os 4", () => {
    const r = computeFit(
      target({ saleRate: 200 }),
      candidate({ hourlyCost: 100 }),
      true,
    );
    expect(r.financialIncluded).toBe(true);
    const fin = factor(r, "financial");
    // margem (200-100)/200 = 0.5
    expect(fin.score01).toBeCloseTo(0.5, 5);
    const sum = r.factors.reduce((acc, f) => acc + f.weight, 0);
    expect(sum).toBeCloseTo(1, 5);
  });

  it("custo >= venda → margem 0", () => {
    const r = computeFit(
      target({ saleRate: 100 }),
      candidate({ hourlyCost: 120 }),
      true,
    );
    expect(factor(r, "financial").score01).toBe(0);
  });

  it("dados financeiros ausentes → neutro 0.5 (não favorece nem pune)", () => {
    const noCost = computeFit(target({ saleRate: 200 }), candidate({ hourlyCost: null }), true);
    expect(factor(noCost, "financial").score01).toBe(0.5);
    const noSale = computeFit(target({ saleRate: null }), candidate({ hourlyCost: 100 }), true);
    expect(factor(noSale, "financial").score01).toBe(0.5);
  });

  it("includeFinancial não altera o fator de skills (não mascara saída)", () => {
    const t = target({ requiredSkills: [req("react", "ADVANCED")], saleRate: 200 });
    const c = candidate({ skills: [{ skillId: "react", level: "ADVANCED" }], hourlyCost: 100 });
    const without = computeFit(t, c, false);
    const withFin = computeFit(t, c, true);
    expect(factor(without, "skills").score01).toBe(factor(withFin, "skills").score01);
    // o peso muda (renormalização), mas a aderência crua não.
  });
});

// ── Score 0..100 e composição ────────────────────────────────────────────────

describe("computeFit — score final", () => {
  it("candidato perfeito (sem financeiro) → score 100", () => {
    const r = computeFit(
      target({ requiredSkills: [req("react", "ADVANCED")] }),
      candidate({
        skills: [{ skillId: "react", level: "ADVANCED" }],
        availabilityState: "FREE",
        pastAllocationsWithClient: HISTORY_SATURATION,
      }),
      false,
    );
    expect(r.score).toBe(100);
  });

  it("candidato sem nada útil → score baixo", () => {
    const r = computeFit(
      target({ requiredSkills: [req("react", "ADVANCED")] }),
      candidate({ availabilityState: "FULL", pastAllocationsWithClient: 0 }),
      false,
    );
    // skills 0, availability 0.1, history 0 → bem baixo
    expect(r.score).toBeLessThan(10);
  });

  it("score está sempre entre 0 e 100", () => {
    const r = computeFit(
      target({ requiredSkills: [req("react", "SPECIALIST")], saleRate: 50 }),
      candidate({
        skills: [{ skillId: "react", level: "BASIC" }],
        availabilityState: "VACATION",
        hourlyCost: 999,
      }),
      true,
    );
    expect(r.score).toBeGreaterThanOrEqual(0);
    expect(r.score).toBeLessThanOrEqual(100);
  });

  it("contribuição = score01 × weight × 100 e soma ≈ score", () => {
    const r = computeFit(
      target({ requiredSkills: [req("react", "ADVANCED")] }),
      candidate({
        skills: [{ skillId: "react", level: "INTERMEDIATE" }],
        availabilityState: "PARTIAL",
        pastAllocationsWithClient: 1,
      }),
      false,
    );
    for (const f of r.factors) {
      expect(f.contribution).toBeCloseTo(f.score01 * f.weight * 100, 5);
    }
    const total = r.factors.reduce((acc, f) => acc + f.contribution, 0);
    expect(r.score).toBe(Math.round(total));
  });
});

// ── Ranking ──────────────────────────────────────────────────────────────────

describe("rankCandidates", () => {
  it("ordena por score desc", () => {
    const t = target({ requiredSkills: [req("react", "ADVANCED")] });
    const results = rankCandidates(
      t,
      [
        candidate({ consultantId: "weak", consultantName: "Weak", availabilityState: "FULL" }),
        candidate({
          consultantId: "strong",
          consultantName: "Strong",
          skills: [{ skillId: "react", level: "ADVANCED" }],
          availabilityState: "FREE",
          pastAllocationsWithClient: 3,
        }),
      ],
      false,
    );
    expect(results[0].consultantId).toBe("strong");
    expect(results[1].consultantId).toBe("weak");
    expect(results[0].score).toBeGreaterThan(results[1].score);
  });

  it("descarta consultores INACTIVE", () => {
    const results = rankCandidates(
      target(),
      [
        candidate({ consultantId: "active", consultantName: "A", status: "ACTIVE" }),
        candidate({ consultantId: "inactive", consultantName: "B", status: "INACTIVE" }),
      ],
      false,
    );
    expect(results.map((r) => r.consultantId)).toEqual(["active"]);
  });

  it("desempate estável: mesmo score → mais skills atendidas, depois nome", () => {
    const t = target({ requiredSkills: [req("react", "ADVANCED")] });
    // Dois candidatos com mesma config exceto nome.
    const results = rankCandidates(
      t,
      [
        candidate({
          consultantId: "z",
          consultantName: "Zeca",
          skills: [{ skillId: "react", level: "ADVANCED" }],
          availabilityState: "FREE",
        }),
        candidate({
          consultantId: "a",
          consultantName: "Ana",
          skills: [{ skillId: "react", level: "ADVANCED" }],
          availabilityState: "FREE",
        }),
      ],
      false,
    );
    expect(results[0].consultantName).toBe("Ana");
    expect(results[1].consultantName).toBe("Zeca");
  });

  it("lista vazia retorna vazio", () => {
    expect(rankCandidates(target(), [], false)).toEqual([]);
  });

  it("ON_LEAVE não é descartado (aparece, mas com disponibilidade penalizada)", () => {
    const results = rankCandidates(
      target(),
      [candidate({ consultantId: "onleave", status: "ON_LEAVE", availabilityState: "ON_LEAVE" })],
      false,
    );
    expect(results).toHaveLength(1);
    expect(factor(results[0], "availability").score01).toBe(0);
  });
});
