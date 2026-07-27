import { describe, expect, it } from "vitest";
import {
  financialSectors,
  isAdminLauncher,
  isExclusivelyFinance,
  launcherShortcuts,
  sectorsWithBadges,
  shortcutsForUser,
  sumBadgeCounts,
  withBadges,
  type LauncherBadge,
} from "./launcher";
import type { AppUser } from "./auth/types";
import type { RoleName } from "./auth/roles";

function user(roles: RoleName[]): AppUser {
  return { id: "u", name: "Teste", email: "t@jumplabel.com.br", roles };
}

describe("launcher shortcutsForUser", () => {
  it("shows consultant-first shortcuts but hides management ones", () => {
    const keys = shortcutsForUser(user(["CONSULTANT"])).map((s) => s.key);
    expect(keys).toContain("horas");
    expect(keys).toContain("despesas");
    expect(keys).toContain("skills");
    expect(keys).toContain("projetos");
    expect(keys).not.toContain("aprovacoes");
    expect(keys).not.toContain("financeiro");
    expect(keys).not.toContain("aprovacao-automatica");
    expect(keys).not.toContain("acessos");
  });

  it("shows aprovacoes to managers", () => {
    const keys = shortcutsForUser(user(["PROJECT_MANAGER"])).map((s) => s.key);
    expect(keys).toContain("aprovacoes");
    expect(keys).not.toContain("financeiro");
    // PROJECT_MANAGER read-only on automation is deferred: hidden for now.
    expect(keys).not.toContain("aprovacao-automatica");
  });

  it("shows aprovacao-automatica only to ADMIN and AREA_MANAGER", () => {
    expect(
      shortcutsForUser(user(["ADMIN"])).map((s) => s.key),
    ).toContain("aprovacao-automatica");
    expect(
      shortcutsForUser(user(["AREA_MANAGER"])).map((s) => s.key),
    ).toContain("aprovacao-automatica");
    // FINANCE manages money, not the approval engine.
    expect(
      shortcutsForUser(user(["FINANCE"])).map((s) => s.key),
    ).not.toContain("aprovacao-automatica");
  });

  it("shows acessos only to ADMIN", () => {
    expect(shortcutsForUser(user(["ADMIN"])).map((s) => s.key)).toContain(
      "acessos",
    );
    expect(
      shortcutsForUser(user(["AREA_MANAGER"])).map((s) => s.key),
    ).not.toContain("acessos");
    expect(
      shortcutsForUser(user(["FINANCE"])).map((s) => s.key),
    ).not.toContain("acessos");
    expect(
      shortcutsForUser(user(["CONSULTANT"])).map((s) => s.key),
    ).not.toContain("acessos");
  });

  it("shows financeiro to financial roles", () => {
    const keys = shortcutsForUser(user(["FINANCE"])).map((s) => s.key);
    expect(keys).toContain("financeiro");
    // FINANCE also triages the finance stage of expense approvals.
    expect(keys).toContain("aprovacoes");
  });

  it("shows every shortcut to admin", () => {
    const keys = shortcutsForUser(user(["ADMIN"])).map((s) => s.key);
    expect(keys).toEqual(
      expect.arrayContaining([
        "horas",
        "despesas",
        "skills",
        "projetos",
        "aprovacoes",
        "financeiro",
        "aprovacao-automatica",
        "acessos",
      ]),
    );
  });

  it("shows nothing to an unauthenticated user", () => {
    expect(shortcutsForUser(null)).toEqual([]);
  });

  it("defines shortcuts WITHOUT embedded badges (pure contract)", () => {
    // Badges are merged separately (real or mock); the definitions stay clean.
    expect(launcherShortcuts.every((s) => s.badge === undefined)).toBe(true);
  });
});

describe("launcher withBadges", () => {
  it("merges a key→badge map onto matching shortcuts only", () => {
    const shortcuts = shortcutsForUser(user(["ADMIN"]));
    const badges: Record<string, LauncherBadge> = {
      horas: { count: 3, tone: "warning", label: "rascunhos a enviar" },
      aprovacoes: { count: 5, tone: "info", label: "aguardando" },
      // Unknown keys are ignored.
      desconhecido: { count: 9, tone: "danger", label: "x" },
    };
    const merged = withBadges(shortcuts, badges);
    const byKey = new Map(merged.map((s) => [s.key, s]));
    expect(byKey.get("horas")?.badge).toEqual(badges.horas);
    expect(byKey.get("aprovacoes")?.badge).toEqual(badges.aprovacoes);
    // Shortcuts without a matching badge stay unannotated.
    expect(byKey.get("despesas")?.badge).toBeUndefined();
    expect(byKey.get("projetos")?.badge).toBeUndefined();
  });

  it("does not mutate the input shortcuts", () => {
    const shortcuts = shortcutsForUser(user(["ADMIN"]));
    withBadges(shortcuts, {
      horas: { count: 1, tone: "warning", label: "a enviar" },
    });
    expect(shortcuts.every((s) => s.badge === undefined)).toBe(true);
  });
});

