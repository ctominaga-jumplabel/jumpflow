import { describe, expect, it } from "vitest";
import { computeAllocationMargin, computeProjectMargin } from "./margin";

describe("computeAllocationMargin", () => {
  it("computes revenue, cost, margin and pct", () => {
    const r = computeAllocationMargin({ hours: 160, saleRate: 200, costRate: 120 });
    expect(r.revenue).toBe(32000);
    expect(r.cost).toBe(19200);
    expect(r.margin).toBe(12800);
    expect(r.marginPct).toBe(40);
  });

  it("returns null margin when cost is unknown", () => {
    const r = computeAllocationMargin({ hours: 100, saleRate: 200, costRate: null });
    expect(r.revenue).toBe(20000);
    expect(r.cost).toBeNull();
    expect(r.margin).toBeNull();
    expect(r.marginPct).toBeNull();
  });
});

describe("computeProjectMargin", () => {
  it("aggregates allocations and flags missing cost", () => {
    const totals = computeProjectMargin([
      computeAllocationMargin({ hours: 100, saleRate: 200, costRate: 100 }),
      computeAllocationMargin({ hours: 100, saleRate: 150, costRate: null }),
    ]);
    expect(totals.revenue).toBe(35000); // 20000 + 15000
    expect(totals.cost).toBe(10000); // only first has cost
    expect(totals.margin).toBe(25000);
    expect(totals.hasMissingCost).toBe(true);
  });

  it("computes margin pct when all priced", () => {
    const totals = computeProjectMargin([
      computeAllocationMargin({ hours: 100, saleRate: 200, costRate: 120 }),
    ]);
    expect(totals.marginPct).toBe(40);
    expect(totals.hasMissingCost).toBe(false);
  });
});
