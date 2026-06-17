import { describe, expect, it } from "vitest";
import {
  applyRounding,
  computeProjectBilling,
  DEFAULT_BILLING_CONFIG,
  type BillingEngineConfig,
  type BillingEngineContext,
} from "@/lib/billing/charge-engine";
import type { BillingChargeType } from "@/lib/clients/types";

function config(over: Partial<BillingEngineConfig> = {}): BillingEngineConfig {
  return { ...DEFAULT_BILLING_CONFIG, ...over };
}

function context(over: Partial<BillingEngineContext> = {}): BillingEngineContext {
  return {
    approvedHours: 100,
    hourlyAmount: 18_000, // 100h × 180
    allocatedConsultants: 0,
    reimbursableExpenseTotal: 0,
    ...over,
  };
}

function compute(chargeType: BillingChargeType, over: Partial<BillingEngineConfig> = {}, ctx?: Partial<BillingEngineContext>) {
  return computeProjectBilling({
    chargeType,
    config: config(over),
    context: context(ctx),
  });
}

describe("applyRounding", () => {
  it("returns the value unchanged for NONE", () => {
    expect(applyRounding(10.4, "NONE")).toBe(10.4);
  });
  it("rounds to the nearest 15 minutes", () => {
    expect(applyRounding(1.1, "NEAREST_15_MINUTES")).toBe(1); // 66min -> 60
    expect(applyRounding(1.2, "NEAREST_15_MINUTES")).toBe(1.25); // 72min -> 75
  });
  it("always rounds up for CEIL rules", () => {
    expect(applyRounding(1.01, "CEIL_HOUR")).toBe(2);
    expect(applyRounding(1.0, "CEIL_HOUR")).toBe(1);
  });
});

describe("computeProjectBilling — per charge type", () => {
  it("HOURLY bills hours × resolved rate", () => {
    const r = compute("HOURLY");
    expect(r.amount).toBe(18_000);
    expect(r.hours).toBe(100);
    expect(r.manual).toBe(false);
  });

  it("CONSULTANT_HOURLY behaves like hourly", () => {
    expect(compute("CONSULTANT_HOURLY").amount).toBe(18_000);
  });

  it("MONTHLY bills the fixed amount independent of hours", () => {
    const r = compute("MONTHLY", { fixedAmount: 25_000 });
    expect(r.amount).toBe(25_000);
    expect(r.hours).toBe(0);
    expect(r.manual).toBe(false);
  });

  it("MONTHLY without a fixed amount is flagged manual", () => {
    const r = compute("MONTHLY");
    expect(r.amount).toBe(0);
    expect(r.manual).toBe(true);
  });

  it("HOURLY_PLUS_FIXED adds base plus excess hours", () => {
    // base 15000 + (100 - 80) × 200 = 19000
    const r = compute("HOURLY_PLUS_FIXED", {
      fixedAmount: 15_000,
      includedHours: 80,
      overageRate: 200,
    });
    expect(r.amount).toBe(19_000);
  });

  it("TIME_AND_MATERIAL adds reimbursable expenses with markup", () => {
    const r = compute(
      "TIME_AND_MATERIAL",
      { reimbursableExpenses: true, reimbursableMarkupPct: 10 },
      { reimbursableExpenseTotal: 1_000 },
    );
    expect(r.amount).toBe(18_000 + 1_100);
  });

  it("PER_ALLOCATED_CONSULTANT multiplies headcount by the unit value", () => {
    const r = compute(
      "PER_ALLOCATED_CONSULTANT",
      { perConsultantAmount: 18_000 },
      { allocatedConsultants: 5 },
    );
    expect(r.amount).toBe(90_000);
    expect(r.hours).toBe(0);
  });

  it("MIXED combines a fixed base with the hours value", () => {
    const r = compute("MIXED", { fixedAmount: 5_000 });
    expect(r.amount).toBe(23_000);
  });

  it.each(["MILESTONE", "PER_SPRINT", "ON_DEMAND", "PAY_AS_YOU_GO", "SUCCESS_FEE"] as const)(
    "%s is a manual charge type",
    (chargeType) => {
      const r = compute(chargeType, { fixedAmount: 40_000 });
      expect(r.manual).toBe(true);
      expect(r.amount).toBe(40_000);
    },
  );
});

describe("HOUR_PACKAGE — overage treatments", () => {
  const base = { fixedAmount: 30_000, includedHours: 80, overageRate: 250 };
  // approvedHours 100 -> 20h excess.

  it("BILL_EXTRA charges the excess on top of the package", () => {
    const r = compute("HOUR_PACKAGE", { ...base, overageTreatment: "BILL_EXTRA" });
    expect(r.amount).toBe(30_000 + 20 * 250);
  });

  it("BLOCK_AT_LIMIT caps hours and does not bill the excess", () => {
    const r = compute("HOUR_PACKAGE", { ...base, overageTreatment: "BLOCK_AT_LIMIT" });
    expect(r.amount).toBe(30_000);
    expect(r.hours).toBe(80);
  });

  it("INCLUDE_FREE keeps the package price with no extra", () => {
    const r = compute("HOUR_PACKAGE", { ...base, overageTreatment: "INCLUDE_FREE" });
    expect(r.amount).toBe(30_000);
  });

  it("CARRY_OVER keeps the package price and notes the carried hours", () => {
    const r = compute("HOUR_PACKAGE", { ...base, overageTreatment: "CARRY_OVER" });
    expect(r.amount).toBe(30_000);
    expect(r.notes.join(" ")).toMatch(/acumulad/i);
  });
});

describe("post-processing — reajuste, discount, penalty", () => {
  it("applies a fixed reajuste percentage", () => {
    const r = compute("HOURLY", { adjustmentIndex: "FIXED", adjustmentPct: 10 });
    expect(r.amount).toBe(19_800); // 18000 × 1.10
  });

  it("records market indices without applying them", () => {
    const r = compute("HOURLY", { adjustmentIndex: "IPCA" });
    expect(r.amount).toBe(18_000);
    expect(r.notes.join(" ")).toMatch(/IPCA/);
  });

  it("subtracts a discount and adds a penalty", () => {
    const discounted = compute("HOURLY", { discountPct: 10 });
    expect(discounted.amount).toBe(16_200);
    const penalised = compute("HOURLY", { penaltyPct: 5 });
    expect(penalised.amount).toBe(18_900);
  });
});

describe("rounding feeds the hours amount", () => {
  it("bills the rounded hours, not the raw ones", () => {
    // 100.2h, rate 180. CEIL_HOUR -> 101h × 180 = 18180.
    const r = compute(
      "HOURLY",
      { roundingRule: "CEIL_HOUR" },
      { approvedHours: 100.2, hourlyAmount: 100.2 * 180 },
    );
    expect(r.hours).toBe(101);
    expect(r.amount).toBe(18_180);
  });
});
