import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Melhoria #2 (Sobreaviso vira Atividade) — etapa financeira (faturamento).
 *
 * Prova que a RECEITA:
 *   - usa o equivalente (timeEntryEffectiveHours = hours x multiplier) como base
 *     faturável (ON_CALL 0.33 fatura pelo fator);
 *   - exclui lançamentos billable=false (o filtro vive na query do Prisma);
 *   - regressão: atividade normal billable=true (multiplier 1.00) fatura idêntico
 *     ao cálculo cru atual;
 *   - congela horas/rate/valor por lançamento nas linhas (RevenueClosingLine).
 *
 * Fonte de verdade da receita: RevenueClosing.totalHours/totalAmount (motor de
 * cobrança), com detalhe por lançamento nas RevenueClosingLine (snapshot).
 */

type AnyRow = Record<string, unknown>;

const timeEntryFindMany = vi.fn(
  // eslint-disable-next-line @typescript-eslint/no-unused-vars -- typed for mock.calls assertions
  async (_args: { where: Record<string, unknown> }): Promise<AnyRow[]> => [],
);
const projectFindMany = vi.fn(async (): Promise<AnyRow[]> => []);
const expenseGroupBy = vi.fn(async (): Promise<AnyRow[]> => []);

const created = {
  closings: [] as AnyRow[],
  lines: [] as AnyRow[],
};

// Default: nenhum fechamento existente (caminho create). Testes de reconcile
// sobrescrevem com mockResolvedValueOnce para simular um CLOSED/INVOICED.
const revenueClosingFindFirst = vi.fn(
  async (): Promise<AnyRow | null> => null,
);

const txMock = {
  revenueClosing: {
    findFirst: () => revenueClosingFindFirst(),
    create: async ({ data }: { data: AnyRow }) => {
      const row = { id: `rc-${created.closings.length + 1}`, ...data };
      created.closings.push(row);
      return row;
    },
    update: async ({ data }: { data: AnyRow }) => {
      const row = { id: "rc-existing", ...data };
      created.closings.push(row);
      return row;
    },
  },
  revenueClosingLine: {
    deleteMany: async () => ({ count: 0 }),
    createMany: async ({ data }: { data: AnyRow[] }) => {
      created.lines.push(...data);
      return { count: data.length };
    },
  },
  auditEvent: { create: async () => ({}) },
};

const transaction = vi.fn(async (cb: (tx: unknown) => unknown) => cb(txMock));

vi.mock("@jumpflow/database", () => ({
  prisma: {
    timeEntry: {
      findMany: (args: { where: Record<string, unknown> }) =>
        timeEntryFindMany(args),
    },
    project: { findMany: () => projectFindMany() },
    expense: { groupBy: () => expenseGroupBy() },
    $transaction: (cb: (tx: unknown) => unknown) => transaction(cb),
  },
  Prisma: { JsonNull: "__JsonNull__" },
}));

import { generateRevenueClosings } from "@/lib/db/revenue";

const MONTH = 6;
const YEAR = 2026;

const PROJECT = {
  id: "p1",
  name: "Alpha",
  clientId: "cli1",
  billingHourlyRate: 200,
  client: { id: "cli1", defaultHourlyRate: 0 },
  saleRates: [],
  billingType: { chargeType: "HOURLY" as const },
  billingConfig: null,
  allocations: [],
};

function entry(opts: { hours: number; multiplier: number; id?: string }) {
  return {
    id: opts.id ?? `te-${Math.random().toString(36).slice(2)}`,
    projectId: "p1",
    consultantId: "c1",
    allocationId: null,
    description: "Trabalho",
    hours: opts.hours,
    multiplier: opts.multiplier,
    date: new Date(Date.UTC(YEAR, MONTH - 1, 10)),
    project: PROJECT,
  };
}

beforeEach(() => {
  created.closings.length = 0;
  created.lines.length = 0;
});

afterEach(() => {
  vi.clearAllMocks();
});

