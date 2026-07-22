import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * reopenOperation server-action tests (P16): reabrir um fechamento operacional é
 * mudança sensível — exige justificativa OBRIGATÓRIA, persistida em notes +
 * AuditEvent. Sem justificativa a ação recusa (nenhum update). Dependências
 * mockadas nas fronteiras de módulo.
 */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Any = any;

const h = vi.hoisted(() => {
  const store = {
    closing: null as Any,
    updates: [] as Array<{ where: Any; data: Any }>,
    audits: [] as Array<Record<string, unknown>>,
    currentUser: { id: "dev-user", roles: ["ADMIN"] as string[] },
  };

  const prismaMock: Any = {
    operationClosing: {
      findUnique: async () => (store.closing ? { ...store.closing } : null),
      updateMany: async ({ where, data }: { where: Any; data: Any }) => {
        store.updates.push({ where, data });
        if (where.status && store.closing && where.status !== store.closing.status) {
          return { count: 0 };
        }
        if (store.closing) Object.assign(store.closing, data);
        return { count: 1 };
      },
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
  Prisma: { JsonNull: "__JsonNull__" },
}));

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

vi.mock("@/lib/auth/guards", () => ({
  requirePermission: vi.fn(async () => h.store.currentUser),
}));

vi.mock("@/lib/db/users", () => ({
  resolveDbUser: vi.fn(async () => ({ id: "user-1" })),
}));

vi.mock("@/lib/automation/notifications/events", () => ({
  notifyOperationClosed: vi.fn(async () => {}),
}));

import { reopenOperation } from "./actions";

const base = { projectId: "proj-1", month: 6, year: 2026 };

beforeEach(() => {
  vi.stubEnv("DATABASE_URL", "postgresql://u:p@localhost:5432/db");
  h.store.closing = { id: "oc-1", status: "CLOSED", notes: null };
  h.store.updates = [];
  h.store.audits = [];
  h.store.currentUser = { id: "dev-user", roles: ["ADMIN"] };
});

afterEach(() => vi.unstubAllEnvs());

describe("reopenOperation — P16 justificativa obrigatória", () => {
  it("recusa sem justificativa (nenhum update/audit)", async () => {
    const result = await reopenOperation(base);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toBe("INVALID_INPUT");
      expect(result.message).toMatch(/justificativa/i);
    }
    expect(h.store.updates).toHaveLength(0);
    expect(h.store.audits).toHaveLength(0);
  });

  it("recusa justificativa só de espaços", async () => {
    const result = await reopenOperation({ ...base, justification: "   " });
    expect(result).toMatchObject({ ok: false, error: "INVALID_INPUT" });
    expect(h.store.updates).toHaveLength(0);
  });

  it("reabre com justificativa: anota em notes e audita o motivo", async () => {
    const result = await reopenOperation({
      ...base,
      justification: "Correção tardia de horas do consultor.",
    });
    expect(result.ok).toBe(true);
    const data = h.store.updates[0]!.data as Any;
    expect(data.status).toBe("OPEN");
    expect(String(data.notes)).toContain("Reabertura");
    expect(String(data.notes)).toContain("Correção tardia de horas do consultor.");
    const after = h.store.audits[0]!.after as Record<string, unknown>;
    expect(after.status).toBe("OPEN");
    expect(after.justification).toBe("Correção tardia de horas do consultor.");
  });
});
