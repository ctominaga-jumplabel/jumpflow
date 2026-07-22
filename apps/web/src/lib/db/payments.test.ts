import { afterEach, describe, expect, it, vi } from "vitest";

/**
 * Read/notify-layer tests for the consultant payments module.
 *
 * - listConsultantPayments builds the right `where` (month/year always, plus
 *   optional consultant/status/contractType, combinable).
 * - sendConsultantPaymentForecast includes the per-project breakdown in the
 *   forecast email for contracts that have project lines (PJ / CLT FLEX) and
 *   omits it for pure CLT (no project lines).
 */

const findMany = vi.fn(
  // eslint-disable-next-line @typescript-eslint/no-unused-vars -- typed for mock.calls assertions
  async (_args: { where: Record<string, unknown> }): Promise<unknown> => [],
);
const findUnique = vi.fn(
  // eslint-disable-next-line @typescript-eslint/no-unused-vars -- typed for mock.calls assertions
  async (_args: {
    include: { lines: { where: unknown } };
  }): Promise<unknown> => null,
);
const consultantFindMany = vi.fn();
const transaction = vi.fn(async (cb: (tx: unknown) => unknown) =>
  cb({
    consultantPaymentForecast: { create: vi.fn(async () => ({ id: "fc1" })) },
    consultantPayment: { update: vi.fn() },
    auditEvent: { create: vi.fn() },
  }),
);

vi.mock("@jumpflow/database", () => ({
  prisma: {
    consultantPayment: {
      findMany: (args: { where: Record<string, unknown> }) => findMany(args),
      findUnique: (args: { include: { lines: { where: unknown } } }) =>
        findUnique(args),
    },
    consultant: { findMany: (args: unknown) => consultantFindMany(args) },
    $transaction: (cb: (tx: unknown) => unknown) => transaction(cb),
  },
  Prisma: { JsonNull: "__JsonNull__" },
}));

const send = vi.fn(
  // eslint-disable-next-line @typescript-eslint/no-unused-vars -- typed for mock.calls assertions
  async (_message: { text: string }) => ({
    id: "email-1",
    provider: "console",
  }),
);
vi.mock("@/lib/automation/email-transport", () => ({
  getEmailTransport: () => ({ send }),
}));

import {
  listConsultantPayments,
  listConsultantPaymentsForExport,
  sendConsultantPaymentForecast,
} from "@/lib/db/payments";


afterEach(() => {
  vi.clearAllMocks();
});

describe("listConsultantPayments where", () => {
  function lastWhere() {
    return findMany.mock.calls.at(-1)![0].where;
  }

  it("always restricts to PJ/CLT_FLEX when no extra filter is given (P18)", async () => {
    await listConsultantPayments({ month: 6, year: 2026 });
    expect(lastWhere()).toEqual({
      month: 6,
      year: 2026,
      contractType: { in: ["PJ", "CLT_FLEX"] },
    });
  });

  it("narrows a contractType filter INSIDE the PJ/CLT_FLEX set", async () => {
    await listConsultantPayments({
      month: 6,
      year: 2026,
      consultantId: "c1",
      status: "INVOICE_VALIDATED",
      contractType: "PJ",
    });
    expect(lastWhere()).toEqual({
      month: 6,
      year: 2026,
      consultantId: "c1",
      status: "INVOICE_VALIDATED",
      contractType: { equals: "PJ", in: ["PJ", "CLT_FLEX"] },
    });
  });

  it("combines a subset of filters and keeps the PJ/CLT_FLEX restriction", async () => {
    await listConsultantPayments({
      month: 1,
      year: 2026,
      status: "PAID",
    });
    const where = lastWhere();
    expect(where).toEqual({
      month: 1,
      year: 2026,
      status: "PAID",
      contractType: { in: ["PJ", "CLT_FLEX"] },
    });
    expect(where).not.toHaveProperty("consultantId");
  });
});

describe("listConsultantPaymentsForExport where (P18: CLT nunca escapa)", () => {
  function lastWhere() {
    return findMany.mock.calls.at(-1)![0].where;
  }

  it("sempre restringe a PJ/CLT_FLEX quando sem filtro extra", async () => {
    await listConsultantPaymentsForExport({ month: 6, year: 2026 });
    expect(lastWhere()).toEqual({
      month: 6,
      year: 2026,
      contractType: { in: ["PJ", "CLT_FLEX"] },
    });
  });

  it("estreita um filtro contractType DENTRO do conjunto PJ/CLT_FLEX", async () => {
    await listConsultantPaymentsForExport({
      month: 6,
      year: 2026,
      contractType: "CLT_FLEX",
    });
    expect(lastWhere()).toEqual({
      month: 6,
      year: 2026,
      contractType: { equals: "CLT_FLEX", in: ["PJ", "CLT_FLEX"] },
    });
  });
});

describe("sendConsultantPaymentForecast email breakdown", () => {
  const baseInput = {
    paymentId: "p1",
    responseDeadlineAt: new Date("2026-07-05T00:00:00.000Z"),
    expectedPaymentAt: new Date("2026-07-10T00:00:00.000Z"),
    actorUserId: "u1",
  };

  it("includes a per-project breakdown for PJ/CLT_FLEX payments", async () => {
    findUnique.mockResolvedValue({
      id: "p1",
      month: 6,
      year: 2026,
      totalAmount: 18000,
      consultant: { id: "c1", name: "Ana", email: "ana@example.com" },
      lines: [
        {
          hours: 80,
          unitRate: 150,
          amount: 12000,
          description: "Horas aprovadas - Alpha",
          project: { name: "Alpha" },
        },
        {
          hours: 40,
          unitRate: 150,
          amount: 6000,
          description: "Horas aprovadas - Beta",
          project: { name: "Beta" },
        },
      ],
    });

    await sendConsultantPaymentForecast(baseInput);

    expect(send).toHaveBeenCalledTimes(1);
    // Only project lines were requested from the DB.
    expect(findUnique.mock.calls[0]![0].include.lines.where).toEqual({
      projectId: { not: null },
    });
    const body = send.mock.calls[0]![0].text as string;
    // Branded template renders the breakdown as a table (Projeto | Horas | ...).
    expect(body).toContain("Valor unit.");
    expect(body).toContain("Alpha");
    expect(body).toContain("Beta");
  });

  it("omits the breakdown for pure CLT payments (no project lines)", async () => {
    findUnique.mockResolvedValue({
      id: "p2",
      month: 6,
      year: 2026,
      totalAmount: 9000,
      consultant: { id: "c2", name: "Bia", email: "bia@example.com" },
      lines: [],
    });

    await sendConsultantPaymentForecast({ ...baseInput, paymentId: "p2" });

    const body = send.mock.calls[0]![0].text as string;
    expect(body).not.toContain("Valor unit.");
    expect(body).toContain("Previsão de pagamento");
  });
});
