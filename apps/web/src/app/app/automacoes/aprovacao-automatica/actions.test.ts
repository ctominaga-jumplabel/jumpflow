import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Tests for the auto-approval admin server actions. The engine
 * (runAutoApproval) is mocked — we only verify the action layer: RBAC,
 * the no-database guard, the aggregate-only summary and the audited
 * exception toggle. Prisma is mocked in-memory for the toggle path.
 */

const h = vi.hoisted(() => {
  const store = {
    currentUser: {
      id: "u1",
      name: "Ana",
      email: "ana@x.com",
      roles: ["ADMIN"] as string[],
    },
    exceptions: [] as {
      id: string;
      active: boolean;
      type: string;
      consultantId: string;
      projectId: string;
    }[],
    audits: [] as Record<string, unknown>[],
    runResult: {
      skipped: false,
      processed: 3,
      approved: 2,
      pending: 1,
      raced: 0,
      ruleCounts: { DEFAULT: 2 },
    } as {
      skipped: boolean;
      reason?: string;
      processed: number;
      approved: number;
      pending: number;
      raced: number;
      ruleCounts: Record<string, number>;
    },
  };

  const prismaMock = {
    autoApprovalException: {
      findUnique: async ({ where }: { where: { id: string } }) => {
        const ex = store.exceptions.find((e) => e.id === where.id);
        return ex ? { ...ex } : null;
      },
      update: async ({
        where,
        data,
      }: {
        where: { id: string };
        data: { active: boolean };
      }) => {
        const ex = store.exceptions.find((e) => e.id === where.id);
        if (ex) ex.active = data.active;
        return { id: where.id, active: data.active };
      },
    },
    user: {
      findUnique: async () => ({ id: "u1", name: "Ana", email: "ana@x.com" }),
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
  Prisma: { JsonNull: "__JsonNull__" },
}));

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

vi.mock("@/lib/auth/guards", () => ({
  requireRole: vi.fn(async (roles: string | string[]) => {
    const required = Array.isArray(roles) ? roles : [roles];
    const allowed =
      required.length === 0 ||
      required.some((r) => h.store.currentUser.roles.includes(r));
    if (!allowed) {
      const err = new Error("NEXT_REDIRECT");
      Object.assign(err, {
        digest: "NEXT_REDIRECT;replace;/access-denied;307;",
      });
      throw err;
    }
    return h.store.currentUser;
  }),
}));

vi.mock("@/lib/automation/auto-approval", () => ({
  runAutoApproval: vi.fn(async () => h.store.runResult),
}));

import {
  runAutoApprovalNow,
  setExceptionActive,
} from "@/app/app/automacoes/aprovacao-automatica/actions";

beforeEach(() => {
  vi.stubEnv("DATABASE_URL", "postgresql://u:p@localhost:5432/db");
  h.store.currentUser.roles = ["ADMIN"];
  h.store.exceptions = [];
  h.store.audits = [];
  h.store.runResult = {
    skipped: false,
    processed: 3,
    approved: 2,
    pending: 1,
    raced: 0,
    ruleCounts: { DEFAULT: 2 },
  };
});

afterEach(() => vi.unstubAllEnvs());

describe("runAutoApprovalNow", () => {
  it("returns only the aggregate summary (no sensitive data)", async () => {
    const result = await runAutoApprovalNow();
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data).toEqual({
      processed: 3,
      approved: 2,
      pending: 1,
      raced: 0,
      skipped: false,
      reason: undefined,
    });
    // ruleCounts is internal and must not leak to the client.
    expect(result.data).not.toHaveProperty("ruleCounts");
  });

  it("surfaces a disabled engine as a skipped summary", async () => {
    h.store.runResult = {
      skipped: true,
      reason: "disabled",
      processed: 0,
      approved: 0,
      pending: 0,
      raced: 0,
      ruleCounts: {},
    };
    const result = await runAutoApprovalNow();
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.skipped).toBe(true);
    expect(result.data.reason).toBe("disabled");
  });

  it("fails honestly when no database is configured", async () => {
    vi.stubEnv("DATABASE_URL", "");
    const result = await runAutoApprovalNow();
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toBe("NO_DATABASE");
  });

  it("redirects (rethrows) a user without the required role", async () => {
    h.store.currentUser.roles = ["CONSULTANT"];
    await expect(runAutoApprovalNow()).rejects.toMatchObject({
      digest: expect.stringContaining("/access-denied"),
    });
  });
});

describe("setExceptionActive", () => {
  it("deactivates an active exception and audits the change", async () => {
    h.store.exceptions = [
      { id: "x1", active: true, type: "ANY_HOURS", consultantId: "c1", projectId: "p1" },
    ];
    const result = await setExceptionActive({ exceptionId: "x1", active: false });
    expect(result.ok).toBe(true);
    expect(h.store.exceptions[0].active).toBe(false);
    expect(h.store.audits).toHaveLength(1);
    expect(h.store.audits[0]).toMatchObject({
      entityType: "AutoApprovalException",
      entityId: "x1",
      action: "AUTO_APPROVAL_EXCEPTION_DEACTIVATED",
    });
  });

  it("reactivates and records the activation action", async () => {
    h.store.exceptions = [
      { id: "x2", active: false, type: "WEEKEND", consultantId: "c1", projectId: "p1" },
    ];
    const result = await setExceptionActive({ exceptionId: "x2", active: true });
    expect(result.ok).toBe(true);
    expect(h.store.exceptions[0].active).toBe(true);
    expect(h.store.audits[0]).toMatchObject({
      action: "AUTO_APPROVAL_EXCEPTION_ACTIVATED",
    });
  });

  it("is a no-op (no write, no audit) when the state is unchanged", async () => {
    h.store.exceptions = [
      { id: "x3", active: true, type: "ANY_HOURS", consultantId: "c1", projectId: "p1" },
    ];
    const result = await setExceptionActive({ exceptionId: "x3", active: true });
    expect(result.ok).toBe(true);
    expect(h.store.audits).toHaveLength(0);
  });

  it("returns NOT_FOUND for an unknown exception", async () => {
    const result = await setExceptionActive({ exceptionId: "ghost", active: false });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toBe("NOT_FOUND");
  });

  it("rejects a non-management user", async () => {
    h.store.currentUser.roles = ["FINANCE"];
    await expect(
      setExceptionActive({ exceptionId: "x1", active: false }),
    ).rejects.toMatchObject({
      digest: expect.stringContaining("/access-denied"),
    });
  });
});
