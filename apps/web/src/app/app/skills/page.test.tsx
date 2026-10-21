import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Subtelas "Meu Currículo" e "Catálogo" em /app/skills: o servidor resolve a
 * matriz, esconde a aba e não carrega o catálogo quando a subtela é negada. A
 * aba "Skills" (padrão) segue governada pelo código da tela.
 */

const h = vi.hoisted(() => ({
  user: { id: "u", roles: ["PEOPLE"] as string[] },
  denied: new Set<string>(),
  listSkillCatalog: vi.fn(async () => [{ id: "sk-1" }]),
}));

vi.mock("@/lib/auth/guards", async () => {
  const { hasRole } = await import("@/lib/auth/route-permissions");
  return { requireUser: vi.fn(async () => h.user), hasRole };
});
vi.mock("@/lib/auth/permissions", () => ({
  canEach: vi.fn(async (codes: string[]) =>
    Object.fromEntries(codes.map((c) => [c, !h.denied.has(c)])),
  ),
}));
vi.mock("@/lib/db/config", () => ({ isDatabaseConfigured: () => true }));
vi.mock("@/lib/db/timesheet", () => ({
  getConsultantForUser: vi.fn(async () => null),
}));
vi.mock("@/lib/db/competencies", () => ({
  listSkillCoverage: vi.fn(async () => []),
  listSkillCatalog: h.listSkillCatalog,
}));
vi.mock("@jumpflow/database", () => ({ prisma: {} }));
vi.mock("@/lib/skills/flags", () => ({
  isCurriculumAiImportEnabled: () => false,
}));
vi.mock("@/components/ui/PageHeader", () => ({ PageHeader: () => null }));
vi.mock("@/components/skills/SkillsTabs", () => ({ SkillsTabs: () => null }));
vi.mock("@/components/competencies/SkillCatalogManager", () => ({
  SkillCatalogManager: () => null,
}));

import SkillsPage from "./page";

async function tabsProps(): Promise<Record<string, unknown>> {
  const tree = await SkillsPage({ searchParams: Promise.resolve({}) });
  // SkillsTabs é o 2º filho do wrapper.
  const children = (tree as { props: { children: unknown[] } }).props.children;
  return (children[1] as { props: Record<string, unknown> }).props;
}

beforeEach(() => {
  h.listSkillCatalog.mockClear();
  h.user = { id: "u", roles: ["PEOPLE"] };
  h.denied = new Set();
});

describe("SkillsPage — subtelas da matriz", () => {
  it("concedidas: comportamento padrão inalterado", async () => {
    const props = await tabsProps();
    expect(props.showCurriculum).toBe(true);
    expect(props.catalogContent).toBeTruthy();
    expect(h.listSkillCatalog).toHaveBeenCalledTimes(1);
  });

  it("Catálogo negado: esconde a aba e não carrega o catálogo", async () => {
    h.denied.add("SKILLS_CATALOGO");
    const props = await tabsProps();
    expect(props.catalogContent).toBeUndefined();
    expect(h.listSkillCatalog).not.toHaveBeenCalled();
    expect(props.showCurriculum).toBe(true);
  });

  it("Catálogo concedido na matriz continua exigindo o papel de escrita", async () => {
    h.user = { id: "u", roles: ["CONSULTANT"] };
    const props = await tabsProps();
    expect(props.catalogContent).toBeUndefined();
    expect(h.listSkillCatalog).not.toHaveBeenCalled();
  });

  it("Meu Currículo negado: esconde a aba", async () => {
    h.denied.add("SKILLS_CURRICULO");
    const props = await tabsProps();
    expect(props.showCurriculum).toBe(false);
    expect(props.catalogContent).toBeTruthy();
  });
});
