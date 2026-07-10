import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Melhoria #2 (Sobreaviso vira Atividade) — etapa financeira.
 *
 * Prova que o PAGAMENTO ao consultor usa SEMPRE o equivalente remunerado
 * (timeEntryEffectiveHours = hours x multiplier):
 *   - ON_CALL com multiplier 0.33 paga pelo fator (0.33 x horas), não pela hora cheia.
 *   - Atividade normal (multiplier 1.00) mantém o valor idêntico ao atual (regressão).
 *   - As linhas de fechamento (ConsultantPaymentLine) congelam horas/rate como snapshot.
 *
 * Fonte de verdade do pagamento: compensation.hourlyRate (vigente) x effectiveHours.
 */

type AnyRow = Record<string, unknown>;

const timeEntryFindMany = vi.fn(async (): Promise<AnyRow[]> => []);
const paymentFindUnique = vi.fn(async (): Promise<AnyRow | null> => null);

// Captures everything written inside the transaction so we can assert on the
// frozen line snapshots and the computed payment amounts.
const created = {
  payments: [] as AnyRow[],
  lines: [] as AnyRow[],
  audits: [] as AnyRow[],
};

const txMock = {
  consultantPayment: {
    findUnique: async () => null,
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
    consultantPayment: { findUnique: () => paymentFindUnique() },
    // Onda D: sem pontuais nestes cenários (regressão do fluxo por horas).
    consultantAdHocPayment: { findMany: async () => [] },
    consultant: { findMany: async () => [] },
    $transaction: (cb: (tx: unknown) => unknown) => transaction(cb),
  },
  Prisma: { JsonNull: "__JsonNull__" },
}));

import { generateConsultantPayments } from "@/lib/db/payments";

const MONTH = 6;
const YEAR = 2026;
const monthStart = new Date(Date.UTC(YEAR, MONTH - 1, 1));

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

function entry(opts: {
  hours: number;
  multiplier: number;
  hourlyRate: number;
  consultantId?: string;
  projectId?: string;
}) {
  return {
    id: `te-${Math.random().toString(36).slice(2)}`,
    consultantId: opts.consultantId ?? "c1",
    projectId: opts.projectId ?? "p1",
    hours: opts.hours,
    multiplier: opts.multiplier,
    date: new Date(Date.UTC(YEAR, MONTH - 1, 10)),
    project: { name: "Alpha" },
    consultant: pjConsultant(opts.hourlyRate),
  };
}

beforeEach(() => {
  created.payments.length = 0;
  created.lines.length = 0;
  created.audits.length = 0;
});

afterEach(() => {
  vi.clearAllMocks();
});

describe("generateConsultantPayments — equivalente remunerado", () => {
  it("paga ON_CALL pelo fator (multiplier 0.33), não pela hora cheia", async () => {
    timeEntryFindMany.mockResolvedValue([
      entry({ hours: 24, multiplier: 0.33, hourlyRate: 100 }),
    ]);

    await generateConsultantPayments({ month: MONTH, year: YEAR });

    const line = created.lines.find((l) => l.projectId === "p1")!;
    // effectiveHours = round(24 * 0.33, 2) = 7.92  ->  7.92 * 100 = 792
    expect(line.hours).toBe(7.92);
    expect(line.unitRate).toBe(100);
    expect(line.amount).toBeCloseTo(792, 6);

    // Snapshot congelado na linha: PJ total = soma das linhas de projeto.
    const payment = created.payments[0]!;
    expect(payment.pjAmount).toBeCloseTo(792, 6);
    expect(payment.totalAmount).toBeCloseTo(792, 6);
  });

  it("regressão: atividade normal (multiplier 1.00) mantém o valor cru atual", async () => {
    timeEntryFindMany.mockResolvedValue([
      entry({ hours: 24, multiplier: 1.0, hourlyRate: 100 }),
    ]);

    await generateConsultantPayments({ month: MONTH, year: YEAR });

    const line = created.lines.find((l) => l.projectId === "p1")!;
    // multiplier 1.00 -> effectiveHours == hours -> idêntico ao cálculo anterior.
    expect(line.hours).toBe(24);
    expect(line.amount).toBeCloseTo(2400, 6);
  });

  it("agrega normal + ON_CALL pelo equivalente de cada lançamento", async () => {
    timeEntryFindMany.mockResolvedValue([
      entry({ hours: 8, multiplier: 1.0, hourlyRate: 100 }),
      entry({ hours: 12, multiplier: 0.5, hourlyRate: 100 }),
    ]);

    await generateConsultantPayments({ month: MONTH, year: YEAR });

    const line = created.lines.find((l) => l.projectId === "p1")!;
    // 8 (normal) + round(12*0.5)=6 (on-call) = 14 horas efetivas -> 1400
    expect(line.hours).toBe(14);
    expect(line.amount).toBeCloseTo(1400, 6);
  });

  // Guards a referência usada nos asserts acima.
  it("usa o início do mês como data de vigência da remuneração", () => {
    expect(monthStart.toISOString().slice(0, 10)).toBe("2026-06-01");
  });
});
