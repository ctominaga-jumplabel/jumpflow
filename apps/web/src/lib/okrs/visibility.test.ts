import { describe, expect, it } from "vitest";
import type { RoleName } from "@/lib/auth/roles";
import {
  OKR_MANAGE_ROLES,
  OKR_READ_ROLES,
  canConsultantUpdateOwnKr,
  canManageObjective,
  canUpdateKeyResultValue,
  canViewObjective,
  isBroadManager,
  isPeople,
  isValidObjectiveTransition,
  type ObjectiveRef,
  type OkrViewer,
} from "./visibility";

const viewer = (over: Partial<OkrViewer>): OkrViewer => ({
  roles: [],
  userId: null,
  consultantId: null,
  ...over,
});

const ref = (over: Partial<ObjectiveRef>): ObjectiveRef => ({
  scope: "COMPANY",
  consultantId: null,
  projectId: null,
  managerUserId: null,
  ...over,
});

describe("canManageObjective — gestão por escopo/linha (RBAC)", () => {
  it("ADMIN/AREA_MANAGER gerenciam qualquer escopo", () => {
    for (const role of ["ADMIN", "AREA_MANAGER"] as RoleName[]) {
      expect(
        canManageObjective(viewer({ roles: [role], userId: "u1" }), ref({ scope: "COMPANY" })),
      ).toBe(true);
      expect(
        canManageObjective(viewer({ roles: [role], userId: "u1" }), ref({ scope: "PROJECT" })),
      ).toBe(true);
      expect(
        canManageObjective(
          viewer({ roles: [role], userId: "u1" }),
          ref({ scope: "CONSULTANT", consultantId: "c1" }),
        ),
      ).toBe(true);
    }
  });

  it("PEOPLE gerencia pessoas e organização, NÃO projeto", () => {
    const p = viewer({ roles: ["PEOPLE"], userId: "u1" });
    expect(canManageObjective(p, ref({ scope: "COMPANY" }))).toBe(true);
    expect(canManageObjective(p, ref({ scope: "AREA" }))).toBe(true);
    expect(canManageObjective(p, ref({ scope: "CONSULTANT", consultantId: "c1" }))).toBe(
      true,
    );
    expect(
      canManageObjective(p, ref({ scope: "PROJECT", projectId: "p1", managerUserId: "u1" })),
    ).toBe(false);
  });

  it("PROJECT_MANAGER gerencia OKR de projeto que GERE (managerUserId)", () => {
    const pm = viewer({ roles: ["PROJECT_MANAGER"], userId: "pm1" });
    expect(
      canManageObjective(pm, ref({ scope: "PROJECT", projectId: "p1", managerUserId: "pm1" })),
    ).toBe(true);
    expect(
      canManageObjective(pm, ref({ scope: "PROJECT", projectId: "p1", managerUserId: "other" })),
    ).toBe(false);
  });

  it("PROJECT_MANAGER gerencia OKR de consultor do SEU time (managerUserId do consultor)", () => {
    const pm = viewer({ roles: ["PROJECT_MANAGER"], userId: "pm1" });
    expect(
      canManageObjective(
        pm,
        ref({ scope: "CONSULTANT", consultantId: "c1", managerUserId: "pm1" }),
      ),
    ).toBe(true);
    expect(
      canManageObjective(
        pm,
        ref({ scope: "CONSULTANT", consultantId: "c1", managerUserId: "other" }),
      ),
    ).toBe(false);
  });

  it("PROJECT_MANAGER NÃO gerencia OKR de área/empresa", () => {
    const pm = viewer({ roles: ["PROJECT_MANAGER"], userId: "pm1" });
    expect(canManageObjective(pm, ref({ scope: "AREA" }))).toBe(false);
    expect(canManageObjective(pm, ref({ scope: "COMPANY" }))).toBe(false);
  });

  it("CONSULTANT nunca gerencia estrutura, nem do próprio OKR", () => {
    const c = viewer({ roles: ["CONSULTANT"], userId: "u1", consultantId: "c1" });
    expect(
      canManageObjective(c, ref({ scope: "CONSULTANT", consultantId: "c1" })),
    ).toBe(false);
  });

  it("gestor sem userId resolvido não gerencia (nunca vira amplo por engano)", () => {
    expect(
      canManageObjective(
        viewer({ roles: ["PROJECT_MANAGER"] }),
        ref({ scope: "PROJECT", managerUserId: "pm1" }),
      ),
    ).toBe(false);
  });

  it("FINANCE/SALES não gerenciam OKR", () => {
    for (const role of ["FINANCE", "SALES"] as RoleName[]) {
      expect(
        canManageObjective(viewer({ roles: [role], userId: "u1" }), ref({ scope: "COMPANY" })),
      ).toBe(false);
    }
  });
});

