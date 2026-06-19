import { describe, expect, it } from "vitest";
import type { RoleName } from "@/lib/auth/roles";
import {
  FEEDBACK_MANAGE_ROLES,
  FEEDBACK_READ_ROLES,
  FEEDBACK_WRITE_ROLES,
  canManageFeedback,
  canWriteFeedback,
  resolveFeedbackReadScope,
  type FeedbackViewer,
} from "./visibility";

const viewer = (over: Partial<FeedbackViewer>): FeedbackViewer => ({
  roles: [],
  userId: null,
  consultantId: null,
  ...over,
});

describe("canWriteFeedback (US15.01, matriz §2)", () => {
  it("permite gestores: ADMIN, PEOPLE, AREA_MANAGER, PROJECT_MANAGER", () => {
    for (const role of FEEDBACK_WRITE_ROLES) {
      expect(canWriteFeedback([role])).toBe(true);
    }
  });

  it("nega CONSULTANT, SALES e FINANCE (feedback avulso)", () => {
    expect(canWriteFeedback(["CONSULTANT"])).toBe(false);
    expect(canWriteFeedback(["SALES"])).toBe(false);
    expect(canWriteFeedback(["FINANCE"])).toBe(false);
  });

  it("nega quando o usuário não tem papel", () => {
    expect(canWriteFeedback([])).toBe(false);
  });

  it("permite quando o usuário acumula um papel de escrita entre vários", () => {
    expect(canWriteFeedback(["CONSULTANT", "PROJECT_MANAGER"])).toBe(true);
  });
});

describe("resolveFeedbackReadScope — escopo por papel (US15.02, LGPD §3)", () => {
  it("ADMIN vê tudo (kind=all)", () => {
    const scope = resolveFeedbackReadScope(viewer({ roles: ["ADMIN"], userId: "u1" }));
    expect(scope).toEqual({ kind: "all" });
  });

  it("PEOPLE vê tudo (kind=all)", () => {
    const scope = resolveFeedbackReadScope(viewer({ roles: ["PEOPLE"], userId: "u1" }));
    expect(scope).toEqual({ kind: "all" });
  });

  it("AREA_MANAGER recebe escopo de gestor por managerUserId + autoria", () => {
    const scope = resolveFeedbackReadScope(
      viewer({ roles: ["AREA_MANAGER"], userId: "mgr1" }),
    );
    expect(scope).toEqual({
      kind: "manager",
      managerUserId: "mgr1",
      authorUserId: "mgr1",
    });
  });

  it("PROJECT_MANAGER recebe escopo de gestor por managerUserId + autoria", () => {
    const scope = resolveFeedbackReadScope(
      viewer({ roles: ["PROJECT_MANAGER"], userId: "pm1" }),
    );
    expect(scope).toEqual({
      kind: "manager",
      managerUserId: "pm1",
      authorUserId: "pm1",
    });
  });

  it("CONSULTANT (sem papel de gestão) só vê o próprio sujeito + autoria", () => {
    const scope = resolveFeedbackReadScope(
      viewer({ roles: ["CONSULTANT"], userId: "u1", consultantId: "c1" }),
    );
    expect(scope).toEqual({
      kind: "subject",
      subjectConsultantId: "c1",
      authorUserId: "u1",
    });
  });

  it("o papel mais forte vence: ADMIN+CONSULTANT vê tudo", () => {
    const scope = resolveFeedbackReadScope(
      viewer({ roles: ["CONSULTANT", "ADMIN"], userId: "u1", consultantId: "c1" }),
    );
    expect(scope).toEqual({ kind: "all" });
  });

  it("gestor vence consultant: PROJECT_MANAGER+CONSULTANT recebe manager", () => {
    const scope = resolveFeedbackReadScope(
      viewer({
        roles: ["CONSULTANT", "PROJECT_MANAGER"],
        userId: "pm1",
        consultantId: "c9",
      }),
    );
    expect(scope).toEqual({
      kind: "manager",
      managerUserId: "pm1",
      authorUserId: "pm1",
    });
  });

  it("sem userId nem consultantId resolvido → none (nunca vaza)", () => {
    const scope = resolveFeedbackReadScope(viewer({ roles: ["CONSULTANT"] }));
    expect(scope).toEqual({ kind: "none" });
  });

  it("gestor sem userId resolvido cai para none (não vira escopo amplo)", () => {
    const scope = resolveFeedbackReadScope(viewer({ roles: ["AREA_MANAGER"] }));
    expect(scope).toEqual({ kind: "none" });
  });

  it("usuário sem papel de leitura mas com userId vê só o que autorou", () => {
    const scope = resolveFeedbackReadScope(viewer({ roles: ["SALES"], userId: "u7" }));
    expect(scope).toEqual({ kind: "author", authorUserId: "u7" });
  });
});

describe("canManageFeedback — edição/visibilidade por linha (US15.03)", () => {
  it("ADMIN gerencia qualquer feedback", () => {
    expect(
      canManageFeedback({ roles: ["ADMIN"], userId: "u1" }, "outro-autor"),
    ).toBe(true);
  });

  it("PEOPLE gerencia qualquer feedback", () => {
    expect(
      canManageFeedback({ roles: ["PEOPLE"], userId: "u1" }, "outro-autor"),
    ).toBe(true);
  });

  it("o autor gerencia o próprio feedback", () => {
    expect(
      canManageFeedback({ roles: ["PROJECT_MANAGER"], userId: "pm1" }, "pm1"),
    ).toBe(true);
  });

  it("um gestor NÃO autor não gerencia feedback de outro (só autor/PEOPLE/ADMIN)", () => {
    expect(
      canManageFeedback({ roles: ["PROJECT_MANAGER"], userId: "pm1" }, "pm2"),
    ).toBe(false);
    expect(
      canManageFeedback({ roles: ["AREA_MANAGER"], userId: "am1" }, "pm2"),
    ).toBe(false);
  });

  it("não gerencia quando o feedback não tem autor (autor removido)", () => {
    expect(
      canManageFeedback({ roles: ["PROJECT_MANAGER"], userId: "pm1" }, null),
    ).toBe(false);
  });

  it("não gerencia quando o viewer não tem userId resolvido", () => {
    expect(
      canManageFeedback({ roles: ["PROJECT_MANAGER"], userId: null }, "pm1"),
    ).toBe(false);
  });
});

describe("constantes de papel", () => {
  it("READ inclui CONSULTANT, WRITE não", () => {
    expect(FEEDBACK_READ_ROLES).toContain("CONSULTANT");
    expect(FEEDBACK_WRITE_ROLES).not.toContain("CONSULTANT");
  });

  it("MANAGE é apenas ADMIN/PEOPLE", () => {
    expect([...FEEDBACK_MANAGE_ROLES].sort()).toEqual(["ADMIN", "PEOPLE"]);
  });

  it("nenhum papel de escrita está fora do catálogo de papéis", () => {
    const known: RoleName[] = [
      "ADMIN",
      "CONSULTANT",
      "PROJECT_MANAGER",
      "AREA_MANAGER",
      "FINANCE",
      "PEOPLE",
      "SALES",
    ];
    for (const role of FEEDBACK_WRITE_ROLES) {
      expect(known).toContain(role);
    }
  });
});
