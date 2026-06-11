import { describe, expect, it } from "vitest";
import {
  launcherShortcuts,
  shortcutsForUser,
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
