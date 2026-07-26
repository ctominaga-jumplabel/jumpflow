import { describe, expect, it } from "vitest";
import {
  accessForPath,
  canAccess,
  canAccessPath,
  hasRole,
} from "@/lib/auth/route-permissions";
import type { AppUser } from "@/lib/auth/types";

const finance: AppUser = {
  id: "f",
  name: "Fin",
  email: "fin@x.com",
  roles: ["FINANCE"],
};
const consultant: AppUser = {
  id: "c",
  name: "Con",
  email: "con@x.com",
  roles: ["CONSULTANT"],
};
const noRoles: AppUser = {
  id: "n",
  name: "No",
  email: "no@x.com",
  roles: [],
};
const admin: AppUser = {
  id: "a",
  name: "Adm",
  email: "adm@x.com",
  roles: ["ADMIN"],
};
const areaManager: AppUser = {
  id: "am",
  name: "AM",
  email: "am@x.com",
  roles: ["AREA_MANAGER"],
};
const projectManager: AppUser = {
  id: "pm",
  name: "PM",
  email: "pm@x.com",
  roles: ["PROJECT_MANAGER"],
};

describe("hasRole", () => {
  it("returns false for an anonymous user", () => {
    expect(hasRole(null, "ADMIN")).toBe(false);
  });

  it("matches a single required role", () => {
    expect(hasRole(finance, "FINANCE")).toBe(true);
    expect(hasRole(finance, "ADMIN")).toBe(false);
  });

  it("matches when the user holds any of several roles", () => {
    expect(hasRole(finance, ["ADMIN", "FINANCE"])).toBe(true);
    expect(hasRole(consultant, ["ADMIN", "FINANCE"])).toBe(false);
  });

  it("treats an empty requirement as satisfied for a logged-in user", () => {
    expect(hasRole(consultant, [])).toBe(true);
  });
});

describe("accessForPath", () => {
  it("keeps Pagamentos on the full financial role set", () => {
    // Pagamentos (consultant payments) is a separate module — Melhorias v2 did
    // NOT tighten it; AREA_MANAGER still reaches it.
    expect(accessForPath("/app/pagamentos")).toEqual([
      "ADMIN",
      "AREA_MANAGER",
      "FINANCE",
    ]);
  });

  it("restricts Contas a Receber/Pagar to [ADMIN, FINANCE] (Melhorias v2)", () => {
    // v2 decision 4: AREA_MANAGER loses access to /app/financeiro (Contas a
    // Receber/Pagar). Now RECEIVABLES_ROLES = [ADMIN, FINANCE].
    expect(accessForPath("/app/financeiro")).toEqual(["ADMIN", "FINANCE"]);
    // Sub-routes without a dedicated rule fall through to /app/financeiro.
    expect(accessForPath("/app/financeiro/apuracao")).toEqual([
      "ADMIN",
      "FINANCE",
    ]);
    expect(accessForPath("/app/financeiro/fechamento")).toEqual([
      "ADMIN",
      "FINANCE",
    ]);
  });

  it("routes Pendentes de Fechamento to PENDING_CLOSING_ROLES, more specific first", () => {
    // v2: /app/financeiro/pendentes MUST resolve BEFORE the broader
    // /app/financeiro rule and include AREA_MANAGER.
    expect(accessForPath("/app/financeiro/pendentes")).toEqual([
      "ADMIN",
      "AREA_MANAGER",
      "FINANCE",
    ]);
    // A deeper path under pendentes still matches the specific rule.
    expect(accessForPath("/app/financeiro/pendentes/x")).toEqual([
      "ADMIN",
      "AREA_MANAGER",
      "FINANCE",
    ]);
  });

  it("requires approval roles for the aprovacoes module", () => {
    // FINANCE entered in Round 3: it decides the finance stage of expenses.
    expect(accessForPath("/app/aprovacoes")).toEqual([
      "ADMIN",
      "AREA_MANAGER",
      "PROJECT_MANAGER",
      "FINANCE",
    ]);
  });

  it("restricts the automacoes module to ADMIN and AREA_MANAGER", () => {
    expect(accessForPath("/app/automacoes")).toEqual(["ADMIN", "AREA_MANAGER"]);
    expect(accessForPath("/app/automacoes/aprovacao-automatica")).toEqual([
      "ADMIN",
      "AREA_MANAGER",
    ]);
  });

  it("restricts the admin module to ADMIN only", () => {
    expect(accessForPath("/app/admin")).toEqual(["ADMIN"]);
    expect(accessForPath("/app/admin/acessos")).toEqual(["ADMIN"]);
  });

  it("allows any authenticated user for general app routes", () => {
    expect(accessForPath("/app/dashboard")).toBe("ALL");
    expect(accessForPath("/app/horas")).toBe("ALL");
  });

  it("matches the most specific rule before the broad /app rule", () => {
    // Precedence matters: /app/financeiro must not resolve to the /app "ALL".
    expect(accessForPath("/app/financeiro")).not.toBe("ALL");
    expect(accessForPath("/app/pagamentos")).not.toBe("ALL");
    expect(accessForPath("/app/aprovacoes")).not.toBe("ALL");
    expect(accessForPath("/app/automacoes")).not.toBe("ALL");
    expect(accessForPath("/app/admin")).not.toBe("ALL");
  });

  it("defaults unknown paths to ALL", () => {
    expect(accessForPath("/app/desconhecido")).toBe("ALL");
  });
});

