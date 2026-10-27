import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Governança Fluxo de Horas — etapa DP/People nos pagamentos. Prisma mockado
 * na fronteira; a máquina de estados é real. Cobre: liberação só de OPEN (com
 * auditoria e UM aviso agregado ao Financeiro), reabertura bloqueada após NF
 * recebida, solicitação de NF só depois da liberação e o guard do fechamento
 * operacional.
 */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Any = any;

const h = vi.hoisted(() => {
  const store = {
    payments: [] as Any[],
    audits: [] as Any[],
    updates: [] as Array<{ where: Any; data: Any }>,
    inApp: [] as Any[],
    emits: [] as Any[],
    emailCalls: [] as Any[],
    findManyWhere: null as Any,
    // OperationClosing CLOSED por projeto (chave `${projectId}:${month}`).
    closedOps: new Set<string>(),
    opLocks: [] as Any[],
  };
  const matches = (row: Any, where: Any) => {
    if (where.id && typeof where.id === "string" && row.id !== where.id) return false;
    if (where.id?.in && !where.id.in.includes(row.id)) return false;
    if (where.status?.in && !where.status.in.includes(row.status)) return false;
    if (typeof where.status === "string" && row.status !== where.status) return false;
    if (where.invoiceReceivedAt === null && row.invoiceReceivedAt != null) return false;
    if (where.month && row.month !== where.month) return false;
    if (where.contractType?.in && !where.contractType.in.includes(row.contractType))
      return false;
    return true;
  };
  const prismaMock: Any = {
    consultantPayment: {
      findMany: async ({ where }: { where: Any }) => {
        store.findManyWhere = where;
        return store.payments.filter((p) => matches(p, where)).map((p) => ({ ...p }));
      },
      findUnique: async ({ where }: { where: Any }) => {
        const row = store.payments.find((p) => p.id === where.id);
        return row ? { ...row } : null;
      },
      updateMany: async ({ where, data }: { where: Any; data: Any }) => {
        store.updates.push({ where, data });
        const row = store.payments.find((p) => matches(p, where));
        if (!row) return { count: 0 };
        Object.assign(row, data);
        return { count: 1 };
      },
    },
    auditEvent: {
      create: async ({ data }: { data: Any }) => {
        store.audits.push(data);
        return data;
      },
    },
    operationClosing: {
      updateMany: async ({ where }: { where: Any }) => {
        store.opLocks.push(where);
        const count = (where.projectId.in as string[]).filter((id) =>
          store.closedOps.has(`${id}:${where.month}`),
        ).length;
        return { count };
      },
      findMany: async ({ where }: { where: Any }) =>
        (where.projectId.in as string[])
          .filter((id) => store.closedOps.has(`${id}:${where.month}`))
          .map((projectId) => ({ projectId })),
    },
    user: { findMany: async () => [{ id: "people-1" }] },
    project: {
      findUnique: async () => ({ name: "Alpha", client: { name: "Cliente A" } }),
    },
    $transaction: async (fn: (tx: Any) => Promise<unknown>) => fn(prismaMock),
  };
  return { store, prismaMock };
});

vi.mock("@jumpflow/database", () => ({
  prisma: h.prismaMock,
  Prisma: { JsonNull: "__JsonNull__" },
}));
vi.mock("@/lib/automation/notifications/emit", () => ({
  emitNotification: vi.fn(async (input: Any) => {
    h.store.emits.push(input);
    return { sent: 1, skipped: 0, failed: 0 };
  }),
}));
vi.mock("@/lib/db/notifications", () => ({
  createInAppNotifications: vi.fn(async (rows: Any[]) => {
    h.store.inApp.push(...rows);
    return rows.length;
  }),
}));
vi.mock("@/lib/db/payments", () => ({
  sendConsultantInvoiceRequest: vi.fn(async (input: Any) => {
    h.store.emailCalls.push(input);
    return { status: "SENT" };
  }),
}));

