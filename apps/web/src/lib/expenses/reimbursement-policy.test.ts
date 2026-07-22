import { describe, expect, it } from "vitest";
import {
  applicableRules,
  evaluateExpensePolicy,
  type PolicyRuleData,
} from "./reimbursement-policy";

const general = (over: Partial<PolicyRuleData> = {}): PolicyRuleData => ({
  category: null,
  maxAgeDays: null,
  maxAmount: null,
  active: true,
  ...over,
});

const meals = (over: Partial<PolicyRuleData> = {}): PolicyRuleData => ({
  category: "MEALS",
  maxAgeDays: null,
  maxAmount: null,
  active: true,
  ...over,
});

const TODAY = "2026-07-01";

describe("applicableRules", () => {
  it("inclui a regra Geral e a da categoria, ignora outras categorias e inativas", () => {
    const rules = [
      general(),
      meals({ maxAmount: 50 }),
      { category: "LODGING", maxAgeDays: null, maxAmount: 100, active: true } as PolicyRuleData,
      general({ active: false }),
    ];
    const result = applicableRules(rules, "MEALS");
    expect(result).toHaveLength(2);
    expect(result.map((r) => r.category)).toEqual([null, "MEALS"]);
  });

  it("sem categoria no lancamento, so a regra Geral se aplica", () => {
    const rules = [general({ maxAmount: 50 }), meals({ maxAmount: 30 })];
    expect(applicableRules(rules, null)).toHaveLength(1);
    expect(applicableRules(rules, undefined)).toHaveLength(1);
  });
});

describe("evaluateExpensePolicy", () => {
  it("sem regras aplicaveis: sem violacoes", () => {
    expect(
      evaluateExpensePolicy(
        { category: "MEALS", date: "2026-06-30", amount: 999 },
        [],
        TODAY,
      ),
    ).toEqual([]);
  });

  it("VALOR: acima do teto da categoria", () => {
    const violations = evaluateExpensePolicy(
      { category: "MEALS", date: TODAY, amount: 80 },
      [meals({ maxAmount: 50 })],
      TODAY,
    );
    expect(violations).toHaveLength(1);
    expect(violations[0].kind).toBe("VALOR");
    expect(violations[0].message).toContain("Alimentação");
  });

  it("VALOR: exatamente no teto nao viola", () => {
    const violations = evaluateExpensePolicy(
      { category: "MEALS", date: TODAY, amount: 50 },
      [meals({ maxAmount: 50 })],
      TODAY,
    );
    expect(violations).toEqual([]);
  });

  it("PRAZO: despesa mais antiga que o limite viola", () => {
    const violations = evaluateExpensePolicy(
      { category: "MEALS", date: "2026-06-20", amount: 10 },
      [meals({ maxAgeDays: 5 })],
      TODAY,
    );
    expect(violations).toHaveLength(1);
    expect(violations[0].kind).toBe("PRAZO");
    expect(violations[0].message).toContain("5 dias");
  });

  it("PRAZO: dentro do limite nao viola", () => {
    const violations = evaluateExpensePolicy(
      { category: "MEALS", date: "2026-06-28", amount: 10 },
      [meals({ maxAgeDays: 5 })],
      TODAY,
    );
    expect(violations).toEqual([]);
  });

  it("acumula PRAZO (Geral) e VALOR (categoria) sem duplicar", () => {
    const violations = evaluateExpensePolicy(
      { category: "MEALS", date: "2026-01-01", amount: 500 },
      [general({ maxAgeDays: 30 }), meals({ maxAmount: 50 })],
      TODAY,
    );
    const kinds = violations.map((v) => v.kind).sort();
    expect(kinds).toEqual(["PRAZO", "VALOR"]);
  });

  it("PRAZO: exatamente no limite (ageDays === maxAgeDays) nao viola", () => {
    // 2026-06-26 -> 5 dias ate 2026-07-01, com maxAgeDays 5 deve passar.
    const violations = evaluateExpensePolicy(
      { category: "MEALS", date: "2026-06-26", amount: 10 },
      [meals({ maxAgeDays: 5 })],
      TODAY,
    );
    expect(violations).toEqual([]);
  });

  it("PRAZO: um dia alem do limite viola", () => {
    const violations = evaluateExpensePolicy(
      { category: "MEALS", date: "2026-06-25", amount: 10 },
      [meals({ maxAgeDays: 5 })],
      TODAY,
    );
    expect(violations).toHaveLength(1);
    expect(violations[0].kind).toBe("PRAZO");
  });

  it("PRAZO: data futura nao viola", () => {
    const violations = evaluateExpensePolicy(
      { category: "MEALS", date: "2026-07-10", amount: 10 },
      [meals({ maxAgeDays: 5 })],
      TODAY,
    );
    expect(violations).toEqual([]);
  });

  it("VALOR: teto fracionario respeita o centavo (50,01 > 50,00)", () => {
    expect(
      evaluateExpensePolicy(
        { category: "MEALS", date: TODAY, amount: 50.01 },
        [meals({ maxAmount: 50 })],
        TODAY,
      ),
    ).toHaveLength(1);
    expect(
      evaluateExpensePolicy(
        { category: "MEALS", date: TODAY, amount: 50.0 },
        [meals({ maxAmount: 50.0 })],
        TODAY,
      ),
    ).toEqual([]);
  });

  it("data invalida nao dispara PRAZO (defensivo)", () => {
    const violations = evaluateExpensePolicy(
      { category: "MEALS", date: "data-ruim", amount: 10 },
      [meals({ maxAgeDays: 5 })],
      TODAY,
    );
    expect(violations).toEqual([]);
  });
});
