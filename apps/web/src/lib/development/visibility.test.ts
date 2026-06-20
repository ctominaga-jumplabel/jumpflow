import { describe, expect, it } from "vitest";
import type { RoleName } from "@/lib/auth/roles";
import {
  DEVELOPMENT_MANAGE_ROLES,
  DEVELOPMENT_READ_ROLES,
  canConsultantUpdateAction,
  canManagePlan,
  canUpdateActionProgress,
  canViewPlan,
  isBroadManager,
  isValidActionTransition,
  isValidPlanTransition,
  resolveDevelopmentScope,
  type DevelopmentScope,
  type DevelopmentViewer,
} from "./visibility";

const viewer = (over: Partial<DevelopmentViewer>): DevelopmentViewer => ({
  roles: [],
  userId: null,
  consultantId: null,
  ...over,
});

describe("resolveDevelopmentScope — escopo por papel (§2)", () => {
  it("ADMIN/PEOPLE veem/gerenciam tudo", () => {
    expect(resolveDevelopmentScope(viewer({ roles: ["ADMIN"], userId: "u1" }))).toEqual({
      kind: "all",
    });
    expect(resolveDevelopmentScope(viewer({ roles: ["PEOPLE"], userId: "u1" }))).toEqual({
      kind: "all",
    });
  });

  it("AREA_MANAGER/PROJECT_MANAGER → escopo de gestor por managerUserId", () => {
    expect(
      resolveDevelopmentScope(viewer({ roles: ["AREA_MANAGER"], userId: "am1" })),
    ).toEqual({ kind: "manager", managerUserId: "am1" });
    expect(
      resolveDevelopmentScope(viewer({ roles: ["PROJECT_MANAGER"], userId: "pm1" })),
    ).toEqual({ kind: "manager", managerUserId: "pm1" });
  });

  it("CONSULTANT só vê o próprio PDI", () => {
    expect(
      resolveDevelopmentScope(
        viewer({ roles: ["CONSULTANT"], userId: "u1", consultantId: "c1" }),
      ),
    ).toEqual({ kind: "subject", subjectConsultantId: "c1" });
  });

  it("papel mais forte vence: ADMIN+CONSULTANT vê tudo", () => {
    expect(
      resolveDevelopmentScope(
        viewer({ roles: ["CONSULTANT", "ADMIN"], userId: "u1", consultantId: "c1" }),
      ),
    ).toEqual({ kind: "all" });
  });

  it("gestor sem userId resolvido cai para none (nunca vira escopo amplo)", () => {
    expect(resolveDevelopmentScope(viewer({ roles: ["AREA_MANAGER"] }))).toEqual({
      kind: "none",
    });
  });

  it("consultor sem consultantId resolvido → none (nunca vaza)", () => {
    expect(
      resolveDevelopmentScope(viewer({ roles: ["CONSULTANT"], userId: "u1" })),
    ).toEqual({ kind: "none" });
  });

  it("FINANCE/SALES não participam → none", () => {
    expect(resolveDevelopmentScope(viewer({ roles: ["FINANCE"], userId: "u1" }))).toEqual({
      kind: "none",
    });
    expect(resolveDevelopmentScope(viewer({ roles: ["SALES"], userId: "u1" }))).toEqual({
      kind: "none",
    });
  });
});

describe("canManagePlan — gestão de estrutura por linha (US17.02)", () => {
  const plan = { subjectConsultantId: "c1", managerUserId: "am1" };

  it("escopo amplo (ADMIN/PEOPLE) gerencia qualquer plano", () => {
    expect(canManagePlan({ kind: "all" }, plan)).toBe(true);
  });

  it("gestor gerencia apenas os planos do seu time", () => {
    expect(canManagePlan({ kind: "manager", managerUserId: "am1" }, plan)).toBe(true);
    expect(canManagePlan({ kind: "manager", managerUserId: "other" }, plan)).toBe(false);
  });

  it("plano sem gestor designado não é gerenciável por gestor de time", () => {
    expect(
      canManagePlan(
        { kind: "manager", managerUserId: "am1" },
        { subjectConsultantId: "c1", managerUserId: null },
      ),
    ).toBe(false);
  });

  it("CONSULTANT NUNCA gerencia a estrutura, mesmo do próprio PDI", () => {
    expect(canManagePlan({ kind: "subject", subjectConsultantId: "c1" }, plan)).toBe(
      false,
    );
  });

  it("none nunca gerencia", () => {
    expect(canManagePlan({ kind: "none" }, plan)).toBe(false);
  });
});

describe("canViewPlan — leitura por linha (§2)", () => {
  const plan = { subjectConsultantId: "c1", managerUserId: "am1" };

  it("o consultor dono vê o próprio PDI", () => {
    expect(canViewPlan({ kind: "subject", subjectConsultantId: "c1" }, plan)).toBe(true);
  });

  it("consultor não vê PDI de outro", () => {
    expect(canViewPlan({ kind: "subject", subjectConsultantId: "c2" }, plan)).toBe(false);
  });

  it("gestor de outro time não vê", () => {
    expect(canViewPlan({ kind: "manager", managerUserId: "other" }, plan)).toBe(false);
  });
});

