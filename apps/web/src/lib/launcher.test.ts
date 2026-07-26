import { describe, expect, it } from "vitest";
import {
  financialSectors,
  isFinancialLauncher,
  isPendingClosingLauncher,
  launcherShortcuts,
  PENDING_CLOSING_PATH,
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

describe("launcher sector home (Melhorias v2 — 3 cards: [ADMIN, FINANCE])", () => {
  it("shows the 3-card sector home to ADMIN and FINANCE", () => {
    expect(isFinancialLauncher(user(["FINANCE"]))).toBe(true);
    expect(isFinancialLauncher(user(["ADMIN"]))).toBe(true);
  });

  it("shows the 3-card home to combos that include ADMIN/FINANCE (precedence)", () => {
    // A user who is FINANCE/ADMIN *and* AREA_MANAGER still lands on the 3 cards
    // — isFinancialLauncher wins over the Pendentes redirect.
    expect(isFinancialLauncher(user(["FINANCE", "ADMIN"]))).toBe(true);
    expect(isFinancialLauncher(user(["FINANCE", "AREA_MANAGER"]))).toBe(true);
    expect(isFinancialLauncher(user(["ADMIN", "AREA_MANAGER"]))).toBe(true);
  });

  it("does NOT show the 3-card home to AREA_MANAGER pure or other profiles", () => {
    // AREA_MANAGER pure is redirected to Pendentes (see isPendingClosingLauncher).
    expect(isFinancialLauncher(user(["AREA_MANAGER"]))).toBe(false);
    expect(isFinancialLauncher(user(["CONSULTANT"]))).toBe(false);
    expect(isFinancialLauncher(user(["PROJECT_MANAGER"]))).toBe(false);
    expect(isFinancialLauncher(user(["SALES"]))).toBe(false);
    expect(isFinancialLauncher(null)).toBe(false);
  });

  it("routes AREA_MANAGER-pure straight to Pendentes de Fechamento", () => {
    expect(isPendingClosingLauncher(user(["AREA_MANAGER"]))).toBe(true);
    expect(PENDING_CLOSING_PATH).toBe("/app/financeiro/pendentes");
  });

  it("does NOT redirect ADMIN/FINANCE combos to Pendentes (they get 3 cards)", () => {
    // Precedence: anyone with ADMIN or FINANCE is excluded from the redirect.
    expect(isPendingClosingLauncher(user(["FINANCE", "AREA_MANAGER"]))).toBe(false);
    expect(isPendingClosingLauncher(user(["ADMIN", "AREA_MANAGER"]))).toBe(false);
    expect(isPendingClosingLauncher(user(["ADMIN"]))).toBe(false);
    expect(isPendingClosingLauncher(user(["FINANCE"]))).toBe(false);
  });

  it("keeps every other profile off the Pendentes redirect (they get the grid)", () => {
    expect(isPendingClosingLauncher(user(["CONSULTANT"]))).toBe(false);
    expect(isPendingClosingLauncher(user(["PROJECT_MANAGER"]))).toBe(false);
    expect(isPendingClosingLauncher(user(["SALES"]))).toBe(false);
    expect(isPendingClosingLauncher(null)).toBe(false);
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
    expect(byKey.get("pendentes")?.href).toBe("/app/financeiro/pendentes");
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
