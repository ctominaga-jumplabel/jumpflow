import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Tests for the auto-approval admin server actions. The engine
 * (runAutoApproval) is mocked — we only verify the action layer: RBAC,
 * the no-database guard and the aggregate-only summary. Rule configuration
 * moved to the project screen, so the admin screen has no mutations beyond
 * "Executar agora".
 */

const h = vi.hoisted(() => {
  const store = {
    currentUser: {
      id: "u1",
      name: "Ana",
      email: "ana@x.com",
      roles: ["ADMIN"] as string[],
    },
    runResult: {
      skipped: false,
      processed: 3,
      approved: 2,
      pending: 1,
      raced: 0,
      ruleCounts: { "RULE_RANGE": 2 },
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

  return { store };
});

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

import { runAutoApprovalNow } from "@/app/app/automacoes/aprovacao-automatica/actions";

beforeEach(() => {
  vi.stubEnv("DATABASE_URL", "postgresql://u:p@localhost:5432/db");
  h.store.currentUser.roles = ["ADMIN"];
  h.store.runResult = {
    skipped: false,
    processed: 3,
    approved: 2,
    pending: 1,
    raced: 0,
    ruleCounts: { "RULE_RANGE": 2 },
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
