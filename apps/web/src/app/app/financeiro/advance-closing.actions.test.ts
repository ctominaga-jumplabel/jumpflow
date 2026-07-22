import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * advanceRevenueClosing server-action tests (Onda B / D4): a JUSTIFICATION is
 * mandatory on the "liberar faturamento" transition (CLOSE: READY_TO_CLOSE ->
 * CLOSED) and is persisted both in RevenueClosing.notes (appended, never
 * discarding existing engine notes) and in the AuditEvent. Other transitions
 * (e.g. MARK_READY) do NOT require it. Dependencies are mocked at module
 * boundaries; the transition map stays real (importOriginal).
 */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Any = any;

const h = vi.hoisted(() => {
  const store = {
    closing: null as Any,
    fiscalDocument: null as Any,
    updates: [] as Array<{ where: Any; data: Any }>,
    audits: [] as Array<Record<string, unknown>>,
    currentUser: { id: "dev-user", roles: ["FINANCE"] as string[] },
    releaseCalls: [] as string[],
  };

  const prismaMock: Any = {
    revenueClosing: {
      findUnique: async () => (store.closing ? { ...store.closing } : null),
      updateMany: async ({ where, data }: { where: Any; data: Any }) => {
        store.updates.push({ where, data });
        if (
          where.status &&
          store.closing &&
          where.status !== store.closing.status
        ) {
          return { count: 0 };
        }
        if (store.closing) Object.assign(store.closing, data);
        return { count: 1 };
      },
    },
    fiscalDocument: {
      findFirst: async () => store.fiscalDocument,
    },
    auditEvent: {
      create: async ({ data }: { data: Any }) => {
        store.audits.push(data);
        return { ...data };
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

vi.mock("@/lib/auth/guards", () => ({
  requireUser: vi.fn(async () => h.store.currentUser),
  requireRole: vi.fn(async (roles: string | string[]) => {
    const required = Array.isArray(roles) ? roles : [roles];
    const allowed =
      required.length === 0 ||
      required.some((role) => h.store.currentUser.roles.includes(role));
    if (!allowed) {
      const err = new Error("NEXT_REDIRECT");
      Object.assign(err, { digest: "NEXT_REDIRECT;replace;/access-denied;307;" });
      throw err;
    }
    return h.store.currentUser;
  }),
}));

vi.mock("@/lib/db/users", () => ({
  resolveDbUser: vi.fn(async () => ({ id: "user-1" })),
}));

vi.mock("@/lib/automation/notifications/events", () => ({
  notifyHoursReleased: vi.fn(async (closingId: string) => {
    h.store.releaseCalls.push(closingId);
  }),
  notifyClientBillingSummary: vi.fn(async () => {}),
}));

import { advanceRevenueClosing } from "./actions";

function closingFixture(over: Partial<Any> = {}): Any {
  return {
    id: "rc-1",
    status: "READY_TO_CLOSE",
    totalAmount: 2000,
    notes: null,
    ...over,
  };
}

beforeEach(() => {
  vi.stubEnv("DATABASE_URL", "postgresql://u:p@localhost:5432/db");
  h.store.closing = closingFixture();
  h.store.fiscalDocument = null;
  h.store.updates = [];
  h.store.audits = [];
  h.store.currentUser = { id: "dev-user", roles: ["FINANCE"] };
  h.store.releaseCalls = [];
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("advanceRevenueClosing — CLOSE requires a justification", () => {
  it("rejects CLOSE without a justification (no update, no notify)", async () => {
    const result = await advanceRevenueClosing({ id: "rc-1", action: "CLOSE" });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toBe("INVALID_INPUT");
      expect(result.message).toMatch(/justificativa/i);
    }
    expect(h.store.updates).toHaveLength(0);
    expect(h.store.audits).toHaveLength(0);
    expect(h.store.releaseCalls).toHaveLength(0);
  });

  it("rejects CLOSE with a whitespace-only justification", async () => {
    const result = await advanceRevenueClosing({
      id: "rc-1",
      action: "CLOSE",
      justification: "   ",
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toBe("INVALID_INPUT");
    expect(h.store.updates).toHaveLength(0);
  });

  it("closes with a justification: appends to notes, audits it, notifies", async () => {
    const result = await advanceRevenueClosing({
      id: "rc-1",
      action: "CLOSE",
      justification: "Horas conferidas e aprovadas.",
    });
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.data.status).toBe("CLOSED");

    // notes: appended line carries the label + the justification text.
    expect(h.store.updates).toHaveLength(1);
    const notes = h.store.updates[0]!.data.notes as string;
    expect(notes).toContain("Liberacao faturamento");
    expect(notes).toContain("Horas conferidas e aprovadas.");

    // audit after includes the justification alongside the status.
    expect(h.store.audits).toHaveLength(1);
    const after = h.store.audits[0]!.after as Record<string, unknown>;
    expect(after.status).toBe("CLOSED");
    expect(after.justification).toBe("Horas conferidas e aprovadas.");

    // liberação notifies Finance/People exactly once.
    expect(h.store.releaseCalls).toEqual(["rc-1"]);
  });

  it("preserves existing engine notes when appending the justification", async () => {
    h.store.closing = closingFixture({ notes: "Faturamento fixo mensal." });
    const result = await advanceRevenueClosing({
      id: "rc-1",
      action: "CLOSE",
      justification: "Valores conferem com o contrato.",
    });
    expect(result.ok).toBe(true);
    const notes = h.store.updates[0]!.data.notes as string;
    expect(notes).toContain("Faturamento fixo mensal.");
    expect(notes).toContain("Valores conferem com o contrato.");
    // the original note comes first (not discarded).
    expect(notes.indexOf("Faturamento fixo mensal.")).toBeLessThan(
      notes.indexOf("Valores conferem"),
    );
  });
});

describe("advanceRevenueClosing — other transitions unaffected", () => {
  it("MARK_READY needs no justification and records no justification in audit", async () => {
    h.store.closing = closingFixture({ status: "IN_REVIEW" });
    const result = await advanceRevenueClosing({
      id: "rc-1",
      action: "MARK_READY",
    });
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.data.status).toBe("READY_TO_CLOSE");
    expect(h.store.audits).toHaveLength(1);
    const after = h.store.audits[0]!.after as Record<string, unknown>;
    expect(after.justification).toBeUndefined();
    // MARK_READY does not append notes and does not notify liberação.
    expect(h.store.updates[0]!.data.notes).toBeUndefined();
    expect(h.store.releaseCalls).toHaveLength(0);
  });

  it("denies non-financial roles (RBAC redirect)", async () => {
    h.store.currentUser = { id: "dev-user", roles: ["CONSULTANT"] };
    await expect(
      advanceRevenueClosing({
        id: "rc-1",
        action: "CLOSE",
        justification: "x",
      }),
    ).rejects.toThrow(/NEXT_REDIRECT/);
  });
});

// P16 (Onda 4): as transições REVERSAS ("voltar status" / "reabrir") também são
// mudanças sensíveis do fechamento e exigem justificativa (persistida em notes +
// AuditEvent). As transições de avanço (revisar/pronto/faturar) seguem sem exigir.
describe("advanceRevenueClosing — P16: reversas exigem justificativa", () => {
  it("REVERT_TO_OPEN sem justificativa → recusa (sem update/audit)", async () => {
    h.store.closing = closingFixture({ status: "IN_REVIEW" });
    const result = await advanceRevenueClosing({
      id: "rc-1",
      action: "REVERT_TO_OPEN",
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toBe("INVALID_INPUT");
      expect(result.message).toMatch(/justificativa/i);
    }
    expect(h.store.updates).toHaveLength(0);
    expect(h.store.audits).toHaveLength(0);
  });

  it("REVERT_TO_REVIEW com justificativa → volta, anota e audita", async () => {
    h.store.closing = closingFixture({ status: "READY_TO_CLOSE" });
    const result = await advanceRevenueClosing({
      id: "rc-1",
      action: "REVERT_TO_REVIEW",
      justification: "Correção de horas antes do fechamento.",
    });
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.data.status).toBe("IN_REVIEW");
    const notes = h.store.updates[0]!.data.notes as string;
    expect(notes).toContain("Voltar status");
    expect(notes).toContain("Correção de horas antes do fechamento.");
    const after = h.store.audits[0]!.after as Record<string, unknown>;
    expect(after.justification).toBe("Correção de horas antes do fechamento.");
  });

  it("REOPEN sem justificativa → recusa", async () => {
    h.store.closing = closingFixture({ status: "CLOSED" });
    const result = await advanceRevenueClosing({ id: "rc-1", action: "REOPEN" });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toBe("INVALID_INPUT");
    expect(h.store.updates).toHaveLength(0);
  });

  it("REOPEN com justificativa → reabre (closedAt=null), anota e audita", async () => {
    h.store.closing = closingFixture({ status: "CLOSED" });
    const result = await advanceRevenueClosing({
      id: "rc-1",
      action: "REOPEN",
      justification: "Reabrindo para incluir lançamento tardio.",
    });
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.data.status).toBe("READY_TO_CLOSE");
    expect(h.store.updates[0]!.data.closedAt).toBeNull();
    const notes = h.store.updates[0]!.data.notes as string;
    expect(notes).toContain("Reabertura");
    expect(notes).toContain("Reabrindo para incluir lançamento tardio.");
  });
});