describe("canAccess / canAccessPath", () => {
  it("denies access to anonymous users even for ALL", () => {
    expect(canAccess(null, "ALL")).toBe(false);
    expect(canAccessPath(null, "/app/dashboard")).toBe(false);
  });

  it("allows any authenticated user on ALL routes", () => {
    expect(canAccessPath(noRoles, "/app/dashboard")).toBe(true);
  });

  it("enforces roles on the financeiro route", () => {
    expect(canAccessPath(finance, "/app/financeiro")).toBe(true);
    expect(canAccessPath(finance, "/app/pagamentos")).toBe(true);
    expect(canAccessPath(consultant, "/app/financeiro")).toBe(false);
    expect(canAccessPath(consultant, "/app/pagamentos")).toBe(false);
    expect(canAccessPath(noRoles, "/app/financeiro")).toBe(false);
  });

  describe("Melhorias v2 — Contas a Receber vs Pendentes de Fechamento", () => {
    it("DENIES AREA_MANAGER on Contas a Receber/Pagar and Apuração", () => {
      // v2 decision 4: AREA_MANAGER no longer accesses /app/financeiro.
      expect(canAccessPath(areaManager, "/app/financeiro")).toBe(false);
      expect(canAccessPath(areaManager, "/app/financeiro/apuracao")).toBe(false);
      expect(canAccessPath(areaManager, "/app/financeiro/fechamento")).toBe(
        false,
      );
    });

    it("ALLOWS AREA_MANAGER on Pendentes de Fechamento", () => {
      expect(canAccessPath(areaManager, "/app/financeiro/pendentes")).toBe(true);
    });

    it("gives ADMIN and FINANCE access to all three finance surfaces", () => {
      for (const user of [admin, finance]) {
        expect(canAccessPath(user, "/app/financeiro")).toBe(true);
        expect(canAccessPath(user, "/app/financeiro/apuracao")).toBe(true);
        expect(canAccessPath(user, "/app/financeiro/pendentes")).toBe(true);
      }
    });

    it("keeps Pendentes closed to profiles outside PENDING_CLOSING_ROLES", () => {
      expect(canAccessPath(consultant, "/app/financeiro/pendentes")).toBe(false);
      expect(canAccessPath(projectManager, "/app/financeiro/pendentes")).toBe(
        false,
      );
      expect(canAccessPath(noRoles, "/app/financeiro/pendentes")).toBe(false);
    });

    it("routes a combo AREA_MANAGER+FINANCE to both surfaces (union of roles)", () => {
      const both: AppUser = {
        id: "amf",
        name: "AMF",
        email: "amf@x.com",
        roles: ["AREA_MANAGER", "FINANCE"],
      };
      // FINANCE grants Contas a Receber; AREA_MANAGER (and FINANCE) grant Pendentes.
      expect(canAccessPath(both, "/app/financeiro")).toBe(true);
      expect(canAccessPath(both, "/app/financeiro/pendentes")).toBe(true);
    });
  });

  it("enforces roles on the aprovacoes route", () => {
    expect(canAccessPath(consultant, "/app/aprovacoes")).toBe(false);
    // FINANCE may access the queue (finance stage of expense approvals).
    expect(canAccessPath(finance, "/app/aprovacoes")).toBe(true);
  });

  it("enforces management roles on the automacoes route", () => {
    expect(canAccessPath(admin, "/app/automacoes/aprovacao-automatica")).toBe(
      true,
    );
    expect(
      canAccessPath(areaManager, "/app/automacoes/aprovacao-automatica"),
    ).toBe(true);
    // PROJECT_MANAGER read-only is deferred: no access this round.
    expect(
      canAccessPath(projectManager, "/app/automacoes/aprovacao-automatica"),
    ).toBe(false);
    expect(canAccessPath(finance, "/app/automacoes")).toBe(false);
    expect(canAccessPath(consultant, "/app/automacoes")).toBe(false);
  });

  it("restricts the admin access module to ADMIN", () => {
    expect(canAccessPath(admin, "/app/admin/acessos")).toBe(true);
    expect(canAccessPath(areaManager, "/app/admin/acessos")).toBe(false);
    expect(canAccessPath(finance, "/app/admin/acessos")).toBe(false);
    expect(canAccessPath(consultant, "/app/admin/acessos")).toBe(false);
  });
});
