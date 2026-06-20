import { describe, expect, it } from "vitest";
import { includeFinancialFactor, ALLOCATION_AI_READ_ROLES } from "./visibility";

describe("includeFinancialFactor (gate do fator financeiro)", () => {
  it("inclui para FINANCIAL_ROLES (ADMIN/AREA_MANAGER/FINANCE)", () => {
    expect(includeFinancialFactor(["ADMIN"])).toBe(true);
    expect(includeFinancialFactor(["AREA_MANAGER"])).toBe(true);
    expect(includeFinancialFactor(["FINANCE"])).toBe(true);
  });

  it("NÃO inclui para papéis que alocam mas não são financeiros", () => {
    expect(includeFinancialFactor(["PROJECT_MANAGER"])).toBe(false);
    expect(includeFinancialFactor(["SALES"])).toBe(false);
  });

  it("inclui quando o usuário acumula um papel financeiro entre outros", () => {
    expect(includeFinancialFactor(["SALES", "FINANCE"])).toBe(true);
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
