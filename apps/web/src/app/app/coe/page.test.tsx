import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Subtelas do COE na página (servidor): aba negada pela matriz não chega ao
 * cliente e os dados dela nem são lidos. A visão geral segue o código da tela.
 */

const h = vi.hoisted(() => ({
  allowed: {} as Record<string, boolean>,
  db: {
    listCoeMembers: vi.fn(async () => [{ id: "m1", active: true }]),
    listCoeCandidateOptions: vi.fn(async () => [{ id: "c1" }]),
    listCoeProjectOptions: vi.fn(async () => [{ id: "p1" }]),
    listCoeSkillOptions: vi.fn(async () => [{ id: "s1" }]),
    listCoeSquads: vi.fn(async () => [{ id: "sq1" }]),
    getCoeComposition: vi.fn(async () => ({ composition: { assignments: [] } })),
  },
}));

vi.mock("@/lib/auth/guards", () => ({
  requireRole: vi.fn(async () => ({ id: "u", roles: ["ADMIN"] })),
}));
vi.mock("@/lib/auth/permissions", () => ({
  canEach: vi.fn(async (codes: string[]) =>
    Object.fromEntries(codes.map((c) => [c, h.allowed[c] ?? true])),
  ),
}));
vi.mock("@/lib/db/coe", () => h.db);
vi.mock("@/components/ui/PageHeader", () => ({ PageHeader: () => null }));
vi.mock("@/components/coe/CoeView", () => ({ CoeView: () => null }));

import CoePage from "./page";

async function viewProps(): Promise<Record<string, unknown>> {
  const tree = (await CoePage({ searchParams: Promise.resolve({}) })) as {
    props: { children: Array<{ props: Record<string, unknown> }> };
  };
  return tree.props.children[1]!.props;
}

beforeEach(() => {
  h.allowed = {};
  for (const fn of Object.values(h.db)) fn.mockClear();
});

describe("CoePage — subtelas pela matriz", () => {
  it("concedidas: carrega tudo como antes", async () => {
    const props = await viewProps();
    expect(props.allowedTabs).toEqual({
      composition: true,
      proposals: true,
      curation: true,
    });
    expect(props.squads).toEqual([{ id: "sq1" }]);
    expect(props.bundle).not.toBeNull();
    expect(h.db.getCoeComposition).toHaveBeenCalledTimes(1);
  });

  it("negadas: abas fora e dados das abas não são lidos", async () => {
    h.allowed = {
      COE_COMPOSICAO: false,
      COE_PROPOSTAS: false,
      COE_CURADORIA: false,
    };
    const props = await viewProps();
    expect(props.allowedTabs).toEqual({
      composition: false,
      proposals: false,
      curation: false,
    });
    expect(props.bundle).toBeNull();
    expect(props.squads).toEqual([]);
    expect(props.candidateOptions).toEqual([]);
    expect(h.db.getCoeComposition).not.toHaveBeenCalled();
    expect(h.db.listCoeProjectOptions).not.toHaveBeenCalled();
    expect(h.db.listCoeSkillOptions).not.toHaveBeenCalled();
    expect(h.db.listCoeSquads).not.toHaveBeenCalled();
    expect(h.db.listCoeCandidateOptions).not.toHaveBeenCalled();
    // Visão geral (aba padrão) segue carregando os membros.
    expect(h.db.listCoeMembers).toHaveBeenCalledTimes(1);
  });

  it("negar só a curadoria mantém composição e propostas", async () => {
    h.allowed = { COE_CURADORIA: false };
    const props = await viewProps();
    expect(props.candidateOptions).toEqual([]);
    expect(h.db.listCoeCandidateOptions).not.toHaveBeenCalled();
    expect(h.db.getCoeComposition).toHaveBeenCalledTimes(1);
    expect(h.db.listCoeSquads).toHaveBeenCalledTimes(1);
  });
});
