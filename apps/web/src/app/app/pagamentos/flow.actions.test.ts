import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Governança Fluxo de Horas — gates das server actions de Pagamentos:
 * - liberar (DP)            → PAGAMENTOS_LIBERACAO_DP edit
 * - enviar solicitação de NF → PAGAMENTOS_ENVIO_NF edit (só após a liberação)
 * - reabrir liberação       → PAGAMENTOS_REABRIR_LIBERACAO edit + justificativa
 * - avanço genérico recusa as etapas dedicadas e segue em FINANCIAL_ROLES.
 * A camada de dados (lib/db/payment-release) é mockada; o foco é o RBAC.
 */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Any = any;

const h = vi.hoisted(() => ({
  grants: {} as Record<string, boolean>,
  currentUser: { id: "u1", name: "Usuária", email: "u@x", roles: ["PEOPLE"] as string[] },
  calls: {
    release: [] as Any[],
    reopen: [] as Any[],
    request: [] as Any[],
    bulkRequest: [] as Any[],
  },
  requestOutcome: { status: "SENT", transitioned: true } as Any,
  releaseResult: null as Any,
}));

vi.mock("@jumpflow/database", () => ({
  prisma: {
    consultantPayment: { findUnique: vi.fn(async () => null) },
    $transaction: vi.fn(),
  },
  Prisma: { JsonNull: "__JsonNull__" },
}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/auth/permissions", () => ({
  can: vi.fn(async (code: string) => h.grants[code] ?? false),
}));
vi.mock("@/lib/auth/guards", () => ({
  requireUser: vi.fn(async () => h.currentUser),
  requireRole: vi.fn(async (roles: string | string[]) => {
    const required = Array.isArray(roles) ? roles : [roles];
    if (!required.some((r) => h.currentUser.roles.includes(r))) {
      const err = new Error("NEXT_REDIRECT");
      Object.assign(err, { digest: "NEXT_REDIRECT;replace;/access-denied;307;" });
      throw err;
    }
    return h.currentUser;
  }),
}));
vi.mock("@/lib/db/users", () => ({
  resolveDbUser: vi.fn(async () => ({ id: "db-u1" })),
}));
vi.mock("@/lib/db/payments", () => ({
  createPaymentForecast: vi.fn(),
  generateConsultantPayments: vi.fn(),
  sendConsultantPaymentForecast: vi.fn(),
}));
vi.mock("@/lib/db/payment-release", () => {
  class PaymentReleaseError extends Error {
    constructor(
      readonly code: string,
      message: string,
    ) {
      super(message);
    }
  }
  return {
    PaymentReleaseError,
    releasePaymentsByPeople: vi.fn(async (input: Any) => {
      h.calls.release.push(input);
      return (
        h.releaseResult ?? {
          released: 1,
          skipped: 0,
          notFound: 0,
          waitingOperationClosing: 0,
          waitingProjects: [],
          invoiceAlreadyReceived: 0,
          releasedIds: ["p1"],
        }
      );
    }),
    reopenPeopleRelease: vi.fn(async (input: Any) => {
      h.calls.reopen.push(input);
      return { id: input.paymentId, status: "OPEN" };
    }),
    requestInvoiceForPayment: vi.fn(async (input: Any) => {
      h.calls.request.push(input);
      return h.requestOutcome;
    }),
    requestConsultantInvoices: vi.fn(async (input: Any) => {
      h.calls.bulkRequest.push(input);
      return {
        eligible: 1,
        sent: 1,
        skipped: 0,
        notReleased: 2,
        alreadyRequested: 0,
        invoiceAlreadyReceived: 0,
      };
    }),
  };
});

import {
  advanceConsultantPayment,
  releaseConsultantPaymentByPeople,
  reopenPaymentRelease,
  requestConsultantInvoice,
  requestMonthlyInvoices,
} from "./actions";

const RELEASE = "PAGAMENTOS_LIBERACAO_DP";
const SEND_NF = "PAGAMENTOS_ENVIO_NF";
const REOPEN = "PAGAMENTOS_REABRIR_LIBERACAO";

