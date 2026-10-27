import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Governança Fluxo de Horas — só o Financeiro reabre uma liberação de
 * faturamento feita pelo Gerente de Área. Toda transição que SAI de CLOSED para
 * trás (REOPEN / "cancelar liberação") exige FATURAMENTO_REABRIR_LIBERACAO
 * edit; a liberação (CLOSE) continua do Gerente de Área. Justificativa +
 * auditoria seguem obrigatórias; o Gerente de Área é notificado.
 */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Any = any;

const h = vi.hoisted(() => {
  const store = {
    closing: null as Any,
    updates: [] as Array<{ where: Any; data: Any }>,
    audits: [] as Any[],
    reopenNotifies: [] as Any[],
    grants: {} as Record<string, boolean>,
    currentUser: { id: "u", name: "Fê Financeiro", email: "f@x", roles: ["FINANCE"] as string[] },
  };
  const prismaMock: Any = {
    revenueClosing: {
      findUnique: async () => (store.closing ? { ...store.closing } : null),
      findFirst: async () => (store.closing ? { ...store.closing } : null),
      updateMany: async ({ where, data }: { where: Any; data: Any }) => {
        store.updates.push({ where, data });
        if (where.status && store.closing && where.status !== store.closing.status) {
          return { count: 0 };
        }
        if (store.closing) Object.assign(store.closing, data);
        return { count: 1 };
      },
    },
    project: { findUnique: async () => ({ clientId: "client-1" }) },
    fiscalDocument: { findFirst: async () => null },
    auditEvent: {
      create: async ({ data }: { data: Any }) => {
        store.audits.push(data);
        return data;
      },
    },
    $transaction: async (fn: (tx: Any) => Promise<unknown>) => fn(prismaMock),
  };
  return { store, prismaMock };
});

vi.mock("@jumpflow/database", () => ({
  prisma: h.prismaMock,
  Prisma: {
    JsonNull: "__JsonNull__",
    PrismaClientKnownRequestError: class extends Error {
      code = "";
    },
  },
}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/auth/permissions", () => ({
  can: vi.fn(async (code: string) => h.store.grants[code] ?? false),
}));
vi.mock("@/lib/auth/guards", () => ({
  requireUser: vi.fn(async () => h.store.currentUser),
  requireRole: vi.fn(async (roles: string | string[]) => {
    const required = Array.isArray(roles) ? roles : [roles];
    if (!required.some((r) => h.store.currentUser.roles.includes(r))) {
      const err = new Error("NEXT_REDIRECT");
      Object.assign(err, { digest: "NEXT_REDIRECT;replace;/access-denied;307;" });
      throw err;
    }
    return h.store.currentUser;
  }),
}));
vi.mock("@/lib/db/users", () => ({
  resolveDbUser: vi.fn(async () => ({ id: "db-user" })),
}));
vi.mock("@/lib/automation/notifications/events", () => ({
  notifyHoursReleased: vi.fn(async () => {}),
  notifyClientBillingSummary: vi.fn(async () => {}),
  notifyRevenueClosingReopened: vi.fn(async (id: string, details: Any) => {
    h.store.reopenNotifies.push({ id, details });
  }),
}));

import { advanceRevenueClosing, cancelarLiberacao } from "./actions";
import { isBillingReleaseReversal } from "@/lib/db/revenue";

const REOPEN_CODE = "FATURAMENTO_REABRIR_LIBERACAO";

beforeEach(() => {
  vi.stubEnv("DATABASE_URL", "postgresql://u:p@localhost:5432/db");
  h.store.closing = { id: "rc-1", status: "CLOSED", totalAmount: 1000, notes: null };
  h.store.updates = [];
  h.store.audits = [];
  h.store.reopenNotifies = [];
  h.store.grants = {};
  h.store.currentUser = { id: "u", name: "Fê Financeiro", email: "f@x", roles: ["FINANCE"] };
});
afterEach(() => vi.unstubAllEnvs());

