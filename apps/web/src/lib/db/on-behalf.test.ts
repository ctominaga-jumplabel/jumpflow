import { afterEach, describe, expect, it, vi } from "vitest";
import type { AppUser } from "@/lib/auth/types";
import type { RoleName } from "@/lib/auth/roles";

/**
 * Testes do módulo de lançamento "em nome de" (on-behalf). Cobrem a AUTORIZAÇÃO
 * (quem pode) e o SHAPE das consultas de resolução/listagem do consultor-alvo.
 * A regra "consultor precisa estar no projeto" NÃO vive aqui — é a trava de
 * alocação de cada gravação (ensureActiveAllocation), coberta nos testes de
 * horas/despesas.
 */

const h = vi.hoisted(() => {
  const calls: {
    findFirst: unknown[];
    allocationFindMany: unknown[];
  } = {
    findFirst: [],
    allocationFindMany: [],
  };
  const results = {
    findFirst: null as unknown,
    allocationFindMany: [] as unknown[],
  };
  return { calls, results };
});

vi.mock("@jumpflow/database", () => ({
  prisma: {
    consultant: {
      findFirst: async (args: unknown) => {
        h.calls.findFirst.push(args);
        return h.results.findFirst;
      },
    },
    allocation: {
      findMany: async (args: unknown) => {
        h.calls.allocationFindMany.push(args);
        return h.results.allocationFindMany;
      },
    },
  },
}));

import {
  canActOnBehalf,
  ON_BEHALF_ROLES,
  findActiveConsultantById,
  getOnBehalfPickerData,
} from "./on-behalf";

function userWithRoles(roles: RoleName[]): AppUser {
  // Só `roles` importa para hasRole; o resto é preenchido de forma mínima.
  return {
    id: "u1",
    name: "Test",
    email: "t@example.com",
    roles,
  } as AppUser;
}

afterEach(() => {
  h.calls.findFirst.length = 0;
  h.calls.allocationFindMany.length = 0;
  h.results.findFirst = null;
  h.results.allocationFindMany = [];
});

describe("canActOnBehalf", () => {
  it("permite ADMIN e AREA_MANAGER", () => {
    expect(canActOnBehalf(userWithRoles(["ADMIN"]))).toBe(true);
    expect(canActOnBehalf(userWithRoles(["AREA_MANAGER"]))).toBe(true);
    // Basta um dos papéis autorizados na lista.
    expect(canActOnBehalf(userWithRoles(["CONSULTANT", "AREA_MANAGER"]))).toBe(
      true,
    );
  });

  it("nega PROJECT_MANAGER, FINANCE, CONSULTANT e sem papel", () => {
    expect(canActOnBehalf(userWithRoles(["PROJECT_MANAGER"]))).toBe(false);
    expect(canActOnBehalf(userWithRoles(["FINANCE"]))).toBe(false);
    expect(canActOnBehalf(userWithRoles(["CONSULTANT"]))).toBe(false);
    expect(canActOnBehalf(userWithRoles([]))).toBe(false);
  });

  it("ON_BEHALF_ROLES é exatamente ADMIN e AREA_MANAGER", () => {
    expect([...ON_BEHALF_ROLES].sort()).toEqual(["ADMIN", "AREA_MANAGER"]);
  });
});

describe("findActiveConsultantById", () => {
  it("consulta por id E status ATIVO (não resolve consultor inativo)", async () => {
    h.results.findFirst = { id: "c1", name: "Alvo" };
    const found = await findActiveConsultantById("c1");
    expect(found).toEqual({ id: "c1", name: "Alvo" });
    expect(h.calls.findFirst[0]).toEqual({
      where: { id: "c1", status: "ACTIVE" },
    });
  });

  it("devolve null quando não há consultor ativo com aquele id", async () => {
    h.results.findFirst = null;
    expect(await findActiveConsultantById("inexistente")).toBeNull();
  });
});

describe("getOnBehalfPickerData", () => {
  it("consulta só alocações ativas de consultor ativo em projeto não encerrado", async () => {
    h.results.allocationFindMany = [];
    await getOnBehalfPickerData();
    expect(h.calls.allocationFindMany[0]).toEqual({
      where: {
        status: "ACTIVE",
        consultant: { status: "ACTIVE" },
        project: { status: { not: "CLOSED" } },
      },
      select: {
        consultantId: true,
        projectId: true,
        consultant: { select: { name: true } },
        project: { select: { name: true } },
      },
    });
  });

  it("deriva consultores/projetos/grafo dedup e ordenados por nome", async () => {
    h.results.allocationFindMany = [
      // Bruno aparece em dois projetos; a dupla (Bruno,projB) repete uma vez.
      {
        consultantId: "c2",
        projectId: "pB",
        consultant: { name: "Bruno" },
        project: { name: "Projeto B" },
      },
      {
        consultantId: "c1",
        projectId: "pA",
        consultant: { name: "Ana" },
        project: { name: "Projeto A" },
      },
      {
        consultantId: "c2",
        projectId: "pB",
        consultant: { name: "Bruno" },
        project: { name: "Projeto B" },
      },
      {
        consultantId: "c2",
        projectId: "pA",
        consultant: { name: "Bruno" },
        project: { name: "Projeto A" },
      },
    ];
    const data = await getOnBehalfPickerData();
    expect(data.consultants).toEqual([
      { id: "c1", name: "Ana" },
      { id: "c2", name: "Bruno" },
    ]);
    expect(data.projects).toEqual([
      { id: "pA", name: "Projeto A" },
      { id: "pB", name: "Projeto B" },
    ]);
    // Pares únicos (a dupla Bruno/pB não duplica).
    expect(data.allocations).toEqual([
      { consultantId: "c2", projectId: "pB" },
      { consultantId: "c1", projectId: "pA" },
      { consultantId: "c2", projectId: "pA" },
    ]);
  });
});