import {
  findReleasedPaymentsForProjectMonth,
  releasePaymentsByPeople,
  reopenPeopleRelease,
  requestConsultantInvoices,
  requestInvoiceForPayment,
} from "./payment-release";

function payment(over: Partial<Any> = {}): Any {
  return {
    id: "pay-1",
    status: "OPEN",
    month: 9,
    year: 2026,
    contractType: "PJ",
    invoiceReceivedAt: null,
    peopleReleasedAt: null,
    peopleReleasedByUserId: null,
    invoiceRequestSentAt: null,
    consultant: { name: "Ana" },
    lines: [{ projectId: "proj-1", project: { name: "Alpha" } }],
    _count: { invoiceAttachments: 0 },
    ...over,
  };
}

beforeEach(() => {
  vi.stubEnv("DATABASE_URL", "postgresql://u:p@localhost:5432/db");
  h.store.payments = [];
  h.store.audits = [];
  h.store.updates = [];
  h.store.inApp = [];
  h.store.emits = [];
  h.store.emailCalls = [];
  h.store.closedOps = new Set(["proj-1:9"]);
  h.store.opLocks = [];
});
afterEach(() => vi.unstubAllEnvs());

describe("releasePaymentsByPeople", () => {
  it("releases only OPEN payments, stamps who/when, audits each, one aggregated notification", async () => {
    h.store.payments = [
      payment({ id: "a" }),
      payment({ id: "b", consultant: { name: "Bruno" } }),
      payment({ id: "c", status: "WAITING_FOR_INVOICE" }),
    ];
    const result = await releasePaymentsByPeople({
      month: 9,
      year: 2026,
      actorUserId: "dp-user",
      actorName: "Dora DP",
    });
    expect(result).toMatchObject({ released: 2, skipped: 1, notFound: 0 });
    expect(h.store.payments.find((p) => p.id === "a")).toMatchObject({
      status: "PEOPLE_RELEASED",
      peopleReleasedByUserId: "dp-user",
    });
    expect(h.store.payments.find((p) => p.id === "a").peopleReleasedAt).toBeInstanceOf(Date);
    expect(h.store.payments.find((p) => p.id === "c").status).toBe("WAITING_FOR_INVOICE");
    expect(h.store.audits.map((a) => a.action)).toEqual([
      "CONSULTANT_PAYMENT_PEOPLE_RELEASED",
      "CONSULTANT_PAYMENT_PEOPLE_RELEASED",
    ]);
    // UM único emit agregado ao Financeiro (não um por pagamento).
    expect(h.store.emits).toHaveLength(1);
    expect(h.store.emits[0].event).toBe("PAYMENT_RELEASED_BY_PEOPLE");
    // Bulk por mês restringe a PJ/CLT_FLEX (o que está na tela).
    expect(h.store.findManyWhere.contractType).toEqual({ in: ["PJ", "CLT_FLEX"] });
  });

  it("does not notify when nothing was released", async () => {
    h.store.payments = [payment({ status: "PEOPLE_RELEASED" })];
    const result = await releasePaymentsByPeople({
      paymentIds: ["pay-1", "missing"],
      actorUserId: "dp-user",
    });
    expect(result).toMatchObject({ released: 0, skipped: 1, notFound: 1 });
    expect(h.store.emits).toHaveLength(0);
    expect(h.store.audits).toHaveLength(0);
  });
});