describe("generateRevenueClosings — base faturável é o equivalente", () => {
  it("só busca lançamentos billable=true (não faturáveis não geram receita)", async () => {
    timeEntryFindMany.mockResolvedValue([]);
    await generateRevenueClosings({ month: MONTH, year: YEAR });
    const where = timeEntryFindMany.mock.calls[0]![0].where;
    expect(where).toMatchObject({ status: "APPROVED", billable: true });
  });

  it("fatura ON_CALL pelo equivalente (multiplier 0.33), não pela hora cheia", async () => {
    timeEntryFindMany.mockResolvedValue([
      entry({ hours: 24, multiplier: 0.33 }),
    ]);

    await generateRevenueClosings({ month: MONTH, year: YEAR });

    const line = created.lines[0]!;
    // effectiveHours = round(24 * 0.33, 2) = 7.92 ; rate 200 -> 1584
    expect(line.hours).toBe(7.92);
    expect(line.unitRate).toBe(200);
    expect(line.amount).toBeCloseTo(1584, 6);

    const closing = created.closings[0]!;
    expect(Number(closing.totalHours)).toBe(7.92);
    expect(Number(closing.totalAmount)).toBeCloseTo(1584, 6);
  });

  it("regressão: atividade normal billable (multiplier 1.00) fatura o valor cru atual", async () => {
    timeEntryFindMany.mockResolvedValue([
      entry({ hours: 24, multiplier: 1.0 }),
    ]);

    await generateRevenueClosings({ month: MONTH, year: YEAR });

    const line = created.lines[0]!;
    expect(line.hours).toBe(24);
    expect(line.amount).toBeCloseTo(4800, 6);

    const closing = created.closings[0]!;
    expect(Number(closing.totalHours)).toBe(24);
    expect(Number(closing.totalAmount)).toBeCloseTo(4800, 6);
  });

  it("congela horas/rate por lançamento e soma totais com mix normal + ON_CALL", async () => {
    timeEntryFindMany.mockResolvedValue([
      entry({ hours: 10, multiplier: 1.0, id: "te-normal" }),
      entry({ hours: 6, multiplier: 0.5, id: "te-oncall" }),
    ]);

    await generateRevenueClosings({ month: MONTH, year: YEAR });

    const normal = created.lines.find((l) => l.timeEntryId === "te-normal")!;
    const oncall = created.lines.find((l) => l.timeEntryId === "te-oncall")!;
    expect(normal.hours).toBe(10);
    expect(normal.amount).toBeCloseTo(2000, 6);
    expect(oncall.hours).toBe(3); // round(6 * 0.5)
    expect(oncall.amount).toBeCloseTo(600, 6);

    const closing = created.closings[0]!;
    // 10 + 3 = 13 horas efetivas faturáveis -> 13 * 200 = 2600
    expect(Number(closing.totalHours)).toBe(13);
    expect(Number(closing.totalAmount)).toBeCloseTo(2600, 6);
  });
});

describe("generateRevenueClosings — reconcileClosed (fix pré-fatura defasada)", () => {
  it("recomputa um fechamento CLOSED quando reconcileClosed=true (totais atualizados, status mantido, ajuste preservado)", async () => {
    // Snapshot antigo: 40h fechadas. Agora existem 120h aprovadas (mock abaixo).
    revenueClosingFindFirst.mockResolvedValueOnce({
      id: "rc-existing",
      status: "CLOSED",
    });
    timeEntryFindMany.mockResolvedValue([
      entry({ hours: 120, multiplier: 1.0, id: "te-full" }),
    ]);

    const result = await generateRevenueClosings({
      month: MONTH,
      year: YEAR,
      projectId: "p1",
      reconcileClosed: true,
    });

    expect(result).toEqual({ generated: 1, skippedClosed: 0 });
    const updated = created.closings[0]!;
    expect(Number(updated.totalHours)).toBe(120);
    expect(Number(updated.totalAmount)).toBeCloseTo(24000, 6);
    // O update NÃO regride o status (não escreve status) nem zera o ajuste
    // manual (adjustmentAmount ausente do payload = preservado).
    expect(updated.status).toBeUndefined();
    expect(updated).not.toHaveProperty("adjustmentAmount");
  });

  it("PULA um fechamento CLOSED quando reconcileClosed é omitido (snapshot preservado)", async () => {
    revenueClosingFindFirst.mockResolvedValueOnce({
      id: "rc-existing",
      status: "CLOSED",
    });
    timeEntryFindMany.mockResolvedValue([
      entry({ hours: 120, multiplier: 1.0, id: "te-full" }),
    ]);

    const result = await generateRevenueClosings({
      month: MONTH,
      year: YEAR,
      projectId: "p1",
    });

    expect(result).toEqual({ generated: 0, skippedClosed: 1 });
    expect(created.closings).toHaveLength(0);
  });

  it("NUNCA toca INVOICED/CANCELLED, mesmo com reconcileClosed=true (imutáveis)", async () => {
    revenueClosingFindFirst.mockResolvedValueOnce({
      id: "rc-existing",
      status: "INVOICED",
    });
    timeEntryFindMany.mockResolvedValue([
      entry({ hours: 120, multiplier: 1.0, id: "te-full" }),
    ]);

    const result = await generateRevenueClosings({
      month: MONTH,
      year: YEAR,
      projectId: "p1",
      reconcileClosed: true,
    });

    expect(result).toEqual({ generated: 0, skippedClosed: 1 });
    expect(created.closings).toHaveLength(0);
  });
});
