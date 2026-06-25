import { describe, expect, it } from "vitest";
import {
  applyVacationPolicy,
  computeOvertimeCharge,
  overtimePolicyApplies,
} from "./overtime-policy";

describe("overtimePolicyApplies", () => {
  it("matches contract types per scope", () => {
    expect(overtimePolicyApplies("BOTH", "PJ")).toBe(true);
    expect(overtimePolicyApplies("CLT", "CLT")).toBe(true);
    expect(overtimePolicyApplies("CLT", "CLT_FLEX")).toBe(true);
    expect(overtimePolicyApplies("CLT", "PJ")).toBe(false);
    expect(overtimePolicyApplies("PJ", "PJ")).toBe(true);
    expect(overtimePolicyApplies("NONE", "PJ")).toBe(false);
  });
});

describe("computeOvertimeCharge", () => {
  it("applies the percentage uplift on overtime value", () => {
    const r = computeOvertimeCharge({
      overtimeHours: 10,
      hourlyRate: 100,
      contractType: "PJ",
      policy: { appliesTo: "BOTH", billingPct: 50 },
    });
    expect(r.applies).toBe(true);
    expect(r.upliftAmount).toBe(500); // 10 * 100 * 0.5
    expect(r.excessAmount).toBe(0);
    expect(r.total).toBe(500);
  });

  it("charges the excess above the threshold", () => {
    const r = computeOvertimeCharge({
      overtimeHours: 12,
      hourlyRate: 100,
      contractType: "CLT",
      policy: {
        appliesTo: "CLT",
        billingPct: 0,
        excessThresholdHours: 8,
        excessHourRate: 20,
      },
    });
    expect(r.excessHours).toBe(4);
    expect(r.excessAmount).toBe(80); // 4 * 20
    expect(r.total).toBe(80);
  });

  it("returns zero when the policy does not target the contract", () => {
    const r = computeOvertimeCharge({
      overtimeHours: 5,
      hourlyRate: 100,
      contractType: "PJ",
      policy: { appliesTo: "CLT", billingPct: 50 },
    });
    expect(r.applies).toBe(false);
    expect(r.total).toBe(0);
  });

  it("returns zero with no overtime", () => {
    const r = computeOvertimeCharge({
      overtimeHours: 0,
      hourlyRate: 100,
      contractType: "PJ",
      policy: { appliesTo: "BOTH", billingPct: 50 },
    });
    expect(r.total).toBe(0);
  });
});

describe("applyVacationPolicy", () => {
  it("keeps the full amount when billing during vacation", () => {
    const r = applyVacationPolicy({
      amount: 3000,
      vacationDays: 10,
      daysInPeriod: 30,
      billDuringVacation: true,
    });
    expect(r.billable).toBe(3000);
    expect(r.deduction).toBe(0);
  });

  it("deducts vacation pro-rata when not billing during vacation", () => {
    const r = applyVacationPolicy({
      amount: 3000,
      vacationDays: 10,
      daysInPeriod: 30,
      billDuringVacation: false,
    });
    expect(r.deduction).toBe(1000); // 3000 * 10/30
    expect(r.billable).toBe(2000);
  });

  it("caps vacation days at the period length", () => {
    const r = applyVacationPolicy({
      amount: 3000,
      vacationDays: 40,
      daysInPeriod: 30,
      billDuringVacation: false,
    });
    expect(r.billable).toBe(0);
    expect(r.deduction).toBe(3000);
  });
});
