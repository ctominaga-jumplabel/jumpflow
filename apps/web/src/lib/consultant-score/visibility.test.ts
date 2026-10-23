import { describe, expect, it } from "vitest";
import type { RoleName } from "@/lib/auth/roles";
import {
  includeFinancialFactor,
  includeFinancialForViewer,
  resolveConsultantScoreScope,
  type ConsultantScoreViewer,
} from "./visibility";

/**
 * Cobertura da RBAC/LGPD do Score do Consultor (§8.4, design §5): escopo por
 * linha (all/manager/self/none), o gate financeiro por papel e a regra de que o
 * CONSULTANT nunca vê o componente financeiro do PRÓPRIO score.
 */

function viewer(
  roles: RoleName[],
  overrides: Partial<ConsultantScoreViewer> = {},
): ConsultantScoreViewer {
  return { roles, userId: "u1", consultantId: "cons-1", ...overrides };
}

describe("resolveConsultantScoreScope", () => {
  it("ADMIN/PEOPLE/FINANCE → escopo amplo (all)", () => {
    expect(resolveConsultantScoreScope(viewer(["ADMIN"])).kind).toBe("all");
    expect(resolveConsultantScoreScope(viewer(["PEOPLE"])).kind).toBe("all");
    expect(resolveConsultantScoreScope(viewer(["FINANCE"])).kind).toBe("all");
  });

  it("AREA_MANAGER → escopo do time (manager) com seu userId", () => {
    const scope = resolveConsultantScoreScope(viewer(["AREA_MANAGER"], { userId: "mgr-9" }));
    expect(scope).toEqual({ kind: "manager", managerUserId: "mgr-9" });
  });

  it("AREA_MANAGER sem userId → none (nunca vaza time)", () => {
    expect(
      resolveConsultantScoreScope(viewer(["AREA_MANAGER"], { userId: null })).kind,
    ).toBe("none");
  });

  it("CONSULTANT → próprio score (self) com seu consultantId", () => {
    const scope = resolveConsultantScoreScope(
      viewer(["CONSULTANT"], { consultantId: "cons-42" }),
    );
    expect(scope).toEqual({ kind: "self", consultantId: "cons-42" });
  });

  it("CONSULTANT sem consultantId → none", () => {
    expect(
      resolveConsultantScoreScope(viewer(["CONSULTANT"], { consultantId: null })).kind,
    ).toBe("none");
  });

  it("papel sem acesso (SALES) → none", () => {
    expect(resolveConsultantScoreScope(viewer(["SALES"])).kind).toBe("none");
  });

  it("o papel mais amplo vence (ADMIN + CONSULTANT → all)", () => {
    expect(
      resolveConsultantScoreScope(viewer(["CONSULTANT", "ADMIN"])).kind,
    ).toBe("all");
  });
});

describe("includeFinancialFactor (gate por papel)", () => {
  it("true só para o grupo Dados Sensíveis", () => {
    expect(includeFinancialFactor(["SENSITIVE_DATA"])).toBe(true);
    expect(includeFinancialFactor(["ADMIN"])).toBe(false);
    expect(includeFinancialFactor(["AREA_MANAGER"])).toBe(false);
    expect(includeFinancialFactor(["FINANCE"])).toBe(false);
  });

  it("false para PEOPLE / CONSULTANT", () => {
    expect(includeFinancialFactor(["PEOPLE"])).toBe(false);
    expect(includeFinancialFactor(["CONSULTANT"])).toBe(false);
  });
});

describe("includeFinancialForViewer (decisão final por escopo)", () => {
  it("CONSULTANT no próprio score (self) NUNCA recebe o fator financeiro", () => {
    const scope = { kind: "self" as const, consultantId: "cons-1" };
    // mesmo se, por acaso, detiver papel financeiro:
    expect(
      includeFinancialForViewer(scope, ["CONSULTANT", "SENSITIVE_DATA"]),
    ).toBe(false);
    expect(includeFinancialForViewer(scope, ["CONSULTANT"])).toBe(false);
  });

  it("gestão (all) recebe o fator só com o grupo Dados Sensíveis", () => {
    expect(
      includeFinancialForViewer({ kind: "all" }, ["FINANCE", "SENSITIVE_DATA"]),
    ).toBe(true);
    expect(includeFinancialForViewer({ kind: "all" }, ["ADMIN"])).toBe(false);
    expect(includeFinancialForViewer({ kind: "all" }, ["FINANCE"])).toBe(false);
  });

  it("gestão (all) sem papel financeiro NÃO recebe o fator (PEOPLE)", () => {
    expect(includeFinancialForViewer({ kind: "all" }, ["PEOPLE"])).toBe(false);
  });

  it("manager só recebe o fator se também for do grupo Dados Sensíveis", () => {
    expect(
      includeFinancialForViewer(
        { kind: "manager", managerUserId: "m1" },
        ["AREA_MANAGER"],
      ),
    ).toBe(false);
    expect(
      includeFinancialForViewer(
        { kind: "manager", managerUserId: "m1" },
        ["AREA_MANAGER", "SENSITIVE_DATA"],
      ),
    ).toBe(true);
  });
});
