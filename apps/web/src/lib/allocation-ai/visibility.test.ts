import { describe, expect, it } from "vitest";
import { includeFinancialFactor, ALLOCATION_AI_READ_ROLES } from "./visibility";

describe("includeFinancialFactor (gate do fator financeiro)", () => {
  it("inclui só para o grupo Dados Sensíveis (custo/hora do consultor)", () => {
    expect(includeFinancialFactor(["SENSITIVE_DATA"])).toBe(true);
  });

  it("NÃO inclui para FINANCIAL_ROLES fora do grupo (nem ADMIN)", () => {
    expect(includeFinancialFactor(["ADMIN"])).toBe(false);
    expect(includeFinancialFactor(["AREA_MANAGER"])).toBe(false);
    expect(includeFinancialFactor(["FINANCE"])).toBe(false);
  });

  it("NÃO inclui para papéis que alocam mas não são financeiros", () => {
    expect(includeFinancialFactor(["PROJECT_MANAGER"])).toBe(false);
    expect(includeFinancialFactor(["SALES"])).toBe(false);
  });

  it("inclui quando o usuário acumula o grupo Dados Sensíveis entre outros", () => {
    expect(includeFinancialFactor(["SALES", "SENSITIVE_DATA"])).toBe(true);
    expect(includeFinancialFactor(["SALES", "FINANCE"])).toBe(false);
  });

  it("sem papéis → não inclui", () => {
    expect(includeFinancialFactor([])).toBe(false);
  });
});

describe("ALLOCATION_AI_READ_ROLES", () => {
  it("são os papéis que alocam, e não inclui CONSULTANT nem PEOPLE", () => {
    expect(ALLOCATION_AI_READ_ROLES).toEqual([
      "ADMIN",
      "AREA_MANAGER",
      "PROJECT_MANAGER",
      "SALES",
    ]);
    expect(ALLOCATION_AI_READ_ROLES).not.toContain("CONSULTANT");
    expect(ALLOCATION_AI_READ_ROLES).not.toContain("PEOPLE");
  });
});
