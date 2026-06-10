import { describe, expect, it } from "vitest";
import { shortcutsForUser } from "./launcher";
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
  });

  it("shows aprovacoes to managers", () => {
    const keys = shortcutsForUser(user(["PROJECT_MANAGER"])).map((s) => s.key);
    expect(keys).toContain("aprovacoes");
    expect(keys).not.toContain("financeiro");
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
      ]),
    );
  });

  it("shows nothing to an unauthenticated user", () => {
    expect(shortcutsForUser(null)).toEqual([]);
  });
});
