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
  const calls: { findFirst: unknown[]; findMany: unknown[] } = {
    findFirst: [],
    findMany: [],
  };
  const results = {
    findFirst: null as unknown,
    findMany: [] as unknown[],
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
      findMany: async (args: unknown) => {
        h.calls.findMany.push(args);
        return h.results.findMany;
      },
    },
  },
}));

import {
  canActOnBehalf,
  ON_BEHALF_ROLES,
  findActiveConsultantById,
  listOnBehalfConsultants,
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
  h.calls.findMany.length = 0;
  h.results.findFirst = null;
  h.results.findMany = [];
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

describe("listOnBehalfConsultants", () => {
  it("lista ativos com alocação ativa em projeto não encerrado, ordenados por nome", async () => {
    h.results.findMany = [
      { id: "c1", name: "Ana" },
      { id: "c2", name: "Bruno" },
    ];
    const list = await listOnBehalfConsultants();
    expect(list).toEqual([
      { id: "c1", name: "Ana" },
      { id: "c2", name: "Bruno" },
    ]);
    expect(h.calls.findMany[0]).toEqual({
      where: {
        status: "ACTIVE",
        allocations: {
          some: { status: "ACTIVE", project: { status: { not: "CLOSED" } } },
        },
      },
      select: { id: true, name: true },
      orderBy: { name: "asc" },
    });
  });
});
