import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Server actions do COE x subtelas da matriz: cada action exige `view` na
 * subtela que serve, além do guard de papel. Negada → FORBIDDEN sem tocar o
 * banco.
 */

const h = vi.hoisted(() => ({
  denied: new Set<string>(),
  prisma: {
    coeMember: {
      findUnique: vi.fn(async () => ({ id: "m1", active: true })),
      update: vi.fn(async () => ({ id: "m1" })),
      create: vi.fn(async () => ({ id: "m1" })),
    },
    coeSquad: {
      findUnique: vi.fn(async () => ({ id: "sq1", createdById: "user-1" })),
      update: vi.fn(async () => ({ id: "sq1" })),
      delete: vi.fn(async () => ({ id: "sq1" })),
    },
    project: { findUnique: vi.fn() },
    consultant: { findUnique: vi.fn(), findMany: vi.fn() },
    $transaction: vi.fn(),
  },
}));

vi.mock("@jumpflow/database", () => ({
  prisma: h.prisma,
  Prisma: { PrismaClientKnownRequestError: class extends Error {} },
}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/auth/guards", () => ({
  requireUser: vi.fn(async () => ({ id: "u", roles: ["ADMIN"] })),
  requireRole: vi.fn(async () => ({ id: "u", roles: ["ADMIN"] })),
}));
vi.mock("@/lib/auth/permissions", () => ({
  can: vi.fn(async (code: string) => !h.denied.has(code)),
}));
vi.mock("@/lib/db/users", () => ({
  resolveDbUser: vi.fn(async () => ({ id: "user-1" })),
}));
vi.mock("@/lib/db/audit", () => ({ recordAuditEvent: vi.fn() }));

import {
  addCoeMember,
  deleteCoeSquad,
  saveCoeSquad,
  setCoeMemberActive,
  setCoeSquadStatus,
  updateCoeMember,
} from "./actions";

beforeEach(() => {
  vi.stubEnv("DATABASE_URL", "postgresql://u:p@localhost:5432/db");
  h.denied = new Set();
  vi.clearAllMocks();
});

afterEach(() => vi.unstubAllEnvs());

function expectForbidden(result: { ok: boolean; error?: string }) {
  expect(result.ok).toBe(false);
  expect(result.error).toBe("FORBIDDEN");
}

describe("COE actions — subtelas da matriz", () => {
  it("curadoria negada: add/update/setActive recusam sem tocar o banco", async () => {
    h.denied.add("COE_CURADORIA");
    expectForbidden(await addCoeMember({} as never));
    expectForbidden(await updateCoeMember({} as never));
    expectForbidden(await setCoeMemberActive({} as never));
    expect(h.prisma.coeMember.findUnique).not.toHaveBeenCalled();
    expect(h.prisma.coeMember.update).not.toHaveBeenCalled();
  });

  it("composição negada: saveCoeSquad recusa", async () => {
    h.denied.add("COE_COMPOSICAO");
    expectForbidden(await saveCoeSquad({} as never));
    expect(h.prisma.project.findUnique).not.toHaveBeenCalled();
  });

  it("propostas negadas: status/remoção recusam", async () => {
    h.denied.add("COE_PROPOSTAS");
    expectForbidden(await setCoeSquadStatus({} as never));
    expectForbidden(await deleteCoeSquad({} as never));
    expect(h.prisma.coeSquad.findUnique).not.toHaveBeenCalled();
  });

  it("concedidas: seguem para a validação normal (não FORBIDDEN)", async () => {
    const result = await updateCoeMember({} as never);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toBe("INVALID_INPUT");
    const removed = await deleteCoeSquad({ id: "sq1" } as never);
    expect(removed.ok).toBe(true);
    expect(h.prisma.coeSquad.delete).toHaveBeenCalledTimes(1);
  });
});