describe("canViewObjective — leitura por linha", () => {
  it("ADMIN/AREA_MANAGER/PEOPLE veem tudo (inclusive OKR de projeto p/ PEOPLE)", () => {
    for (const role of ["ADMIN", "AREA_MANAGER", "PEOPLE"] as RoleName[]) {
      expect(
        canViewObjective(viewer({ roles: [role], userId: "u1" }), ref({ scope: "PROJECT", managerUserId: "x" })),
      ).toBe(true);
    }
  });

  it("o consultor dono vê o PRÓPRIO OKR de consultor", () => {
    const c = viewer({ roles: ["CONSULTANT"], userId: "u1", consultantId: "c1" });
    expect(canViewObjective(c, ref({ scope: "CONSULTANT", consultantId: "c1" }))).toBe(
      true,
    );
  });

  it("consultor não vê OKR de outro consultor", () => {
    const c = viewer({ roles: ["CONSULTANT"], userId: "u1", consultantId: "c1" });
    expect(canViewObjective(c, ref({ scope: "CONSULTANT", consultantId: "c2" }))).toBe(
      false,
    );
  });

  it("consultor não vê OKR de empresa/área/projeto", () => {
    const c = viewer({ roles: ["CONSULTANT"], userId: "u1", consultantId: "c1" });
    expect(canViewObjective(c, ref({ scope: "COMPANY" }))).toBe(false);
    expect(canViewObjective(c, ref({ scope: "PROJECT", managerUserId: "x" }))).toBe(false);
  });

  it("PROJECT_MANAGER vê o que gere; não vê de outro time", () => {
    const pm = viewer({ roles: ["PROJECT_MANAGER"], userId: "pm1" });
    expect(
      canViewObjective(pm, ref({ scope: "PROJECT", projectId: "p1", managerUserId: "pm1" })),
    ).toBe(true);
    expect(
      canViewObjective(pm, ref({ scope: "PROJECT", projectId: "p1", managerUserId: "other" })),
    ).toBe(false);
  });

  it("sem identidade/papel → não vê nada", () => {
    expect(canViewObjective(viewer({}), ref({ scope: "COMPANY" }))).toBe(false);
  });
});

describe("canConsultantUpdateOwnKr / canUpdateKeyResultValue", () => {
  it("consultor dono atualiza o valor do próprio KR (sem gerenciar estrutura)", () => {
    const c = viewer({ roles: ["CONSULTANT"], userId: "u1", consultantId: "c1" });
    const own = ref({ scope: "CONSULTANT", consultantId: "c1" });
    expect(canConsultantUpdateOwnKr(c, own)).toBe(true);
    expect(canUpdateKeyResultValue(c, own)).toBe(true);
    expect(canManageObjective(c, own)).toBe(false);
  });

  it("consultor não atualiza KR de OKR de outro consultor", () => {
    const c = viewer({ roles: ["CONSULTANT"], consultantId: "c1" });
    expect(
      canUpdateKeyResultValue(c, ref({ scope: "CONSULTANT", consultantId: "c2" })),
    ).toBe(false);
  });

  it("consultor não atualiza KR de OKR de projeto/empresa", () => {
    const c = viewer({ roles: ["CONSULTANT"], consultantId: "c1" });
    expect(canUpdateKeyResultValue(c, ref({ scope: "PROJECT", managerUserId: "x" }))).toBe(
      false,
    );
    expect(canUpdateKeyResultValue(c, ref({ scope: "COMPANY" }))).toBe(false);
  });

  it("gestor com escopo atualiza valor (via gestão)", () => {
    const pm = viewer({ roles: ["PROJECT_MANAGER"], userId: "pm1" });
    expect(
      canUpdateKeyResultValue(
        pm,
        ref({ scope: "PROJECT", projectId: "p1", managerUserId: "pm1" }),
      ),
    ).toBe(true);
  });

  it("viewer sem consultantId não pode auto-atualizar", () => {
    expect(
      canConsultantUpdateOwnKr(
        { consultantId: null },
        ref({ scope: "CONSULTANT", consultantId: "c1" }),
      ),
    ).toBe(false);
  });
});

describe("isValidObjectiveTransition (DRAFT→ACTIVE→COMPLETED/CANCELLED)", () => {
  it("DRAFT → ACTIVE", () => {
    expect(isValidObjectiveTransition("DRAFT", "ACTIVE")).toBe(true);
  });

  it("ACTIVE → COMPLETED | CANCELLED", () => {
    expect(isValidObjectiveTransition("ACTIVE", "COMPLETED")).toBe(true);
    expect(isValidObjectiveTransition("ACTIVE", "CANCELLED")).toBe(true);
  });

  it("DRAFT → CANCELLED (cancela rascunho)", () => {
    expect(isValidObjectiveTransition("DRAFT", "CANCELLED")).toBe(true);
  });

  it("DRAFT não pula direto para COMPLETED", () => {
    expect(isValidObjectiveTransition("DRAFT", "COMPLETED")).toBe(false);
  });

  it("terminais não retrocedem e sem auto-transição", () => {
    expect(isValidObjectiveTransition("COMPLETED", "ACTIVE")).toBe(false);
    expect(isValidObjectiveTransition("CANCELLED", "ACTIVE")).toBe(false);
    expect(isValidObjectiveTransition("ACTIVE", "ACTIVE")).toBe(false);
    expect(isValidObjectiveTransition("ACTIVE", "DRAFT")).toBe(false);
  });
});

describe("constantes de papel", () => {
  it("READ inclui CONSULTANT; MANAGE não", () => {
    expect(OKR_READ_ROLES).toContain("CONSULTANT");
    expect(OKR_MANAGE_ROLES).not.toContain("CONSULTANT");
  });

  it("MANAGE = gestores + RH/admin (não FINANCE/SALES)", () => {
    expect([...OKR_MANAGE_ROLES].sort()).toEqual(
      ["ADMIN", "AREA_MANAGER", "PEOPLE", "PROJECT_MANAGER"].sort(),
    );
  });

  it("isBroadManager só ADMIN/AREA_MANAGER; isPeople só PEOPLE", () => {
    expect(isBroadManager(["ADMIN"])).toBe(true);
    expect(isBroadManager(["AREA_MANAGER"])).toBe(true);
    expect(isBroadManager(["PEOPLE"])).toBe(false);
    expect(isPeople(["PEOPLE"])).toBe(true);
    expect(isPeople(["ADMIN"])).toBe(false);
  });
});
