import { describe, expect, it } from "vitest";
import {
  computeProjectTracking,
  type ProjectTrackingInput,
  type TrackingAllocationInput,
} from "./tracking";

function alloc(
  over: Partial<TrackingAllocationInput> = {},
): TrackingAllocationInput {
  return {
    allocationId: "a1",
    consultantName: "Ana",
    role: "Dev",
    allocationPercent: 100,
    status: "ACTIVE",
    saleRate: 200,
    costRate: 120,
    plannedHours: 160,
    approvedBillableHours: 80,
    approvedTotalHours: 80,
    ...over,
  };
}

function input(over: Partial<ProjectTrackingInput> = {}): ProjectTrackingInput {
  return {
    projectId: "prj-1",
    projectName: "Atlas",
    clientName: "Cliente Um",
    plannedBasis: "MONTHLY",
    budgetHours: null,
    allocations: [alloc()],
    unallocatedApprovedHours: 0,
    closingsBilled: null,
    closingsHours: 0,
    closingsCount: 0,
    receivablesForecast: 0,
    receivablesReceived: 0,
    ...over,
  };
}

describe("computeProjectTracking", () => {
  it("computes planned vs realized revenue, cost and margin", () => {
    const t = computeProjectTracking(input());
    // Previsto: 160h × 200 = 32000 receita; 160h × 120 = 19200 custo.
    expect(t.planned.revenue).toBe(32000);
    expect(t.planned.cost).toBe(19200);
    expect(t.planned.margin).toBe(12800);
    expect(t.planned.marginPct).toBe(40);
    // Realizado: 80h aprovadas → 16000 receita; 80h × 120 = 9600 custo.
    expect(t.realized.revenue).toBe(16000);
    expect(t.realized.cost).toBe(9600);
    expect(t.realized.margin).toBe(6400);
    expect(t.realized.marginPct).toBe(40);
  });

  it("uses only billable hours for realized revenue but all hours for cost", () => {
    const t = computeProjectTracking(
      input({
        allocations: [
          alloc({ approvedBillableHours: 50, approvedTotalHours: 80 }),
        ],
      }),
    );
    expect(t.realized.revenue).toBe(50 * 200); // 10000 (só billable)
    expect(t.realized.cost).toBe(80 * 120); // 9600 (todas as horas)
  });

  it("flags missing cost when an allocation has no cost rate", () => {
    const t = computeProjectTracking(
      input({ allocations: [alloc({ costRate: null })] }),
    );
    expect(t.planned.cost).toBe(0);
    expect(t.planned.hasMissingCost).toBe(true);
    expect(t.realized.cost).toBe(0);
    expect(t.realized.hasMissingCost).toBe(true);
    // Sem custo, a margem realizada fica nula (lado desconhecido).
    const row = t.rows[0];
    expect(row.realizedCost).toBeNull();
    expect(row.realizedMargin).toBeNull();
  });

  it("flags missing cost when there are unallocated approved hours", () => {
    const t = computeProjectTracking(input({ unallocatedApprovedHours: 12 }));
    expect(t.realized.hasMissingCost).toBe(true);
    expect(t.hasUnallocatedApprovedHours).toBe(true);
    // Horas sem alocação entram no total aprovado (para o budget).
    expect(t.approvedHoursTotal).toBe(80 + 12);
  });

  it("computes budget consumption as approved / budgetHours", () => {
    const t = computeProjectTracking(
      input({ budgetHours: 320, plannedBasis: "BUDGET" }),
    );
    // 80 aprovadas / 320 budget = 25%
    expect(t.budgetConsumptionPct).toBe(25);
  });

  it("returns null budget consumption when there is no budget", () => {
    const t = computeProjectTracking(input({ budgetHours: null }));
    expect(t.budgetConsumptionPct).toBeNull();
  });

  it("does not count planless allocations as missing cost in the planned total", () => {
    const t = computeProjectTracking(
      input({
        allocations: [
          alloc({ allocationId: "a1", plannedHours: 160 }),
          alloc({
            allocationId: "a2",
            consultantName: "Beto",
            status: "ENDED",
            plannedHours: null,
            costRate: null,
            approvedBillableHours: 10,
            approvedTotalHours: 10,
          }),
        ],
      }),
    );
    // O previsto considera só a alocação com plano (a1), que tem custo.
    expect(t.planned.hasMissingCost).toBe(false);
    // O realizado inclui a2 (sem custo) e por isso fica parcial.
    expect(t.realized.hasMissingCost).toBe(true);
  });

  it("applies the D2 extension seam (additionalRealizedCost) to realized cost", () => {
    const t = computeProjectTracking(input({ additionalRealizedCost: 1000 }));
    // Custo realizado base 9600 + 1000 pontual = 10600.
    expect(t.realized.cost).toBe(10600);
    expect(t.realized.margin).toBe(16000 - 10600);
  });
});
