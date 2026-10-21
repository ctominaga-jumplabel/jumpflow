import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Subtela "Tipos de cobrança" (matriz RBAC): as actions de tipos de cobrança
 * exigem o papel financeiro E a acao na matriz no codigo da subtela. A matriz
 * soma-se ao guard de papel, nunca o substitui.
 */

const h = vi.hoisted(() => {
  const store = {
    allowed: new Set<string>(),
    creates: [] as unknown[],
    updates: [] as unknown[],
    roleDenied: false,
  };
  const prismaMock = {
    billingType: {
      create: vi.fn(async ({ data }: { data: unknown }) => {
        store.creates.push(data);
        return { id: "bt-new" };
      }),
      findUnique: vi.fn(async () => ({ id: "bt-1", name: "Hora" })),
      update: vi.fn(async ({ data }: { data: unknown }) => {
        store.updates.push(data);
        return { id: "bt-1" };
      }),
    },
  };
  return { store, prismaMock };
});

vi.mock("@jumpflow/database", () => ({
  prisma: h.prismaMock,
  Prisma: { PrismaClientKnownRequestError: class extends Error {} },
}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/auth/guards", () => ({
  requireUser: vi.fn(async () => ({ id: "u", roles: ["FINANCE"] })),
  requireRole: vi.fn(async () => {
    if (h.store.roleDenied) throw new Error("NEXT_REDIRECT");
    return { id: "u", roles: ["FINANCE"] };
  }),
}));
vi.mock("@/lib/auth/permissions", () => ({
  can: vi.fn(async (code: string, action: string) =>
    h.store.allowed.has(`${code}:${action}`),
  ),
}));
vi.mock("@/lib/db/users", () => ({
  resolveDbUser: vi.fn(async () => ({ id: "user-1" })),
}));
vi.mock("@/lib/db/audit", () => ({ recordAuditEvent: vi.fn() }));
vi.mock("@/lib/cnpj/provider", () => ({ getCnpjProvider: vi.fn() }));
vi.mock("@/lib/storage/provider", () => ({
  CLIENT_LOGOS_BUCKET: "client-logos",
  getStorageProvider: vi.fn(),
  isStorageConfigured: vi.fn(() => false),
}));
vi.mock("@/lib/storage/file-validation", () => ({
  buildClientLogoKey: vi.fn(),
  validateLogoFile: vi.fn(),
}));

import { createBillingType, updateBillingType } from "./actions";

const input = {
  name: "Hora trabalhada",
  chargeType: "HOURLY" as const,
  roundingRule: "NONE" as const,
  description: "",
  howItWorks: "",
  example: "",
  active: true,
};

beforeEach(() => {
  vi.stubEnv("DATABASE_URL", "postgresql://u:p@localhost:5432/db");
  h.store.allowed = new Set();
  h.store.creates = [];
  h.store.updates = [];
  h.store.roleDenied = false;
});

afterEach(() => vi.unstubAllEnvs());

describe("tipos de cobrança — matriz da subtela", () => {
  it("createBillingType recusa (FORBIDDEN) sem `create` na subtela", async () => {
    h.store.allowed.add("CLIENTES_TIPOS_COBRANCA:view");
    const result = await createBillingType(input);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toBe("FORBIDDEN");
    expect(h.store.creates).toHaveLength(0);
  });

  it("createBillingType grava com `create` concedido", async () => {
    h.store.allowed.add("CLIENTES_TIPOS_COBRANCA:create");
    const result = await createBillingType(input);
    expect(result.ok).toBe(true);
    expect(h.store.creates).toHaveLength(1);
  });

  it("updateBillingType recusa (FORBIDDEN) sem `edit` na subtela", async () => {
    h.store.allowed.add("CLIENTES_TIPOS_COBRANCA:create");
    const result = await updateBillingType({ ...input, id: "bt-1" });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toBe("FORBIDDEN");
    expect(h.store.updates).toHaveLength(0);
  });

  it("updateBillingType grava com `edit` concedido", async () => {
    h.store.allowed.add("CLIENTES_TIPOS_COBRANCA:edit");
    const result = await updateBillingType({ ...input, id: "bt-1" });
    expect(result.ok).toBe(true);
    expect(h.store.updates).toHaveLength(1);
  });

  it("a matriz não substitui o guard de papel", async () => {
    h.store.allowed.add("CLIENTES_TIPOS_COBRANCA:create");
    h.store.roleDenied = true;
    const result = await createBillingType(input);
    expect(result.ok).toBe(false);
    expect(h.store.creates).toHaveLength(0);
  });
});
