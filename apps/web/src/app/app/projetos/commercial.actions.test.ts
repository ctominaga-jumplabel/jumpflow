import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Server-action tests for updateProjectCommercial (Comercial).
 *
 * Confirms the commercial surface writes ONLY tipo de cobrança + budget (never
 * the operational fields nor the legacy billingHourlyRate), audits the change
 * as PROJECT_UPDATED, and reports NOT_FOUND for an unknown project. RBAC gating
 * is enforced by requireRole on the server (mocked here, as in sibling tests).
 */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Where = Record<string, any>;

const h = vi.hoisted(() => {
  const store = {
    projects: [] as { id: string; billingTypeId: string | null; budgetHours: unknown }[],
    updates: [] as { id: string; data: Where }[],
    users: [{ id: "user-1", name: "Sam", email: "sam@jumplabel.com.br" }],
    audits: [] as Record<string, unknown>[],
    currentUser: {
      id: "dev-user",
      name: "Sam",
      email: "sam@jumplabel.com.br",
      roles: ["SALES"] as string[],
    },
  };

  const prismaMock = {
    user: {
      findUnique: async ({ where }: { where: Where }) =>
        store.users.find((u) => u.id === where.id || u.email === where.email) ??
        null,
    },
    project: {
      findUnique: async ({ where }: { where: Where }) => {
        const p = store.projects.find((x) => x.id === where.id);
        if (!p) return null;
        return { billingTypeId: p.billingTypeId, budgetHours: p.budgetHours };
      },
      update: async ({ where, data }: { where: Where; data: Where }) => {
        store.updates.push({ id: where.id, data });
        const p = store.projects.find((x) => x.id === where.id)!;
        Object.assign(p, data);
        return { ...p };
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

import {
  updateProjectBillingType,
  updateProjectCommercial,
  updateProjectOpportunityType,
} from "./actions";

beforeEach(() => {
  vi.stubEnv("DATABASE_URL", "postgresql://u:p@localhost:5432/db");
  vi.stubEnv("AUTH_DEV_MODE", "true");
  h.store.projects = [
    { id: "prj-1", billingTypeId: null, budgetHours: null },
  ];
  h.store.updates = [];
  h.store.audits = [];
});

afterEach(() => vi.unstubAllEnvs());

describe("updateProjectCommercial", () => {
  it("writes only billingTypeId and budgetHours, and audits PROJECT_UPDATED", async () => {
    const result = await updateProjectCommercial({
      id: "prj-1",
      billingTypeId: "billing-monthly",
      budgetHours: 120,
      commercialContractRef: "CT-2026-001",
    });
    expect(result.ok).toBe(true);
    expect(h.store.updates).toHaveLength(1);
    expect(h.store.updates[0].data).toEqual({
      billingTypeId: "billing-monthly",
      budgetHours: 120,
      commercialContractRef: "CT-2026-001",
    });
    // Never touches operational fields nor the legacy hourly rate.
    expect(h.store.updates[0].data).not.toHaveProperty("billingHourlyRate");
    expect(h.store.updates[0].data).not.toHaveProperty("name");
    expect(h.store.audits[0]).toMatchObject({ action: "PROJECT_UPDATED" });
  });

  it("normalizes empty values to null", async () => {
    const result = await updateProjectCommercial({ id: "prj-1" });
    expect(result.ok).toBe(true);
    expect(h.store.updates[0].data).toEqual({
      billingTypeId: null,
      budgetHours: null,
      commercialContractRef: null,
    });
  });

  it("returns NOT_FOUND for an unknown project", async () => {
    const result = await updateProjectCommercial({ id: "missing" });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toBe("NOT_FOUND");
  });
});

describe("updateProjectBillingType", () => {
  it("writes only billingTypeId (never budget) and audits PROJECT_UPDATED", async () => {
    h.store.projects = [
      { id: "prj-1", billingTypeId: null, budgetHours: 80 },
    ];
    const result = await updateProjectBillingType({
      id: "prj-1",
      billingTypeId: "billing-hour-package",
    });
    expect(result.ok).toBe(true);
    expect(h.store.updates[0].data).toEqual({
      billingTypeId: "billing-hour-package",
    });
    // Must not touch budget owned by Comercial.
    expect(h.store.updates[0].data).not.toHaveProperty("budgetHours");
    expect(h.store.audits[0]).toMatchObject({ action: "PROJECT_UPDATED" });
  });

  it("returns NOT_FOUND for an unknown project", async () => {
    const result = await updateProjectBillingType({ id: "missing" });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toBe("NOT_FOUND");
  });
});

describe("updateProjectOpportunityType", () => {
  it("writes only opportunityType and audits PROJECT_OPPORTUNITY_TYPE_UPDATED", async () => {
    const result = await updateProjectOpportunityType({
      id: "prj-1",
      opportunityType: "SQUAD",
    });
    expect(result.ok).toBe(true);
    expect(h.store.updates).toHaveLength(1);
    expect(h.store.updates[0].data).toEqual({ opportunityType: "SQUAD" });
    // Must not touch commercial/operational fields.
    expect(h.store.updates[0].data).not.toHaveProperty("billingTypeId");
    expect(h.store.updates[0].data).not.toHaveProperty("budgetHours");
    expect(h.store.audits[0]).toMatchObject({
      action: "PROJECT_OPPORTUNITY_TYPE_UPDATED",
    });
  });

  it("normalizes empty/absent opportunityType to null (clears the CRM value)", async () => {
    // The client sends "" from an empty <select>; preprocess maps it to null.
    const result = await updateProjectOpportunityType({
      id: "prj-1",
      opportunityType: "",
    } as unknown as Parameters<typeof updateProjectOpportunityType>[0]);
    expect(result.ok).toBe(true);
    expect(h.store.updates[0].data).toEqual({ opportunityType: null });
  });

  it("rejects an unknown opportunityType with INVALID_INPUT", async () => {
    const result = await updateProjectOpportunityType({
      id: "prj-1",
      opportunityType: "NOT_A_TYPE",
    } as unknown as Parameters<typeof updateProjectOpportunityType>[0]);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toBe("INVALID_INPUT");
    expect(h.store.updates).toHaveLength(0);
  });

  it("returns NOT_FOUND for an unknown project", async () => {
    const result = await updateProjectOpportunityType({
      id: "missing",
      opportunityType: "PROJECT",
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toBe("NOT_FOUND");
  });
});