describe("launcher landing por papel (correções de navegação — 2026-07-27)", () => {
  it("routes ADMIN to the operational shortcut GRID (not the 3 cards)", () => {
    expect(isAdminLauncher(user(["ADMIN"]))).toBe(true);
    // ADMIN não é Financeiro-exclusivo — cai na grade, nunca nos 3 cards.
    expect(isExclusivelyFinance(user(["ADMIN"]))).toBe(false);
  });

  it("shows the 3-card home ONLY to an exclusively-FINANCE user", () => {
    expect(isExclusivelyFinance(user(["FINANCE"]))).toBe(true);
    // Não é ADMIN, então não cai na grade.
    expect(isAdminLauncher(user(["FINANCE"]))).toBe(false);
  });

  it("gives ADMIN+FINANCE(+…) the grade (Admin has precedence)", () => {
    // isAdminLauncher é checado ANTES de isExclusivelyFinance no page.tsx; e um
    // combo nunca é "exclusivamente FINANCE".
    expect(isAdminLauncher(user(["FINANCE", "ADMIN"]))).toBe(true);
    expect(isExclusivelyFinance(user(["FINANCE", "ADMIN"]))).toBe(false);
    expect(isAdminLauncher(user(["ADMIN", "AREA_MANAGER"]))).toBe(true);
  });

  it("treats AREA_MANAGER-pure as neither Admin nor Finance-exclusive (→ Feed)", () => {
    expect(isAdminLauncher(user(["AREA_MANAGER"]))).toBe(false);
    expect(isExclusivelyFinance(user(["AREA_MANAGER"]))).toBe(false);
  });

  it("sends PM/SALES/PEOPLE/CONSULTANT to neither launcher variation (→ Feed)", () => {
    for (const role of [
      "PROJECT_MANAGER",
      "SALES",
      "PEOPLE",
      "CONSULTANT",
    ] as const) {
      expect(isAdminLauncher(user([role]))).toBe(false);
      expect(isExclusivelyFinance(user([role]))).toBe(false);
    }
  });

  it("does NOT treat a FINANCE combo with another role as Finance-exclusive", () => {
    // FINANCE + AREA_MANAGER → não é exclusivo (vai para o Feed, não 3 cards).
    expect(isExclusivelyFinance(user(["FINANCE", "AREA_MANAGER"]))).toBe(false);
    expect(isExclusivelyFinance(user(["FINANCE", "SALES"]))).toBe(false);
  });

  it("returns false for a null or role-less user (no launcher variation)", () => {
    expect(isAdminLauncher(null)).toBe(false);
    expect(isExclusivelyFinance(null)).toBe(false);
    expect(isExclusivelyFinance(user([]))).toBe(false);
  });

  it("exposes the three sectors pointing to the finance surfaces", () => {
    expect(financialSectors.map((s) => s.key)).toEqual([
      "receber",
      "pagar",
      "pendentes",
    ]);
    const byKey = new Map(financialSectors.map((s) => [s.key, s]));
    expect(byKey.get("receber")?.href).toBe("/app/financeiro?tab=receber");
    expect(byKey.get("pagar")?.href).toBe("/app/financeiro?tab=pagar");
    // A aba Pendentes vive dentro do Financeiro (o Financeiro-exclusivo acessa
    // por ?tab=pendentes); a rota standalone segue para o AREA_MANAGER.
    expect(byKey.get("pendentes")?.href).toBe("/app/financeiro?tab=pendentes");
  });

  it("annotates only the sector whose badgeKey matches (Contas a Receber)", () => {
    const badges: Record<string, LauncherBadge> = {
      financeiro: { count: 4, tone: "info", label: "prontos p/ fechar" },
    };
    const merged = sectorsWithBadges(financialSectors, badges);
    const byKey = new Map(merged.map((s) => [s.key, s]));
    expect(byKey.get("receber")?.badge).toEqual(badges.financeiro);
    expect(byKey.get("pagar")?.badge).toBeUndefined();
  });

  it("does not mutate the input sectors", () => {
    sectorsWithBadges(financialSectors, {
      financeiro: { count: 1, tone: "info", label: "x" },
    });
    expect(financialSectors.every((s) => s.badge === undefined)).toBe(true);
  });
});

describe("sumBadgeCounts (P20 — total do sino de notificações)", () => {
  it("returns 0 for no badges", () => {
    expect(sumBadgeCounts({})).toBe(0);
  });

  it("sums the counts across all badges", () => {
    const badges: Record<string, LauncherBadge> = {
      horas: { count: 2, tone: "warning", label: "rascunhos pendentes" },
      aprovacoes: { count: 5, tone: "info", label: "aguardando" },
      financeiro: { count: 3, tone: "info", label: "a pagar" },
    };
    expect(sumBadgeCounts(badges)).toBe(10);
  });

  it("ignores badge tone/label and counts only the numbers", () => {
    const badges: Record<string, LauncherBadge> = {
      a: { count: 1, tone: "danger", label: "x" },
      b: { count: 0, tone: "info", label: "y" },
    };
    expect(sumBadgeCounts(badges)).toBe(1);
  });
});
