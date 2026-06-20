import { describe, expect, it } from "vitest";
import {
  includeFinancialSignal,
  PROJECT_RISK_READ_ROLES,
  resolveProjectRiskScope,
} from "./visibility";

describe("includeFinancialSignal (gate do sinal de margem)", () => {
  it("inclui para FINANCIAL_ROLES (ADMIN/AREA_MANAGER/FINANCE)", () => {
    expect(includeFinancialSignal(["ADMIN"])).toBe(true);
    expect(includeFinancialSignal(["AREA_MANAGER"])).toBe(true);
    expect(includeFinancialSignal(["FINANCE"])).toBe(true);
  });

  it("NÃO inclui para PROJECT_MANAGER sem papel financeiro", () => {
    expect(includeFinancialSignal(["PROJECT_MANAGER"])).toBe(false);
  });

  it("inclui quando acumula papel financeiro", () => {
    expect(includeFinancialSignal(["PROJECT_MANAGER", "FINANCE"])).toBe(true);
  });

  it("sem papéis → não inclui", () => {
    expect(includeFinancialSignal([])).toBe(false);
  });
});

describe("PROJECT_RISK_READ_ROLES", () => {
  it("são gestores de projeto + FINANCE, sem CONSULTANT/SALES/PEOPLE", () => {
    expect(PROJECT_RISK_READ_ROLES).toEqual([
      "ADMIN",
      "AREA_MANAGER",
      "PROJECT_MANAGER",
      "FINANCE",
    ]);
    expect(PROJECT_RISK_READ_ROLES).not.toContain("CONSULTANT");
    expect(PROJECT_RISK_READ_ROLES).not.toContain("SALES");
    expect(PROJECT_RISK_READ_ROLES).not.toContain("PEOPLE");
  });
});

describe("resolveProjectRiskScope (escopo por linha)", () => {
  it("ADMIN/AREA_MANAGER/FINANCE → escopo amplo", () => {
    expect(resolveProjectRiskScope({ roles: ["ADMIN"], userId: "u1" })).toEqual({
      kind: "broad",
    });
    expect(
      resolveProjectRiskScope({ roles: ["AREA_MANAGER"], userId: "u1" }),
    ).toEqual({ kind: "broad" });
    expect(
      resolveProjectRiskScope({ roles: ["FINANCE"], userId: null }),
    ).toEqual({ kind: "broad" });
  });

  it("PROJECT_MANAGER → escopo dos projetos que gerencia", () => {
    expect(
      resolveProjectRiskScope({ roles: ["PROJECT_MANAGER"], userId: "u-pm" }),
    ).toEqual({ kind: "manager", managerUserId: "u-pm" });
  });

  it("o papel mais amplo vence quando acumula papéis", () => {
    expect(
      resolveProjectRiskScope({
        roles: ["PROJECT_MANAGER", "ADMIN"],
        userId: "u1",
      }),
    ).toEqual({ kind: "broad" });
  });

  it("PROJECT_MANAGER sem userId resolvido → sem universo", () => {
    expect(
      resolveProjectRiskScope({ roles: ["PROJECT_MANAGER"], userId: null }),
    ).toEqual({ kind: "none" });
  });

  it("papel sem acesso (CONSULTANT) → sem universo", () => {
    expect(
      resolveProjectRiskScope({ roles: ["CONSULTANT"], userId: "u1" }),
    ).toEqual({ kind: "none" });
  });
});
