import { describe, expect, it } from "vitest";
import {
  adminGroupedNavigation,
  adminNavigation,
  applyNavOrder,
  canSeeNavItem,
  canSeeNavItemByMatrix,
  findActiveNav,
  isPrimaryGroupedHref,
  navPermissionCodes,
  primaryGroupedNavigation,
  primaryNavigation,
  resolveFinanceTabHref,
  visibleAdminGroup,
  visiblePrimaryGroups,
} from "@/lib/navigation";
import { DISABLED_MODULE_CODES } from "@/lib/modules/disabled-modules";
import { appConfig } from "@/config/app";

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
      if (item.external) {
        // External portals (e.g. JumpAcademy) carry an absolute URL, not a
        // route under /app.
        expect(item.href).toMatch(/^https?:\/\//);
      } else {
        // Every internal item lives under /app (the launcher is exactly "/app").
        expect(item.href === "/app" || item.href.startsWith("/app/")).toBe(true);
      }
    }
  });

  it("resolves the admin access route as active", () => {
    expect(findActiveNav("/app/admin/acessos")?.href).toBe(
      "/app/admin/acessos",
    );
  });
});

describe("resolveFinanceTabHref (aba do Financeiro no menu)", () => {
  it("marks Contas a Pagar when on ?tab=pagar", () => {
    expect(resolveFinanceTabHref("/app/financeiro", "pagar")).toBe(
      "/app/financeiro?tab=pagar",
    );
  });

  it("falls back (Apuração) for receber / no tab", () => {
    expect(resolveFinanceTabHref("/app/financeiro", "receber")).toBeUndefined();
    expect(resolveFinanceTabHref("/app/financeiro", null)).toBeUndefined();
    expect(resolveFinanceTabHref("/app/financeiro", undefined)).toBeUndefined();
  });

  it("only applies to the /app/financeiro pathname", () => {
    // Sibling routes (Cobrança, Status de Faturamento) resolve by pathname.
    expect(resolveFinanceTabHref("/app/financeiro/projetos", "pagar")).toBeUndefined();
    expect(resolveFinanceTabHref("/app/despesas", "pagar")).toBeUndefined();
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

describe("JumpAcademy external portal (EP-M09 / PR #36)", () => {
  it("exposes JumpAcademy as an external portal entry gated by UNIVERSIDADE", () => {
    const academy = primaryNavigation.find(
      (i) => i.permissionCode === "UNIVERSIDADE",
    );
    expect(academy?.label).toBe("JumpAcademy");
    // Portal externo (app separado): abre em nova aba com URL absoluta de config,
    // não mais a rota interna legada /app/universidade.
    expect(academy?.external).toBe(true);
    expect(academy?.href).toBe(appConfig.academyUrl);
    expect(academy?.href).not.toBe("/app/universidade");
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

describe("grupos colapsáveis do menu primário (QW-4)", () => {
  const primaryHrefs = new Set(primaryNavigation.map((i) => i.href));

  it("só agrupa itens reais do catálogo primário, ≥2 por grupo", () => {
    expect(primaryGroupedNavigation.length).toBeGreaterThan(0);
    for (const group of primaryGroupedNavigation) {
      // Não criamos dropdown para 1 item só.
      expect(group.children.length).toBeGreaterThanOrEqual(2);
      for (const child of group.children) {
        // Cada filho é um item existente de primaryNavigation (mesmo gate/label).
        expect(primaryHrefs.has(child.href)).toBe(true);
      }
      // Rótulo do grupo é distinto dos rótulos dos filhos (sem ambiguidade).
      expect(group.children.map((c) => c.label)).not.toContain(group.label);
    }
  });

  it("isPrimaryGroupedHref marca só os hrefs que viraram filhos de dropdown", () => {
    expect(isPrimaryGroupedHref("/app/projetos")).toBe(true);
    expect(isPrimaryGroupedHref("/app/aprovacoes")).toBe(true);
    // Itens que continuam planos no menu.
    expect(isPrimaryGroupedHref("/app/horas")).toBe(false);
    expect(isPrimaryGroupedHref("/app/minhas-notas")).toBe(false);
  });

  it("um submenu NUNCA expõe uma rota que o usuário não pode ver", () => {
    // Usuário sem papéis e com apenas PROJETOS viável: só o filho Projetos
    // aparece, e apenas no seu grupo; os demais filhos/grupos somem.
    const groups = visiblePrimaryGroups([], new Set(["PROJETOS"]));
    const visibleHrefs = groups.flatMap((g) => g.children.map((c) => c.href));
    expect(visibleHrefs).toEqual(["/app/projetos"]);
    // Rotas não concedidas jamais vazam para um dropdown.
    expect(visibleHrefs).not.toContain("/app/clientes");
    expect(visibleHrefs).not.toContain("/app/aprovacoes");
    expect(visibleHrefs).not.toContain("/app/dashboard");
  });

  it("descarta grupos cujos filhos estão todos ocultos por papel/matriz", () => {
    // Sem papéis e sem códigos viáveis: nenhum grupo primário é renderizado.
    expect(visiblePrimaryGroups([], new Set())).toEqual([]);
  });
});

describe("Administração como grupo colapsável (QW-4)", () => {
  const adminCodes = adminNavigation
    .map((i) => i.permissionCode)
    .filter((c): c is string => Boolean(c));

  it("inicia aberto por padrão (preserva a seção sempre expandida)", () => {
    expect(adminGroupedNavigation.defaultOpen).toBe(true);
    expect(adminGroupedNavigation.children).toBe(adminNavigation);
  });

  it("não é renderizado para quem não é admin", () => {
    expect(visibleAdminGroup(["AREA_MANAGER", "FINANCE"], new Set())).toBeUndefined();
  });

  it("aparece para ADMIN com os filhos que ele pode ver", () => {
    const group = visibleAdminGroup(["ADMIN"], new Set(adminCodes));
    expect(group).toBeDefined();
    expect(group?.children.length).toBeGreaterThan(0);
    expect(group?.defaultOpen).toBe(true);
  });
});

describe("applyNavOrder (P28 — ordem persistida do menu)", () => {
  const items = [
    { href: "/a", label: "A" },
    { href: "/b", label: "B" },
    { href: "/c", label: "C" },
    { href: "/d", label: "D" },
  ];

  it("keeps the default order when no positions are saved", () => {
    expect(applyNavOrder(items, {}).map((i) => i.href)).toEqual([
      "/a",
      "/b",
      "/c",
      "/d",
    ]);
  });

  it("sorts positioned items by ascending position", () => {
    const order = { "/c": 0, "/a": 1, "/d": 2, "/b": 3 };
    expect(applyNavOrder(items, order).map((i) => i.href)).toEqual([
      "/c",
      "/a",
      "/d",
      "/b",
    ]);
  });

  it("appends unknown (unsaved) items after the positioned ones, in catalog order", () => {
    // Only /d and /b have a saved position; /a and /c fall back to the end,
    // preserving their original relative order.
    const order = { "/d": 0, "/b": 1 };
    expect(applyNavOrder(items, order).map((i) => i.href)).toEqual([
      "/d",
      "/b",
      "/a",
      "/c",
    ]);
  });

  it("is stable for equal positions (falls back to catalog index)", () => {
    const order = { "/a": 5, "/b": 5 };
    expect(applyNavOrder(items, order).map((i) => i.href)).toEqual([
      "/a",
      "/b",
      "/c",
      "/d",
    ]);
  });

  it("does not mutate the input array", () => {
    const copy = [...items];
    applyNavOrder(items, { "/d": 0 });
    expect(items).toEqual(copy);
  });

  it("orders the real primary navigation deterministically", () => {
    const [first] = primaryNavigation;
    const order = { [primaryNavigation[2].href]: 0 };
    const reordered = applyNavOrder(primaryNavigation, order);
    expect(reordered[0].href).toBe(primaryNavigation[2].href);
    // Same set of items, no loss.
    expect(reordered.length).toBe(primaryNavigation.length);
    expect(new Set(reordered.map((i) => i.href))).toEqual(
      new Set(primaryNavigation.map((i) => i.href)),
    );
    expect(first).toBe(primaryNavigation[0]);
  });
});
