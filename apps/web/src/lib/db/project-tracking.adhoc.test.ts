import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Onda D / D2 — loadProjectTracking soma o custo das remunerações pontuais
 * (ConsultantAdHocPayment, status != CANCELLED) ao CUSTO REALIZADO da margem do
 * projeto, via o seam `additionalRealizedCost` do builder puro. Janela = todo o
 * histórico do projeto (base cumulativa do realizado).
 */

type AnyRow = Record<string, unknown>;

const past = new Date(Date.UTC(2020, 0, 1));

const projectFindUnique = vi.fn(async (): Promise<AnyRow | null> => ({
  id: "prj-1",
  name: "Alpha",
  budgetHours: null,
  client: { name: "Acme" },
  saleRates: [
    {
      id: "sr-1",
      projectId: "prj-1",
      consultantId: "c1",
      allocationId: "a1",
      startsAt: past,
      endsAt: null,
      hourlyRate: 100,
    },
  ],
  allocations: [
    {
      id: "a1",
      role: "Dev",
      allocationPercent: 100,
      status: "ACTIVE",
      consultantId: "c1",
      consultant: { name: "Bia" },
      costRates: [{ startsAt: past, endsAt: null, hourlyCost: 50 }],
    },
  ],
}));

const timeEntryFindMany = vi.fn(async (): Promise<AnyRow[]> => [
  { allocationId: "a1", hours: 10, multiplier: 1, billable: true },
]);

// Dataset de pontuais: 300 PAID + 500 PLANNED + 999 CANCELLED. O aggregate
// honra o where para provar M3 (só PAID entra no custo REALIZADO).
const adHocRows = [
  { status: "PAID", amount: 300 },
  { status: "PLANNED", amount: 500 },
  { status: "CANCELLED", amount: 999 },
];
const adHocAggregate = vi.fn(
  async ({ where }: { where: { status?: string } }): Promise<AnyRow> => {
    const sum = adHocRows
      .filter((r) => r.status === where.status)
      .reduce((acc, r) => acc + r.amount, 0);
    return { _sum: { amount: sum || null } };
  },
);

vi.mock("@jumpflow/database", () => ({
  prisma: {
    project: { findUnique: () => projectFindUnique() },
    timeEntry: { findMany: () => timeEntryFindMany() },
    revenueClosing: {
      aggregate: async () => ({ _sum: { totalAmount: null, totalHours: null } }),
      count: async () => 0,
    },
    projectReceivableSchedule: { groupBy: async () => [] },
    consultantAdHocPayment: {
      aggregate: (args: { where: { status?: string } }) => adHocAggregate(args),
    },
  },
}));

import { loadProjectTracking } from "@/lib/db/project-tracking";

beforeEach(() => {
  vi.clearAllMocks();
});

afterEach(() => {
  vi.clearAllMocks();
});

describe("loadProjectTracking — remuneração pontual no custo realizado", () => {
  it("M3: só as pontuais PAID entram no custo realizado (PLANNED/CANCELLED fora)", async () => {
    const tracking = await loadProjectTracking("prj-1");
    expect(tracking).not.toBeNull();
    if (!tracking) return;
    // A consulta filtra status PAID.
    expect(adHocAggregate).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ status: "PAID" }) }),
    );
    // Realizado por horas: receita 10x100=1000; custo por horas 10x50=500.
    // + PAID 300 (PLANNED 500 e CANCELLED 999 ficam de fora) => custo 800.
    expect(tracking.realized.revenue).toBeCloseTo(1000, 6);
    expect(tracking.realized.cost).toBeCloseTo(800, 6);
    expect(tracking.realized.margin).toBeCloseTo(200, 6);
  });

  it("não soma nada quando não há pontuais PAID", async () => {
    adHocAggregate.mockResolvedValueOnce({ _sum: { amount: null } });
    const tracking = await loadProjectTracking("prj-1");
    expect(tracking?.realized.cost).toBeCloseTo(500, 6);
  });
});
