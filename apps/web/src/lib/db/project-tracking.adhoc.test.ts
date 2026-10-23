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
  consultantProjectRates: [],
  allocations: [
    {
      id: "a1",
      role: "Dev",
      allocationPercent: 100,
      status: "ACTIVE",
      consultantId: "c1",
      consultant: { name: "Bia" },
      // Valor legado em texto (pré-backfill) também é lido.
      costRates: [{ startsAt: past, endsAt: null, hourlyCostEncrypted: "50.00" }],
    },
  ],
}));

const timeEntryFindMany = vi.fn(async (): Promise<AnyRow[]> => [
  { allocationId: "a1", hours: 10, multiplier: 1, billable: true },
]);

// Dataset de pontuais: 300 PAID + 500 PLANNED + 999 CANCELLED. O findMany
// honra o where para provar M3 (só PAID entra no custo REALIZADO). O valor é
// cifrado no banco, então a soma acontece na aplicação (sem _sum).
const adHocRows = [
  { status: "PAID", amountEncrypted: "300.00" },
  { status: "PLANNED", amountEncrypted: "500.00" },
  { status: "CANCELLED", amountEncrypted: "999.00" },
];
const adHocFindMany = vi.fn(
  async ({ where }: { where: { status?: string } }): Promise<AnyRow[]> =>
    adHocRows.filter((r) => r.status === where.status),
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
      findMany: (args: { where: { status?: string } }) => adHocFindMany(args),
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
    expect(adHocFindMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ status: "PAID" }) }),
    );
    // Realizado por horas: receita 10x100=1000; custo por horas 10x50=500.
    // + PAID 300 (PLANNED 500 e CANCELLED 999 ficam de fora) => custo 800.
    expect(tracking.realized.revenue).toBeCloseTo(1000, 6);
    expect(tracking.realized.cost).toBeCloseTo(800, 6);
    expect(tracking.realized.margin).toBeCloseTo(200, 6);
  });

  it("não soma nada quando não há pontuais PAID", async () => {
    adHocFindMany.mockResolvedValueOnce([]);
    const tracking = await loadProjectTracking("prj-1");
    expect(tracking?.realized.cost).toBeCloseTo(500, 6);
  });

  it("fora do grupo Dados Sensíveis, nenhuma linha traz custo unitário (totais mantidos)", async () => {
    const tracking = await loadProjectTracking("prj-1");
    expect(tracking?.rows[0]).toMatchObject({
      costRate: null,
      realizedCost: null,
      realizedMargin: null,
      plannedCost: null,
    });
    expect(tracking?.realized.cost).toBeCloseTo(800, 6);
  });

  it("para o grupo Dados Sensíveis, a linha traz o custo/h decifrado", async () => {
    const tracking = await loadProjectTracking("prj-1", {
      includeCostDetail: true,
    });
    expect(tracking?.rows[0].costRate).toBe(50);
  });
});
