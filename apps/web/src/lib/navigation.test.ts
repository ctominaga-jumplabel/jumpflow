import { describe, expect, it } from "vitest";
import {
  adminNavigation,
  canSeeNavItem,
  canSeeNavItemByMatrix,
  findActiveNav,
  navPermissionCodes,
  primaryNavigation,
} from "@/lib/navigation";
import { DISABLED_MODULE_CODES } from "@/lib/modules/disabled-modules";

describe("findActiveNav", () => {
  it("matches an exact route", () => {
    expect(findActiveNav("/app/dashboard")?.href).toBe("/app/dashboard");
  });

  it("matches a nested subroute", () => {
    expect(findActiveNav("/app/projetos/abc")?.href).toBe("/app/projetos");
  });

  it("matches the launcher only on the exact /app path", () => {
    expect(findActiveNav("/app")?.href).toBe("/app");
    // A nested route must resolve to its own item, not the exact launcher.
    expect(findActiveNav("/app/horas")?.href).toBe("/app/horas");
  });

  it("returns undefined for an unknown route", () => {
    expect(findActiveNav("/app/inexistente")).toBeUndefined();
  });

  it("does not match a sibling with a shared prefix", () => {
    // Guards against `startsWith` false positives (e.g. /app/horas vs a future
    // /app/horas-extras route).
    expect(findActiveNav("/app/horas-extras")).toBeUndefined();
  });

  it("exposes one entry per operational module", () => {
    expect(primaryNavigation.length).toBeGreaterThanOrEqual(8);
    for (const item of primaryNavigation) {
      // Every item lives under /app (the launcher is exactly "/app").
      expect(item.href === "/app" || item.href.startsWith("/app/")).toBe(true);
    }
  });

  it("resolves the admin access route as active", () => {
    expect(findActiveNav("/app/admin/acessos")?.href).toBe(
      "/app/admin/acessos",
    );
  });
});

describe("disabled modules (EP-M07)", () => {
  it("hides Competências, PDI, Clima and Metas from the primary nav", () => {
    const codes = primaryNavigation
      .map((item) => item.permissionCode)
      .filter((code): code is string => Boolean(code));
    for (const disabled of DISABLED_MODULE_CODES) {
      expect(codes).not.toContain(disabled);
    }
  });

  it("keeps Skills active (Skills != Competências)", () => {
    const skills = primaryNavigation.find((i) => i.href === "/app/skills");
    expect(skills?.permissionCode).toBe("SKILLS");
  });

  it("does not expose the disabled routes in the nav catalog", () => {
    const hrefs = primaryNavigation.map((i) => i.href);
    expect(hrefs).not.toContain("/app/competencias");
    expect(hrefs).not.toContain("/app/pdi");
    expect(hrefs).not.toContain("/app/clima");
    expect(hrefs).not.toContain("/app/metas");
  });
});

describe("JumpAcademy rename (EP-M09)", () => {
  it("labels the learning module JumpAcademy while keeping route + code", () => {
    const academy = primaryNavigation.find(
      (i) => i.href === "/app/universidade",
    );
    expect(academy?.label).toBe("JumpAcademy");
    expect(academy?.permissionCode).toBe("UNIVERSIDADE");
    expect(academy?.description).not.toMatch(/Universidade/);
  });
});

describe("admin navigation gating", () => {
  it("includes the access management entry, restricted to ADMIN", () => {
    const acessos = adminNavigation.find(
      (item) => item.href === "/app/admin/acessos",
    );
    expect(acessos).toBeDefined();
    expect(acessos?.requiredRoles).toEqual(["ADMIN"]);
  });

  it("canSeeNavItem hides admin items from non-admins and shows them to admins", () => {
    const acessos = adminNavigation[0];
    expect(canSeeNavItem(acessos, ["ADMIN"])).toBe(true);
    expect(canSeeNavItem(acessos, ["AREA_MANAGER", "FINANCE"])).toBe(false);
    expect(canSeeNavItem(acessos, [])).toBe(false);
  });

  it("treats items without requiredRoles as visible to everyone", () => {
    expect(canSeeNavItem(primaryNavigation[0], [])).toBe(true);
  });
});

describe("permission-matrix nav gating", () => {
  it("the Matriz de Permissões entry is governed by CONFIGURACOES_PERMISSOES", () => {
    const matriz = adminNavigation.find(
      (item) => item.href === "/app/admin/permissoes",
    );
    expect(matriz).toBeDefined();
    expect(matriz?.permissionCode).toBe("CONFIGURACOES_PERMISSOES");
  });

  it("hides coded items when their code is not viewable; shows when it is", () => {
    const horas = primaryNavigation.find((i) => i.href === "/app/horas")!;
    expect(canSeeNavItemByMatrix(horas, new Set())).toBe(false);
    expect(canSeeNavItemByMatrix(horas, new Set(["HORAS"]))).toBe(true);
  });

  it("always shows items without a permissionCode", () => {
    const inicio = primaryNavigation.find((i) => i.href === "/app")!;
    expect(inicio.permissionCode).toBeUndefined();
    expect(canSeeNavItemByMatrix(inicio, new Set())).toBe(true);
  });

  it("navPermissionCodes lists distinct codes including the manage code", () => {
    const codes = navPermissionCodes();
    expect(codes).toContain("HORAS");
    expect(codes).toContain("CONFIGURACOES_PERMISSOES");
    // No duplicates.
    expect(new Set(codes).size).toBe(codes.length);
  });
});