describe("releasePaymentsByPeople — fechamento operacional + NF já anexada", () => {
  it("skips (bulk) payments whose project month is not operationally CLOSED and reports them", async () => {
    h.store.payments = [
      payment({ id: "a" }),
      payment({
        id: "b",
        lines: [
          { projectId: "proj-1", project: { name: "Alpha" } },
          { projectId: "proj-2", project: { name: "Beta" } },
        ],
      }),
    ];
    const result = await releasePaymentsByPeople({
      month: 9,
      year: 2026,
      actorUserId: "dp",
    });
    expect(result).toMatchObject({
      released: 1,
      waitingOperationClosing: 1,
      waitingProjects: ["Beta"],
      releasedIds: ["a"],
    });
    expect(h.store.payments.find((p) => p.id === "b").status).toBe("OPEN");
    // A trava é feita na própria transação (updateMany em CLOSED).
    expect(h.store.opLocks[0]).toMatchObject({ status: "CLOSED", month: 9, year: 2026 });
    expect(h.store.audits).toHaveLength(1);
  });

  it("releases nothing for a single payment still waiting for the operation", async () => {
    h.store.closedOps = new Set();
    h.store.payments = [payment()];
    const result = await releasePaymentsByPeople({ paymentIds: ["pay-1"], actorUserId: "dp" });
    expect(result).toMatchObject({ released: 0, waitingOperationClosing: 1, waitingProjects: ["Alpha"] });
    expect(h.store.updates).toHaveLength(0);
    expect(h.store.emits).toHaveLength(0);
  });

  it("goes straight to INVOICE_RECEIVED when an NF was attached while OPEN", async () => {
    h.store.payments = [payment({ _count: { invoiceAttachments: 1 } })];
    const result = await releasePaymentsByPeople({ paymentIds: ["pay-1"], actorUserId: "dp" });
    expect(result).toMatchObject({ released: 1, invoiceAlreadyReceived: 1 });
    expect(h.store.payments[0].status).toBe("INVOICE_RECEIVED");
    expect(h.store.payments[0].invoiceReceivedAt).toBeInstanceOf(Date);
    expect(h.store.payments[0].peopleReleasedByUserId).toBe("dp");
    expect(h.store.audits[0].after).toMatchObject({
      status: "INVOICE_RECEIVED",
      invoiceAlreadyAttached: true,
    });
  });
});

describe("reopenPeopleRelease", () => {
  it("returns a released payment to OPEN, clears release fields, audits the justification, notifies DP in-app", async () => {
    h.store.payments = [
      payment({
        status: "WAITING_FOR_INVOICE",
        peopleReleasedAt: new Date("2026-10-01"),
        peopleReleasedByUserId: "dp-user",
        invoiceRequestSentAt: new Date("2026-10-02"),
      }),
    ];
    const result = await reopenPeopleRelease({
      paymentId: "pay-1",
      justification: "Horas corrigidas",
      actorUserId: "fin-user",
      actorName: "Fábio",
    });
    expect(result).toEqual({ id: "pay-1", status: "OPEN" });
    expect(h.store.payments[0]).toMatchObject({
      status: "OPEN",
      peopleReleasedAt: null,
      peopleReleasedByUserId: null,
      invoiceRequestSentAt: null,
    });
    expect(h.store.audits[0]).toMatchObject({
      action: "CONSULTANT_PAYMENT_RELEASE_REOPENED",
      before: expect.objectContaining({ status: "WAITING_FOR_INVOICE" }),
      after: { status: "OPEN", justification: "Horas corrigidas" },
    });
    const recipients = h.store.inApp.map((n) => n.userId).sort();
    expect(recipients).toEqual(["dp-user", "people-1"]);
  });

  it("refuses once the NF was received (no update, no audit)", async () => {
    h.store.payments = [
      payment({ status: "WAITING_FOR_INVOICE", invoiceReceivedAt: new Date() }),
    ];
    await expect(
      reopenPeopleRelease({
        paymentId: "pay-1",
        justification: "x y z",
        actorUserId: "fin-user",
      }),
    ).rejects.toMatchObject({ code: "INVALID_STATE" });
    expect(h.store.updates).toHaveLength(0);
    expect(h.store.audits).toHaveLength(0);
  });

  it("refuses an OPEN payment", async () => {
    h.store.payments = [payment()];
    await expect(
      reopenPeopleRelease({ paymentId: "pay-1", justification: "abc", actorUserId: null }),
    ).rejects.toMatchObject({ code: "INVALID_STATE" });
  });
});