beforeEach(() => {
  vi.stubEnv("DATABASE_URL", "postgresql://u:p@localhost:5432/db");
  h.grants = {};
  h.currentUser = { id: "u1", name: "Usuária", email: "u@x", roles: ["PEOPLE"] };
  h.calls = { release: [], reopen: [], request: [], bulkRequest: [] };
  h.requestOutcome = { status: "SENT", transitioned: true };
  h.releaseResult = null;
});
afterEach(() => vi.unstubAllEnvs());

describe("releaseConsultantPaymentByPeople (DP)", () => {
  it("is FORBIDDEN without PAGAMENTOS_LIBERACAO_DP edit (e.g. FINANCE)", async () => {
    h.currentUser.roles = ["FINANCE"];
    h.grants = { [SEND_NF]: true, [REOPEN]: true };
    const result = await releaseConsultantPaymentByPeople({ paymentIds: ["p1"] });
    expect(result).toMatchObject({ ok: false, error: "FORBIDDEN" });
    expect(h.calls.release).toHaveLength(0);
  });

  it("releases a single/selected payment for People", async () => {
    h.grants = { [RELEASE]: true };
    const result = await releaseConsultantPaymentByPeople({ paymentIds: ["p1", "p2"] });
    expect(result.ok).toBe(true);
    expect(h.calls.release[0]).toMatchObject({
      paymentIds: ["p1", "p2"],
      actorUserId: "db-u1",
      actorName: "Usuária",
    });
  });

  it("releases a whole month", async () => {
    h.grants = { [RELEASE]: true };
    const result = await releaseConsultantPaymentByPeople({ month: 9, year: 2026 });
    expect(result.ok).toBe(true);
    expect(h.calls.release[0]).toMatchObject({ month: 9, year: 2026 });
    expect(h.calls.release[0].paymentIds).toBeUndefined();
  });

  it("errors with the waiting projects when a single release is held by the operation", async () => {
    h.grants = { [RELEASE]: true };
    h.releaseResult = {
      released: 0,
      skipped: 0,
      notFound: 0,
      waitingOperationClosing: 1,
      waitingProjects: ["Alpha"],
      invoiceAlreadyReceived: 0,
      releasedIds: [],
    };
    const result = await releaseConsultantPaymentByPeople({ paymentIds: ["p1"] });
    expect(result).toMatchObject({ ok: false, error: "INVALID_INPUT" });
    if (!result.ok) {
      expect(result.message).toMatch(/Aguardando fechamento operacional/);
      expect(result.message).toContain("Alpha");
    }
  });

  it("filtered bulk sends exactly the given ids (never the whole month)", async () => {
    h.grants = { [RELEASE]: true };
    await releaseConsultantPaymentByPeople({ paymentIds: ["p3", "p7"] });
    expect(h.calls.release[0].paymentIds).toEqual(["p3", "p7"]);
    expect(h.calls.release[0].month).toBeUndefined();
  });

  it("rejects malformed input", async () => {
    h.grants = { [RELEASE]: true };
    const result = await releaseConsultantPaymentByPeople({ paymentIds: [] });
    expect(result).toMatchObject({ ok: false, error: "INVALID_INPUT" });
  });
});

describe("requestConsultantInvoice / requestMonthlyInvoices (Financeiro)", () => {
  it("is FORBIDDEN for People (no PAGAMENTOS_ENVIO_NF)", async () => {
    h.grants = { [RELEASE]: true };
    const single = await requestConsultantInvoice({ paymentId: "p1" });
    const bulk = await requestMonthlyInvoices({ month: 9, year: 2026 });
    expect(single).toMatchObject({ ok: false, error: "FORBIDDEN" });
    expect(bulk).toMatchObject({ ok: false, error: "FORBIDDEN" });
    expect(h.calls.request).toHaveLength(0);
    expect(h.calls.bulkRequest).toHaveLength(0);
  });

  it("refuses a payment the DP has not released yet", async () => {
    h.currentUser.roles = ["FINANCE"];
    h.grants = { [SEND_NF]: true };
    h.requestOutcome = { status: "NOT_RELEASED", transitioned: false };
    const result = await requestConsultantInvoice({ paymentId: "p1" });
    expect(result).toMatchObject({ ok: false, error: "INVALID_INPUT" });
    if (!result.ok) expect(result.message).toMatch(/DP ainda nao liberou/);
  });

  it("sends for a released payment and bulk reports skipped counts", async () => {
    h.currentUser.roles = ["FINANCE"];
    h.grants = { [SEND_NF]: true };
    const single = await requestConsultantInvoice({ paymentId: "p1" });
    expect(single).toEqual({ ok: true, data: { status: "SENT" } });
    const bulk = await requestMonthlyInvoices({
      month: 9,
      year: 2026,
      paymentIds: ["p1"],
    });
    expect(bulk).toEqual({
      ok: true,
      data: {
        eligible: 1,
        sent: 1,
        skipped: 0,
        notReleased: 2,
        alreadyRequested: 0,
        invoiceAlreadyReceived: 0,
      },
    });
    expect(h.calls.bulkRequest[0]).toMatchObject({ paymentIds: ["p1"] });
  });
});

