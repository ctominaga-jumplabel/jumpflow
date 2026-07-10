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

const adHocAggregate = vi.fn(async (): Promise<AnyRow> => ({
  _sum: { amount: 300 },
}));

vi.mock("@jumpflow/database", () => ({
  prisma: {
    project: { findUnique: () => projectFindUnique() },
    timeEntry: { findMany: () => timeEntryFindMany() },
    revenueClosing: {
      aggregate: async () => ({ _sum: { totalAmount: null, totalHours: null } }),
      count: async () => 0,
    },
    projectReceivableSchedule: { groupBy: async () => [] },
    consultantAdHocPayment: { aggregate: () => adHocAggregate() },
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
  it("soma o total das pontuais (não canceladas) ao custo realizado", async () => {
    const tracking = await loadProjectTracking("prj-1");
    expect(tracking).not.toBeNull();
    if (!tracking) return;
    // Realizado por horas: receita 10x100=1000; custo por horas 10x50=500.
    // + pontuais 300 => custo realizado 800, margem 200.
    expect(tracking.realized.revenue).toBeCloseTo(1000, 6);
    expect(tracking.realized.cost).toBeCloseTo(800, 6);
    expect(tracking.realized.margin).toBeCloseTo(200, 6);
  });

  it("não soma nada quando não há pontuais", async () => {
    adHocAggregate.mockResolvedValueOnce({ _sum: { amount: null } });
    const tracking = await loadProjectTracking("prj-1");
    expect(tracking?.realized.cost).toBeCloseTo(500, 6);
  });
});
