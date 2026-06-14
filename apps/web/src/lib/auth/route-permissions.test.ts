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
  it("requires finance roles for the financeiro module", () => {
    expect(accessForPath("/app/pagamentos")).toEqual([
      "ADMIN",
      "AREA_MANAGER",
      "FINANCE",
    ]);
    expect(accessForPath("/app/financeiro")).toEqual([
      "ADMIN",
      "AREA_MANAGER",
      "FINANCE",
    ]);
    expect(accessForPath("/app/financeiro/fechamento")).toEqual([
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