describe("reopenPaymentRelease (só Financeiro)", () => {
  it("is FORBIDDEN for People and Area Manager without the matrix grant", async () => {
    for (const roles of [["PEOPLE"], ["AREA_MANAGER"], ["ADMIN"]]) {
      h.currentUser.roles = roles;
      h.grants = { [RELEASE]: true, [SEND_NF]: true };
      const result = await reopenPaymentRelease({
        paymentId: "p1",
        justification: "Erro de horas",
      });
      expect(result).toMatchObject({ ok: false, error: "FORBIDDEN" });
    }
    expect(h.calls.reopen).toHaveLength(0);
  });

  it("requires a justification", async () => {
    h.currentUser.roles = ["FINANCE"];
    h.grants = { [REOPEN]: true };
    const result = await reopenPaymentRelease({ paymentId: "p1", justification: " " });
    expect(result).toMatchObject({ ok: false, error: "INVALID_INPUT" });
    expect(h.calls.reopen).toHaveLength(0);
  });

  it("reopens with justification for Finance", async () => {
    h.currentUser.roles = ["FINANCE"];
    h.grants = { [REOPEN]: true };
    const result = await reopenPaymentRelease({
      paymentId: "p1",
      justification: "Erro de horas",
    });
    expect(result).toEqual({ ok: true, data: { id: "p1", status: "OPEN" } });
    expect(h.calls.reopen[0]).toMatchObject({
      paymentId: "p1",
      justification: "Erro de horas",
      actorUserId: "db-u1",
    });
  });
});

describe("advanceConsultantPayment", () => {
  it("refuses the matrix-gated steps (must use the dedicated actions)", async () => {
    h.currentUser.roles = ["FINANCE"];
    for (const action of ["RELEASE_BY_PEOPLE", "REQUEST_INVOICE", "REOPEN_RELEASE"] as const) {
      const result = await advanceConsultantPayment({ id: "p1", action });
      expect(result).toMatchObject({ ok: false, error: "INVALID_INPUT" });
    }
  });

  it("manual 'NF recebida' cannot skip the NF request (PEOPLE_RELEASED)", async () => {
    h.currentUser.roles = ["FINANCE"];
    const { prisma } = await import("@jumpflow/database");
    (prisma.consultantPayment.findUnique as Any).mockResolvedValueOnce({
      id: "p1",
      status: "PEOPLE_RELEASED",
      contractType: "PJ",
      pjAmount: 1,
      totalAmount: 1,
      invoiceAmount: null,
    });
    const updateMany = vi.fn(async ({ where }: Any) => ({
      count: where.status.in.includes("PEOPLE_RELEASED") ? 1 : 0,
    }));
    (prisma.$transaction as Any).mockImplementationOnce(async (fn: Any) =>
      fn({ consultantPayment: { updateMany }, auditEvent: { create: vi.fn() } }),
    );
    const result = await advanceConsultantPayment({
      id: "p1",
      action: "MARK_INVOICE_RECEIVED",
    });
    expect(result).toMatchObject({ ok: false, error: "ALREADY_DECIDED" });
    expect(updateMany.mock.calls[0][0].where.status).toEqual({
      in: ["WAITING_FOR_INVOICE"],
    });
  });

  it("keeps finance-only steps out of People's reach", async () => {
    h.currentUser.roles = ["PEOPLE"];
    h.grants = { [RELEASE]: true };
    await expect(
      advanceConsultantPayment({ id: "p1", action: "SEND_TO_BANK" }),
    ).rejects.toThrow("NEXT_REDIRECT");
  });
});
