import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Server-action tests for the ad-hoc consultant remuneration (Onda D / D2):
 * loadConsultantAdHocPayments, saveConsultantAdHocPayment and
 * deleteConsultantAdHocPayment. Stateful in-memory Prisma mock. Covers CRUD,
 * the mandatory project link, audit emission and financial RBAC (negative).
 */

interface AdHocRec {
  id: string;
  consultantId: string;
  projectId: string;
  allocationId: string | null;
  amount: number;
  payAt: Date;
  reason: string;
  kind: string;
  status: string;
  createdByUserId: string | null;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Where = Record<string, any>;

const h = vi.hoisted(() => {
  const store = {
    adHoc: [] as AdHocRec[],
    audits: [] as Record<string, unknown>[],
    projects: [
      { id: "seed-project-1", name: "Alpha", client: { name: "Acme" } },
      { id: "seed-project-2", name: "Beta", client: { name: "Globex" } },
    ] as { id: string; name: string; client: { name: string } }[],
    currentUser: {
      id: "dev-user",
      name: "Ana",
      email: "ana@jumplabel.com.br",
      roles: ["FINANCE"] as string[],
    },
    // Matrix codes granted to the current user (additive layer). Empty by
    // default so role-only tests are unaffected.
    grantedCodes: new Set<string>(),
    seq: 0,
  };
  const nextId = (prefix: string) => `${prefix}-${++store.seq}`;

  const prismaMock = {
    consultantAdHocPayment: {
      findMany: async ({ where }: { where?: Where }) => {
        const rows = store.adHoc.filter(
          (r) => !where?.consultantId || r.consultantId === where.consultantId,
        );
        return rows.map((r) => ({
          ...r,
          project: store.projects.find((p) => p.id === r.projectId) ?? null,
        }));
      },
      findUnique: async ({ where }: { where: Where }) => {
        const r = store.adHoc.find((row) => row.id === where.id);
        return r ? { ...r } : null;
      },
      create: async ({ data }: { data: Where }) => {
        const row: AdHocRec = {
          id: nextId("adhoc"),
          consultantId: data.consultantId,
          projectId: data.projectId,
          allocationId: data.allocationId ?? null,
          amount: Number(data.amount),
          payAt: data.payAt,
          reason: data.reason,
          kind: data.kind,
          status: data.status,
          createdByUserId: data.createdByUserId ?? null,
        };
        store.adHoc.push(row);
        return { ...row };
      },
      update: async ({ where, data }: { where: Where; data: Where }) => {
        const row = store.adHoc.find((r) => r.id === where.id)!;
        Object.assign(
          row,
          data,
          data.amount !== undefined ? { amount: Number(data.amount) } : {},
        );
        return { ...row };
      },
      delete: async ({ where }: { where: Where }) => {
        const idx = store.adHoc.findIndex((r) => r.id === where.id);
        const [removed] = store.adHoc.splice(idx, 1);
        return removed;
      },
    },
    project: {
      findMany: async () => store.projects.map((p) => ({ ...p })),
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
  Prisma: {
    JsonNull: "__JsonNull__",
    PrismaClientKnownRequestError: class extends Error {
      code: string;
      constructor(message: string, opts: { code: string }) {
        super(message);
        this.code = opts.code;
      }
    },
  },
}));

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

vi.mock("@/lib/auth/guards", () => ({
  requireUser: vi.fn(async () => h.store.currentUser),
  requireRole: vi.fn(async (roles: string | string[]) => {
    const required = Array.isArray(roles) ? roles : [roles];
    const allowed =
      required.length === 0 ||
      required.some((role) => h.store.currentUser.roles.includes(role));
    if (!allowed) {
      const redirectError = new Error("NEXT_REDIRECT");
      Object.assign(redirectError, {
        digest: "NEXT_REDIRECT;replace;/access-denied;307;",
      });
      throw redirectError;
    }
    return h.store.currentUser;
  }),
  requireRoleOrPermission: vi.fn(
    async (roles: string | string[], code: string) => {
      const required = Array.isArray(roles) ? roles : [roles];
      const roleOk =
        required.length === 0 ||
        required.some((role) => h.store.currentUser.roles.includes(role));
      const grantOk = code ? h.store.grantedCodes.has(code) : false;
      if (!roleOk && !grantOk) {
        const redirectError = new Error("NEXT_REDIRECT");
        Object.assign(redirectError, {
          digest: "NEXT_REDIRECT;replace;/access-denied;307;",
        });
        throw redirectError;
      }
      return h.store.currentUser;
    },
  ),
  hasRoleOrPermission: vi.fn(
    async (_user: unknown, roles: string | string[], code: string) => {
      const required = Array.isArray(roles) ? roles : [roles];
      const roleOk =
        required.length === 0 ||
        required.some((role) => h.store.currentUser.roles.includes(role));
      return roleOk || (code ? h.store.grantedCodes.has(code) : false);
    },
  ),
}));

vi.mock("@/lib/db/users", () => ({
  resolveDbUser: vi.fn(async () => ({ id: "user-1" })),
}));

import {
  deleteConsultantAdHocPayment,
  loadConsultantAdHocPayments,
  saveConsultantAdHocPayment,
} from "./actions";

const CONSULTANT_ID = "seed-consultant-1";

import type { AdHocPaymentInput } from "@/lib/consultants/schemas";

const baseInput: AdHocPaymentInput = {
  id: undefined,
  consultantId: CONSULTANT_ID,
  projectId: "seed-project-1",
  allocationId: undefined,
  amount: 1500,
  payAt: "2026-07-15",
  reason: "Bonus de entrega",
  kind: "BONUS",
  status: "PLANNED",
};

beforeEach(() => {
  vi.stubEnv("DATABASE_URL", "postgresql://u:p@localhost:5432/db");
  h.store.seq = 0;
  h.store.adHoc = [];
  h.store.audits = [];
  h.store.currentUser = {
    id: "dev-user",
    name: "Ana",
    email: "ana@jumplabel.com.br",
    roles: ["FINANCE"],
  };
  h.store.grantedCodes = new Set<string>();
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("saveConsultantAdHocPayment", () => {
  it("creates a payment linked to a project and audits it", async () => {
    const result = await saveConsultantAdHocPayment(baseInput);
    expect(result.ok).toBe(true);
    expect(h.store.adHoc).toHaveLength(1);
    expect(h.store.adHoc[0]).toMatchObject({
      projectId: "seed-project-1",
      amount: 1500,
      kind: "BONUS",
      status: "PLANNED",
      createdByUserId: "user-1",
    });
    // payAt persisted as date-only UTC midnight.
    expect(h.store.adHoc[0].payAt.toISOString()).toBe(
      "2026-07-15T00:00:00.000Z",
    );
    expect(
      h.store.audits.filter(
        (a) => a.action === "CONSULTANT_ADHOC_PAYMENT_CREATED",
      ),
    ).toHaveLength(1);
  });

  it("rejects a payment without a project (project is mandatory)", async () => {
    const result = await saveConsultantAdHocPayment({
      ...baseInput,
      projectId: "",
    });
    expect(result).toMatchObject({ ok: false, error: "INVALID_INPUT" });
    expect(h.store.adHoc).toHaveLength(0);
  });

  it("rejects a non-positive amount", async () => {
    const result = await saveConsultantAdHocPayment({ ...baseInput, amount: 0 });
    expect(result).toMatchObject({ ok: false, error: "INVALID_INPUT" });
    expect(h.store.adHoc).toHaveLength(0);
  });

  it("updates an existing payment and audits the update", async () => {
    const created = await saveConsultantAdHocPayment(baseInput);
    expect(created.ok).toBe(true);
    const id = h.store.adHoc[0].id;
    const result = await saveConsultantAdHocPayment({
      ...baseInput,
      id,
      amount: 2000,
      status: "PAID",
    });
    expect(result.ok).toBe(true);
    expect(h.store.adHoc).toHaveLength(1);
    expect(h.store.adHoc[0]).toMatchObject({ amount: 2000, status: "PAID" });
    expect(
      h.store.audits.filter(
        (a) => a.action === "CONSULTANT_ADHOC_PAYMENT_UPDATED",
      ),
    ).toHaveLength(1);
  });
});

describe("loadConsultantAdHocPayments", () => {
  it("returns the consultant payments and the project options", async () => {
    await saveConsultantAdHocPayment(baseInput);
    const result = await loadConsultantAdHocPayments(CONSULTANT_ID);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.payments).toHaveLength(1);
    expect(result.data.payments[0]).toMatchObject({
      projectName: "Alpha",
      amount: 1500,
      payAt: "2026-07-15",
    });
    expect(result.data.projects).toEqual([
      { id: "seed-project-1", name: "Alpha", clientName: "Acme" },
      { id: "seed-project-2", name: "Beta", clientName: "Globex" },
    ]);
  });
});

describe("deleteConsultantAdHocPayment", () => {
  it("deletes an existing payment and audits it", async () => {
    await saveConsultantAdHocPayment(baseInput);
    const id = h.store.adHoc[0].id;
    const result = await deleteConsultantAdHocPayment({ id });
    expect(result.ok).toBe(true);
    expect(h.store.adHoc).toHaveLength(0);
    expect(
      h.store.audits.filter(
        (a) => a.action === "CONSULTANT_ADHOC_PAYMENT_DELETED",
      ),
    ).toHaveLength(1);
  });

  it("returns NOT_FOUND for an unknown id", async () => {
    const result = await deleteConsultantAdHocPayment({ id: "seed-missing-1" });
    expect(result).toMatchObject({ ok: false, error: "NOT_FOUND" });
  });
});

describe("financial RBAC (server-side)", () => {
  it("denies a non-financial role on save (access-denied redirect)", async () => {
    h.store.currentUser.roles = ["CONSULTANT"];
    await expect(saveConsultantAdHocPayment(baseInput)).rejects.toMatchObject({
      digest: expect.stringContaining("/access-denied"),
    });
    expect(h.store.adHoc).toHaveLength(0);
  });

  it("denies a non-financial role on load", async () => {
    h.store.currentUser.roles = ["PEOPLE"];
    await expect(
      loadConsultantAdHocPayments(CONSULTANT_ID),
    ).rejects.toMatchObject({
      digest: expect.stringContaining("/access-denied"),
    });
  });

  it("allows a non-financial role granted CONSULTORES_REMUNERACAO via the matrix", async () => {
    // People/DP with the matrix grant manages remuneração without FINANCIAL_ROLES.
    h.store.currentUser.roles = ["PEOPLE"];
    h.store.grantedCodes.add("CONSULTORES_REMUNERACAO");
    const saved = await saveConsultantAdHocPayment(baseInput);
    expect(saved.ok).toBe(true);
    expect(h.store.adHoc).toHaveLength(1);
    const loaded = await loadConsultantAdHocPayments(CONSULTANT_ID);
    expect(loaded.ok).toBe(true);
  });

  it("fails closed with NO_DATABASE when no database is configured", async () => {
    vi.stubEnv("DATABASE_URL", "");
    const result = await saveConsultantAdHocPayment(baseInput);
    expect(result).toMatchObject({ ok: false, error: "NO_DATABASE" });
  });
});