describe("isBillingReleaseReversal", () => {
  it("flags only the transitions leaving CLOSED backwards", () => {
    expect(isBillingReleaseReversal("REOPEN")).toBe(true);
    expect(isBillingReleaseReversal("CLOSE")).toBe(false);
    expect(isBillingReleaseReversal("MARK_INVOICED")).toBe(false);
    expect(isBillingReleaseReversal("MARK_INVOICED_MANUAL")).toBe(false);
    expect(isBillingReleaseReversal("REVERT_INVOICED")).toBe(false);
    expect(isBillingReleaseReversal("REVERT_TO_REVIEW")).toBe(false);
  });
});

describe("advanceRevenueClosing REOPEN — só Financeiro", () => {
  it("Area Manager (and ADMIN) without the grant get FORBIDDEN, nothing changes", async () => {
    for (const roles of [["AREA_MANAGER"], ["ADMIN"]]) {
      h.store.currentUser.roles = roles;
      const result = await advanceRevenueClosing({
        id: "rc-1",
        action: "REOPEN",
        justification: "Corrigir horas",
      });
      expect(result).toMatchObject({ ok: false, error: "FORBIDDEN" });
    }
    expect(h.store.updates).toHaveLength(0);
    expect(h.store.audits).toHaveLength(0);
    expect(h.store.reopenNotifies).toHaveLength(0);
  });

  it("Finance with the grant reopens, audits the justification and notifies the Area Manager", async () => {
    h.store.grants = { [REOPEN_CODE]: true };
    const result = await advanceRevenueClosing({
      id: "rc-1",
      action: "REOPEN",
      justification: "Corrigir horas",
    });
    expect(result).toEqual({ ok: true, data: { id: "rc-1", status: "READY_TO_CLOSE" } });
    expect(h.store.audits[0]).toMatchObject({
      action: "REVENUE_CLOSING_REOPENED",
      after: expect.objectContaining({ justification: "Corrigir horas" }),
    });
    expect(h.store.reopenNotifies).toEqual([
      {
        id: "rc-1",
        details: { justification: "Corrigir horas", reopenedByName: "Fê Financeiro" },
      },
    ]);
  });

  it("still requires the justification for Finance", async () => {
    h.store.grants = { [REOPEN_CODE]: true };
    const result = await advanceRevenueClosing({ id: "rc-1", action: "REOPEN" });
    expect(result).toMatchObject({ ok: false, error: "INVALID_INPUT" });
    expect(h.store.updates).toHaveLength(0);
  });

  it("does not gate the release itself: Area Manager still CLOSEs without the grant", async () => {
    h.store.currentUser.roles = ["AREA_MANAGER"];
    h.store.closing.status = "READY_TO_CLOSE";
    const result = await advanceRevenueClosing({
      id: "rc-1",
      action: "CLOSE",
      justification: "Horas conferidas",
    });
    expect(result).toEqual({ ok: true, data: { id: "rc-1", status: "CLOSED" } });
  });
});

describe("cancelarLiberacao — só Financeiro", () => {
  const input = {
    projectId: "proj-1",
    from: "2026-09-01",
    to: "2026-09-30",
    justificativa: "Horas a corrigir",
  };

  it("Area Manager without the grant gets FORBIDDEN before touching anything", async () => {
    h.store.currentUser.roles = ["AREA_MANAGER"];
    const result = await cancelarLiberacao(input);
    expect(result).toMatchObject({ ok: false, error: "FORBIDDEN" });
    expect(h.store.updates).toHaveLength(0);
    expect(h.store.audits).toHaveLength(0);
  });

  it("Finance with the grant cancels the release (audited) and notifies", async () => {
    h.store.grants = { [REOPEN_CODE]: true };
    const result = await cancelarLiberacao(input);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data.competences[0]).toMatchObject({ status: "REVERTED" });
    }
    expect(h.store.audits.map((a) => a.action)).toEqual([
      "REVENUE_CLOSING_REOPENED",
      "RECEIVABLES_RELEASE_CANCELLED",
    ]);
    expect(h.store.reopenNotifies).toHaveLength(1);
  });
});
