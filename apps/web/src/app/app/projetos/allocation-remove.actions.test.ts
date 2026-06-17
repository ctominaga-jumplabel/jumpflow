import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Server-action tests for removeAllocation (Projetos).
 *
 * Business rule: a consultant link with ANY logged hours is kept for history
 * and flagged INACTIVE; a link with no hours is treated as a mistake and hard
 * deleted, cleaning up its dependent rows in a transaction.
 */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Where = Record<string, any>;

const h = vi.hoisted(() => {
  const store = {
    allocations: [] as { id: string; status: string; consultantId: string; projectId: string }[],
    timeEntryCount: 0,
    deleted: {
      allocationSkill: 0,
      projectSaleRate: 0,
      consultantAllocationCostRate: 0,
      timesheetDefault: 0,
      allocation: false,
    },
    updates: [] as { id: string; data: Where }[],
    users: [{ id: "user-1", name: "Ana", email: "ana@jumplabel.com.br" }],
    audits: [] as Record<string, unknown>[],
    currentUser: {
      id: "dev-user",
      name: "Ana",
      email: "ana@jumplabel.com.br",
      roles: ["ADMIN"] as string[],
    },
  };

  const prismaMock = {
    $transaction: async (fn: (tx: unknown) => Promise<unknown>) => fn(prismaMock),
    user: {
      findUnique: async ({ where }: { where: Where }) =>
        store.users.find((u) => u.id === where.id || u.email === where.email) ??
        null,
    },
    allocation: {
      findUnique: async ({ where }: { where: Where }) => {
        const a = store.allocations.find((x) => x.id === where.id);
        return a ? { ...a } : null;
      },
      update: async ({ where, data }: { where: Where; data: Where }) => {
        store.updates.push({ id: where.id, data });
        const a = store.allocations.find((x) => x.id === where.id)!;
        Object.assign(a, data);
        return { ...a };
      },
      delete: async ({ where }: { where: Where }) => {
        store.deleted.allocation = true;
        store.allocations = store.allocations.filter((x) => x.id !== where.id);
        return { id: where.id };
      },
    },
    timeEntry: {
      count: async () => store.timeEntryCount,
    },
    allocationSkill: {
      deleteMany: async () => {
        store.deleted.allocationSkill += 1;
        return { count: 0 };
      },
    },
    projectSaleRate: {
      deleteMany: async () => {
        store.deleted.projectSaleRate += 1;
        return { count: 0 };
      },
    },
    consultantAllocationCostRate: {
      deleteMany: async () => {
        store.deleted.consultantAllocationCostRate += 1;
        return { count: 0 };
      },
    },
    timesheetDefault: {
      deleteMany: async () => {
        store.deleted.timesheetDefault += 1;
        return { count: 0 };
      },
    },
    auditEvent: {
      create: async ({ data }: { data: Record<string, unknown> }) => {
        store.audits.push(data);
        return data;
      },
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
  requireUser: vi.fn(async () => h.store.currentUser),
  requireRole: vi.fn(async () => h.store.currentUser),
}));

import { removeAllocation } from "./actions";

beforeEach(() => {
  vi.stubEnv("DATABASE_URL", "postgresql://u:p@localhost:5432/db");
  vi.stubEnv("AUTH_DEV_MODE", "true");
  h.store.allocations = [
    { id: "alloc-1", status: "ACTIVE", consultantId: "con-1", projectId: "prj-1" },
  ];
  h.store.timeEntryCount = 0;
  h.store.deleted = {
    allocationSkill: 0,
    projectSaleRate: 0,
    consultantAllocationCostRate: 0,
    timesheetDefault: 0,
    allocation: false,
  };
  h.store.updates = [];
  h.store.audits = [];
});

afterEach(() => vi.unstubAllEnvs());

describe("removeAllocation", () => {
  it("deactivates the link (INACTIVE) when there are logged hours", async () => {
    h.store.timeEntryCount = 3;
    const result = await removeAllocation({ id: "alloc-1" });
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.data.outcome).toBe("deactivated");
    expect(h.store.updates[0]).toMatchObject({
      id: "alloc-1",
      data: { status: "INACTIVE" },
    });
    expect(h.store.deleted.allocation).toBe(false);
    expect(h.store.audits[0]).toMatchObject({ action: "ALLOCATION_DEACTIVATED" });
  });

  it("hard deletes the link (and dependents) when there are no logged hours", async () => {
    h.store.timeEntryCount = 0;
    const result = await removeAllocation({ id: "alloc-1" });
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.data.outcome).toBe("deleted");
    expect(h.store.deleted.allocation).toBe(true);
    expect(h.store.deleted.allocationSkill).toBe(1);
    expect(h.store.deleted.projectSaleRate).toBe(1);
    expect(h.store.deleted.consultantAllocationCostRate).toBe(1);
    expect(h.store.deleted.timesheetDefault).toBe(1);
    expect(h.store.audits[0]).toMatchObject({ action: "ALLOCATION_DELETED" });
  });

  it("returns NOT_FOUND for an unknown allocation", async () => {
    const result = await removeAllocation({ id: "missing" });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toBe("NOT_FOUND");
  });
});
