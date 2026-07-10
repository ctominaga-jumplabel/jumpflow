import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Server-action tests for the client receivable schedule (Recebimentos
 * previstos — lado receita).
 *
 * Covers RBAC (only commercial/financial roles may write), dedupe (identical
 * date + amount + label is rejected), NOT_FOUND paths, and that every mutation
 * records an AuditEvent (financial data).
 */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Where = Record<string, any>;

const h = vi.hoisted(() => {
  const store = {
    projects: [{ id: "prj-1" }] as { id: string }[],
    receivables: [] as {
      id: string;
      projectId: string;
      dueAt: Date;
      amount: number;
      label: string;
      status: string;
      note: string | null;
    }[],
    seq: 0,
    audits: [] as Record<string, unknown>[],
    users: [{ id: "user-1", name: "Sam", email: "sam@jumplabel.com.br" }],
    currentUser: {
      id: "dev-user",
      name: "Sam",
      email: "sam@jumplabel.com.br",
      roles: ["FINANCE"] as string[],
    },
  };

  const prismaMock = {
    user: {
      findUnique: async ({ where }: { where: Where }) =>
        store.users.find((u) => u.id === where.id || u.email === where.email) ??
        null,
    },
    project: {
      findUnique: async ({ where }: { where: Where }) =>
        store.projects.find((p) => p.id === where.id) ?? null,
    },
    projectReceivableSchedule: {
      findMany: async ({ where }: { where: Where }) =>
        store.receivables.filter(
          (r) =>
            (where.projectId === undefined || r.projectId === where.projectId) &&
            (where.label === undefined || r.label === where.label) &&
            (where.dueAt === undefined ||
              r.dueAt.getTime() === (where.dueAt as Date).getTime()),
        ),
      findUnique: async ({ where }: { where: Where }) =>
        store.receivables.find((r) => r.id === where.id) ?? null,
      create: async ({ data }: { data: Where }) => {
        store.seq += 1;
        const row = { id: `rcv-${store.seq}`, ...data } as (typeof store.receivables)[number];
        store.receivables.push(row);
        return { id: row.id };
      },
      update: async ({ where, data }: { where: Where; data: Where }) => {
        const row = store.receivables.find((r) => r.id === where.id)!;
        Object.assign(row, data);
        return { ...row };
      },
      delete: async ({ where }: { where: Where }) => {
        store.receivables = store.receivables.filter((r) => r.id !== where.id);
        return { id: where.id };
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
  Prisma: {
    JsonNull: "__JsonNull__",
    PrismaClientKnownRequestError: class extends Error {},
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
}));

import {
  createReceivable,
  deleteReceivable,
  updateReceivable,
} from "./actions";

beforeEach(() => {
  vi.stubEnv("DATABASE_URL", "postgresql://u:p@localhost:5432/db");
  vi.stubEnv("AUTH_DEV_MODE", "true");
  h.store.projects = [{ id: "prj-1" }];
  h.store.receivables = [];
  h.store.seq = 0;
  h.store.audits = [];
  h.store.currentUser = {
    id: "dev-user",
    name: "Sam",
    email: "sam@jumplabel.com.br",
    roles: ["FINANCE"],
  };
});

afterEach(() => vi.unstubAllEnvs());

describe("createReceivable", () => {
  it("creates a forecast parcel and audits it", async () => {
    const result = await createReceivable({
      projectId: "prj-1",
      dueAt: "2026-08-10",
      amount: 12000,
      label: "Entrada 40%",
      status: "FORECAST",
    });
    expect(result.ok).toBe(true);
    expect(h.store.receivables).toHaveLength(1);
    expect(h.store.receivables[0]).toMatchObject({
      projectId: "prj-1",
      amount: 12000,
      label: "Entrada 40%",
      status: "FORECAST",
    });
    expect(h.store.audits[0]).toMatchObject({
      entityType: "ProjectReceivableSchedule",
      action: "PROJECT_RECEIVABLE_CREATED",
    });
  });

  it("rejects an identical parcel (same date + amount + label)", async () => {
    const input = {
      projectId: "prj-1",
      dueAt: "2026-08-10",
      amount: 12000,
      label: "Entrada 40%",
      status: "FORECAST" as const,
    };
    await createReceivable(input);
    const dup = await createReceivable(input);
    expect(dup.ok).toBe(false);
    if (!dup.ok) expect(dup.error).toBe("INVALID_INPUT");
    expect(h.store.receivables).toHaveLength(1);
  });

  it("allows the same label/date with a different amount", async () => {
    await createReceivable({
      projectId: "prj-1",
      dueAt: "2026-08-10",
      amount: 12000,
      label: "Parcela",
      status: "FORECAST",
    });
    const other = await createReceivable({
      projectId: "prj-1",
      dueAt: "2026-08-10",
      amount: 8000,
      label: "Parcela",
      status: "FORECAST",
    });
    expect(other.ok).toBe(true);
    expect(h.store.receivables).toHaveLength(2);
  });

  it("returns NOT_FOUND for an unknown project", async () => {
    const result = await createReceivable({
      projectId: "missing",
      dueAt: "2026-08-10",
      amount: 100,
      label: "X",
      status: "FORECAST",
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toBe("NOT_FOUND");
  });

  it("rejects a non-positive amount", async () => {
    const result = await createReceivable({
      projectId: "prj-1",
      dueAt: "2026-08-10",
      amount: 0,
      label: "X",
      status: "FORECAST",
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toBe("INVALID_INPUT");
  });

  it("rejects a malformed dueAt (not YYYY-MM-DD) with INVALID_INPUT", async () => {
    const result = await createReceivable({
      projectId: "prj-1",
      dueAt: "2026/08/10",
      amount: 100,
      label: "X",
      status: "FORECAST",
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toBe("INVALID_INPUT");
    expect(h.store.receivables).toHaveLength(0);
  });

  it("rejects an impossible calendar date (2026-02-31) with INVALID_INPUT", async () => {
    const result = await createReceivable({
      projectId: "prj-1",
      dueAt: "2026-02-31",
      amount: 100,
      label: "X",
      status: "FORECAST",
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toBe("INVALID_INPUT");
    expect(h.store.receivables).toHaveLength(0);
  });

  it("denies users without a commercial/financial role", async () => {
    h.store.currentUser.roles = ["CONSULTANT"];
    await expect(
      createReceivable({
        projectId: "prj-1",
        dueAt: "2026-08-10",
        amount: 100,
        label: "X",
        status: "FORECAST",
      }),
    ).rejects.toThrow(/NEXT_REDIRECT/);
    expect(h.store.receivables).toHaveLength(0);
  });

  it("allows a SALES (commercial) role", async () => {
    h.store.currentUser.roles = ["SALES"];
    const result = await createReceivable({
      projectId: "prj-1",
      dueAt: "2026-08-10",
      amount: 100,
      label: "X",
      status: "FORECAST",
    });
    expect(result.ok).toBe(true);
  });
});

describe("updateReceivable", () => {
  it("updates a parcel and audits it", async () => {
    await createReceivable({
      projectId: "prj-1",
      dueAt: "2026-08-10",
      amount: 100,
      label: "X",
      status: "FORECAST",
    });
    const id = h.store.receivables[0].id;
    const result = await updateReceivable({
      id,
      projectId: "prj-1",
      dueAt: "2026-08-10",
      amount: 100,
      label: "X",
      status: "RECEIVED",
    });
    expect(result.ok).toBe(true);
    expect(h.store.receivables[0].status).toBe("RECEIVED");
    expect(h.store.audits.at(-1)).toMatchObject({
      action: "PROJECT_RECEIVABLE_UPDATED",
    });
  });

  it("does not flag itself as a duplicate on update", async () => {
    await createReceivable({
      projectId: "prj-1",
      dueAt: "2026-08-10",
      amount: 100,
      label: "X",
      status: "FORECAST",
    });
    const id = h.store.receivables[0].id;
    const result = await updateReceivable({
      id,
      projectId: "prj-1",
      dueAt: "2026-08-10",
      amount: 100,
      label: "X",
      status: "FORECAST",
      note: "com nota",
    });
    expect(result.ok).toBe(true);
  });

  it("ignores a forged projectId on update (never reparents the receivable)", async () => {
    h.store.projects = [{ id: "prj-1" }, { id: "prj-2" }];
    await createReceivable({
      projectId: "prj-1",
      dueAt: "2026-08-10",
      amount: 100,
      label: "X",
      status: "FORECAST",
    });
    const id = h.store.receivables[0].id;
    // Payload forjado tenta mover a parcela para prj-2.
    const result = await updateReceivable({
      id,
      projectId: "prj-2",
      dueAt: "2026-09-01",
      amount: 250,
      label: "Y",
      status: "RECEIVED",
    });
    expect(result.ok).toBe(true);
    // O projeto NUNCA muda; os demais campos sim.
    expect(h.store.receivables[0].projectId).toBe("prj-1");
    expect(h.store.receivables[0].amount).toBe(250);
    expect(h.store.receivables[0].label).toBe("Y");
    expect(h.store.receivables[0].status).toBe("RECEIVED");
    // A auditoria registra o projeto real (do registro), não o do payload.
    expect(h.store.audits.at(-1)).toMatchObject({
      action: "PROJECT_RECEIVABLE_UPDATED",
      after: { projectId: "prj-1" },
    });
  });

  it("rejects an invalid dueAt (bad format) with INVALID_INPUT", async () => {
    const result = await updateReceivable({
      id: "any",
      projectId: "prj-1",
      dueAt: "10/08/2026",
      amount: 100,
      label: "X",
      status: "FORECAST",
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toBe("INVALID_INPUT");
  });

  it("returns NOT_FOUND for an unknown parcel", async () => {
    const result = await updateReceivable({
      id: "missing",
      projectId: "prj-1",
      dueAt: "2026-08-10",
      amount: 100,
      label: "X",
      status: "FORECAST",
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toBe("NOT_FOUND");
  });
});

describe("deleteReceivable", () => {
  it("removes a parcel and audits it", async () => {
    await createReceivable({
      projectId: "prj-1",
      dueAt: "2026-08-10",
      amount: 100,
      label: "X",
      status: "FORECAST",
    });
    const id = h.store.receivables[0].id;
    const result = await deleteReceivable({ id });
    expect(result.ok).toBe(true);
    expect(h.store.receivables).toHaveLength(0);
    expect(h.store.audits.at(-1)).toMatchObject({
      action: "PROJECT_RECEIVABLE_DELETED",
    });
  });

  it("denies users without a commercial/financial role", async () => {
    await createReceivable({
      projectId: "prj-1",
      dueAt: "2026-08-10",
      amount: 100,
      label: "X",
      status: "FORECAST",
    });
    const id = h.store.receivables[0].id;
    h.store.currentUser.roles = ["CONSULTANT"];
    await expect(deleteReceivable({ id })).rejects.toThrow(/NEXT_REDIRECT/);
    expect(h.store.receivables).toHaveLength(1);
  });
});