describe("canConsultantUpdateAction — auto-atualização (LGPD §3, US17.02)", () => {
  it("o consultor dono atualiza ação do próprio PDI", () => {
    expect(canConsultantUpdateAction({ consultantId: "c1" }, "c1")).toBe(true);
  });

  it("consultor não atualiza ação de PDI de outro", () => {
    expect(canConsultantUpdateAction({ consultantId: "c1" }, "c2")).toBe(false);
  });

  it("viewer sem consultantId não atualiza nada", () => {
    expect(canConsultantUpdateAction({ consultantId: null }, "c1")).toBe(false);
  });
});

describe("canUpdateActionProgress — gestão OU consultor dono (US17.02/03)", () => {
  const plan = { subjectConsultantId: "c1", managerUserId: "am1" };

  it("gestor com escopo atualiza progresso", () => {
    expect(
      canUpdateActionProgress(
        { kind: "manager", managerUserId: "am1" },
        { consultantId: null },
        plan,
      ),
    ).toBe(true);
  });

  it("consultor dono atualiza progresso da própria ação mesmo sem gerenciar estrutura", () => {
    const scope: DevelopmentScope = { kind: "subject", subjectConsultantId: "c1" };
    expect(
      canUpdateActionProgress(scope, { consultantId: "c1" }, plan),
    ).toBe(true);
    // mas NÃO gerencia a estrutura
    expect(canManagePlan(scope, plan)).toBe(false);
  });

  it("consultor de outro PDI não atualiza", () => {
    const scope: DevelopmentScope = { kind: "subject", subjectConsultantId: "c2" };
    expect(
      canUpdateActionProgress(scope, { consultantId: "c2" }, plan),
    ).toBe(false);
  });
});

describe("isValidActionTransition (US17.02)", () => {
  it("avança PLANNED→IN_PROGRESS→DONE", () => {
    expect(isValidActionTransition("PLANNED", "IN_PROGRESS")).toBe(true);
    expect(isValidActionTransition("IN_PROGRESS", "DONE")).toBe(true);
  });

  it("permite concluir direto de PLANNED", () => {
    expect(isValidActionTransition("PLANNED", "DONE")).toBe(true);
  });

  it("cancela de PLANNED ou IN_PROGRESS", () => {
    expect(isValidActionTransition("PLANNED", "CANCELLED")).toBe(true);
    expect(isValidActionTransition("IN_PROGRESS", "CANCELLED")).toBe(true);
  });

  it("estados terminais não retrocedem", () => {
    expect(isValidActionTransition("DONE", "IN_PROGRESS")).toBe(false);
    expect(isValidActionTransition("DONE", "PLANNED")).toBe(false);
    expect(isValidActionTransition("CANCELLED", "PLANNED")).toBe(false);
  });

  it("nega retroceder e auto-transição", () => {
    expect(isValidActionTransition("IN_PROGRESS", "PLANNED")).toBe(false);
    expect(isValidActionTransition("PLANNED", "PLANNED")).toBe(false);
  });
});

describe("isValidPlanTransition (US17.01)", () => {
  it("ACTIVE → COMPLETED | CANCELLED", () => {
    expect(isValidPlanTransition("ACTIVE", "COMPLETED")).toBe(true);
    expect(isValidPlanTransition("ACTIVE", "CANCELLED")).toBe(true);
  });

  it("terminais não retrocedem e sem auto-transição", () => {
    expect(isValidPlanTransition("COMPLETED", "ACTIVE")).toBe(false);
    expect(isValidPlanTransition("CANCELLED", "ACTIVE")).toBe(false);
    expect(isValidPlanTransition("ACTIVE", "ACTIVE")).toBe(false);
  });
});

describe("constantes de papel", () => {
  it("READ inclui CONSULTANT; MANAGE não", () => {
    expect(DEVELOPMENT_READ_ROLES).toContain("CONSULTANT");
    expect(DEVELOPMENT_MANAGE_ROLES).not.toContain("CONSULTANT");
  });

  it("MANAGE inclui gestores de time + RH/admin (não FINANCE/SALES)", () => {
    expect([...DEVELOPMENT_MANAGE_ROLES].sort()).toEqual(
      ["ADMIN", "AREA_MANAGER", "PEOPLE", "PROJECT_MANAGER"].sort(),
    );
  });

  it("isBroadManager só para ADMIN/PEOPLE", () => {
    expect(isBroadManager(["ADMIN"])).toBe(true);
    expect(isBroadManager(["PEOPLE"])).toBe(true);
    expect(isBroadManager(["AREA_MANAGER"])).toBe(false);
  });

  it("nenhum papel de gestão fora do catálogo", () => {
    const known: RoleName[] = [
      "ADMIN",
      "CONSULTANT",
      "PROJECT_MANAGER",
      "AREA_MANAGER",
      "FINANCE",
      "PEOPLE",
      "SALES",
    ];
    for (const role of DEVELOPMENT_MANAGE_ROLES) {
      expect(known).toContain(role);
    }
  });
});