describe("requestInvoiceForPayment / requestConsultantInvoices", () => {
  it("does nothing before the DP release", async () => {
    h.store.payments = [payment()];
    const result = await requestInvoiceForPayment({ paymentId: "pay-1", actorUserId: "fin" });
    expect(result).toEqual({ status: "NOT_RELEASED", transitioned: false });
    expect(h.store.updates).toHaveLength(0);
    expect(h.store.emailCalls).toHaveLength(0);
  });

  it("moves PEOPLE_RELEASED to WAITING_FOR_INVOICE and sends the PJ email (forced new cycle)", async () => {
    h.store.payments = [payment({ status: "PEOPLE_RELEASED" })];
    const result = await requestInvoiceForPayment({ paymentId: "pay-1", actorUserId: "fin" });
    expect(result).toEqual({ status: "SENT", transitioned: true });
    expect(h.store.payments[0].status).toBe("WAITING_FOR_INVOICE");
    expect(h.store.payments[0].invoiceRequestSentAt).toBeInstanceOf(Date);
    expect(h.store.audits[0].action).toBe("CONSULTANT_PAYMENT_INVOICE_REQUESTED");
    expect(h.store.emailCalls[0]).toMatchObject({ paymentId: "pay-1", force: true });
  });

  it("with an NF already attached: INVOICE_RECEIVED, no request email", async () => {
    h.store.payments = [
      payment({ status: "PEOPLE_RELEASED", _count: { invoiceAttachments: 2 } }),
    ];
    const result = await requestInvoiceForPayment({ paymentId: "pay-1", actorUserId: "fin" });
    expect(result).toEqual({ status: "INVOICE_ALREADY_RECEIVED", transitioned: true });
    expect(h.store.payments[0].status).toBe("INVOICE_RECEIVED");
    expect(h.store.payments[0].invoiceReceivedAt).toBeInstanceOf(Date);
    expect(h.store.emailCalls).toHaveLength(0);
    expect(h.store.audits[0].action).toBe("CONSULTANT_PAYMENT_INVOICE_RECEIVED");
  });

  it("CLT_FLEX advances without the email", async () => {
    h.store.payments = [payment({ status: "PEOPLE_RELEASED", contractType: "CLT_FLEX" })];
    const result = await requestInvoiceForPayment({ paymentId: "pay-1", actorUserId: "fin" });
    expect(result).toEqual({ status: "REQUESTED_NO_EMAIL", transitioned: true });
    expect(h.store.emailCalls).toHaveLength(0);
  });

  it("bulk only processes PEOPLE_RELEASED and reports the skipped counts", async () => {
    h.store.payments = [
      payment({ id: "a", status: "PEOPLE_RELEASED" }),
      payment({ id: "b", status: "OPEN" }),
      payment({ id: "c", status: "OPEN" }),
      payment({ id: "d", status: "INVOICE_RECEIVED" }),
    ];
    const result = await requestConsultantInvoices({
      month: 9,
      year: 2026,
      actorUserId: "fin",
    });
    expect(result).toEqual({
      eligible: 1,
      sent: 1,
      skipped: 0,
      notReleased: 2,
      alreadyRequested: 1,
      invoiceAlreadyReceived: 0,
    });
    expect(h.store.payments.find((p) => p.id === "b").status).toBe("OPEN");
  });
});

describe("findReleasedPaymentsForProjectMonth", () => {
  it("looks for released-or-beyond payments with a line on the project", async () => {
    h.store.payments = [payment({ status: "PEOPLE_RELEASED" })];
    const rows = await findReleasedPaymentsForProjectMonth({
      projectId: "proj-1",
      month: 9,
      year: 2026,
    });
    expect(rows).toEqual([{ id: "pay-1", consultantName: "Ana", status: "PEOPLE_RELEASED" }]);
    expect(h.store.findManyWhere.lines).toEqual({ some: { projectId: "proj-1" } });
    expect(h.store.findManyWhere.status.in).not.toContain("OPEN");
    expect(h.store.findManyWhere.status.in).not.toContain("CANCELLED");
  });
});
