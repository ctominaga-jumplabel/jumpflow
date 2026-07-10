import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Onda D / D2 — inclusão das remunerações pontuais no pagamento do mês.
 *
 * Regra provada:
 *  - Pontuais com payAt no mês e status != CANCELLED viram LINHA extra do
 *    ConsultantPayment (vinculada ao projeto) e SOMAM ao total.
 *  - CANCELLED fica de fora (filtrada na consulta).
 *  - Idempotência: se já existe pagamento do mês, o consultor é pulado e nada
 *    (nem a pontual) é regerado.
 *  - Consultor SÓ com pontual (sem horas) também é pago, desde que tenha
 *    compensação vigente.
 */

type AnyRow = Record<string, unknown>;

const timeEntryFindMany = vi.fn(async (): Promise<AnyRow[]> => []);
const adHocFindMany = vi.fn(async (): Promise<AnyRow[]> => []);
const consultantFindMany = vi.fn(async (): Promise<AnyRow[]> => []);
const paymentFindUnique = vi.fn(async (): Promise<AnyRow | null> => null);

const created = {
  payments: [] as AnyRow[],
  lines: [] as AnyRow[],
  audits: [] as AnyRow[],
};

const txMock = {
  consultantPayment: {
    findUnique: () => paymentFindUnique(),
    create: async ({ data }: { data: AnyRow }) => {
      const row = { id: `pay-${created.payments.length + 1}`, ...data };
      created.payments.push(row);
      return row;
    },
  },
  consultantPaymentLine: {
    createMany: async ({ data }: { data: AnyRow[] }) => {
      created.lines.push(...data);
      return { count: data.length };
    },
  },
  auditEvent: {
    create: async ({ data }: { data: AnyRow }) => {
      created.audits.push(data);
      return data;
    },
  },
};

const transaction = vi.fn(async (cb: (tx: unknown) => unknown) => cb(txMock));

vi.mock("@jumpflow/database", () => ({
  prisma: {
    timeEntry: { findMany: () => timeEntryFindMany() },
    consultantAdHocPayment: { findMany: () => adHocFindMany() },
    consultant: { findMany: () => consultantFindMany() },
    consultantPayment: { findUnique: () => paymentFindUnique() },
    $transaction: (cb: (tx: unknown) => unknown) => transaction(cb),
  },
  Prisma: { JsonNull: "__JsonNull__" },
}));

import { generateConsultantPayments } from "@/lib/db/payments";

const MONTH = 7;
const YEAR = 2026;

function pjConsultant(hourlyRate: number) {
  return {
    compensations: [
      {
        contractType: "PJ" as const,
        hourlyRate,
        cltAmount: 0,
        pjAmount: 0,
        benefitCardAmount: 0,
        discountRules: null,
        startsAt: new Date(Date.UTC(2020, 0, 1)),
        endsAt: null,
      },
    ],
    benefits: [],
  };
}

function entry(hours: number, hourlyRate: number, consultantId = "c1") {
  return {
    id: `te-${consultantId}-${hours}`,
    consultantId,
    projectId: "p1",
    hours,
    multiplier: 1,
    date: new Date(Date.UTC(YEAR, MONTH - 1, 10)),
    project: { name: "Alpha" },
    consultant: pjConsultant(hourlyRate),
  };
}

function adHoc(opts: {
  consultantId?: string;
  amount: number;
  status?: string;
  kind?: string;
}) {
  return {
    id: `adhoc-${Math.random().toString(36).slice(2)}`,
    consultantId: opts.consultantId ?? "c1",
    projectId: "p1",
    amount: opts.amount,
    status: opts.status ?? "PLANNED",
    kind: opts.kind ?? "BONUS",
    project: { name: "Alpha" },
  };
}

beforeEach(() => {
  created.payments.length = 0;
  created.lines.length = 0;
  created.audits.length = 0;
  timeEntryFindMany.mockResolvedValue([]);
  adHocFindMany.mockResolvedValue([]);
  consultantFindMany.mockResolvedValue([]);
  paymentFindUnique.mockResolvedValue(null);
});

afterEach(() => {
  vi.clearAllMocks();
});

describe("generateConsultantPayments — remuneração pontual (D2)", () => {
  it("adiciona a pontual como linha extra e soma ao total", async () => {
    timeEntryFindMany.mockResolvedValue([entry(10, 100)]); // 1000
    adHocFindMany.mockResolvedValue([adHoc({ amount: 500 })]);

    await generateConsultantPayments({ month: MONTH, year: YEAR });

    const adHocLine = created.lines.find((l) =>
      String(l.description).startsWith("Remuneracao pontual"),
    )!;
    expect(adHocLine).toBeTruthy();
    expect(adHocLine.projectId).toBe("p1");
    expect(adHocLine.hours).toBe(0);
    expect(adHocLine.amount).toBe(500);

    const payment = created.payments[0]!;
    // PJ: 10h x 100 = 1000 (horas) + 500 (pontual) = 1500.
    expect(payment.totalAmount).toBeCloseTo(1500, 6);
  });

  it("ignora pontuais CANCELLED (não são consultadas)", async () => {
    // A consulta já filtra status != CANCELLED; o mock devolve só as elegíveis.
    timeEntryFindMany.mockResolvedValue([entry(10, 100)]);
    adHocFindMany.mockResolvedValue([]); // canceladas não retornam

    await generateConsultantPayments({ month: MONTH, year: YEAR });

    expect(
      created.lines.some((l) =>
        String(l.description).startsWith("Remuneracao pontual"),
      ),
    ).toBe(false);
    expect(created.payments[0]!.totalAmount).toBeCloseTo(1000, 6);
  });

  it("é idempotente: pagamento existente pula o consultor (pontual não duplica)", async () => {
    timeEntryFindMany.mockResolvedValue([entry(10, 100)]);
    adHocFindMany.mockResolvedValue([adHoc({ amount: 500 })]);
    paymentFindUnique.mockResolvedValue({ id: "pay-existing" });

    const result = await generateConsultantPayments({ month: MONTH, year: YEAR });

    expect(result.generated).toBe(0);
    expect(result.skippedExisting).toBe(1);
    expect(created.payments).toHaveLength(0);
    expect(created.lines).toHaveLength(0);
  });

  it("paga consultor só com pontual (sem horas), buscando a compensação vigente", async () => {
    timeEntryFindMany.mockResolvedValue([]);
    adHocFindMany.mockResolvedValue([adHoc({ consultantId: "c2", amount: 750 })]);
    consultantFindMany.mockResolvedValue([
      { id: "c2", ...pjConsultant(0) },
    ]);

    await generateConsultantPayments({ month: MONTH, year: YEAR });

    expect(created.payments).toHaveLength(1);
    const line = created.lines.find((l) =>
      String(l.description).startsWith("Remuneracao pontual"),
    )!;
    expect(line.amount).toBe(750);
    expect(created.payments[0]!.totalAmount).toBeCloseTo(750, 6);
  });
});
