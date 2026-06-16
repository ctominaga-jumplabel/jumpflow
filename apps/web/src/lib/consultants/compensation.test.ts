import { describe, expect, it } from "vitest";
import { computeCompensation } from "./compensation";

describe("computeCompensation", () => {
  it("calculates CLT FLEX with benefits and discounts", () => {
    const result = computeCompensation(
      {
        contractType: "CLT_FLEX",
        cltAmount: 7000,
        pjAmount: 5000,
        benefitCardAmount: 800,
        discountRules: {
          version: 1,
          fixedDiscounts: [{ label: "Coparticipacao", amount: 120 }],
          percentDiscounts: [{ label: "INSS simulado", percent: 8, base: "CLT" }],
        },
      },
      [{ amount: 660 }],
    );
    expect(result).toMatchObject({
      grossAmount: 12000,
      benefitAmount: 1460,
      discountAmount: 680,
      netAmount: 12780,
      cltCharges: null,
    });
  });

  it("returns null cltCharges for pure PJ without charge config", () => {
    const result = computeCompensation(
      { contractType: "PJ", pjAmount: 10000 },
      [],
    );
    expect(result.cltCharges).toBeNull();
    expect(result.netAmount).toBe(10000);
  });

  it("ignores cltCharges config when there is no CLT portion", () => {
    const result = computeCompensation(
      {
        contractType: "PJ",
        pjAmount: 10000,
        cltCharges: { autoApplyDeductions: true },
      },
      [],
    );
    expect(result.cltCharges).toBeNull();
    expect(result.discountAmount).toBe(0);
  });

  it("computes CLT charges informationally without applying when autoApply is false", () => {
    const result = computeCompensation(
      {
        contractType: "CLT",
        cltAmount: 10000,
        cltCharges: { autoApplyDeductions: false },
      },
      [],
    );
    expect(result.cltCharges).not.toBeNull();
    // Deductions are computed but NOT subtracted from net.
    expect(result.discountAmount).toBe(0);
    expect(result.netAmount).toBe(10000);
    // FGTS is informational at 8%.
    expect(result.cltCharges?.fgts).toBe(800);
  });

  it("applies INSS+IRRF to net when autoApply is true (FGTS excluded)", () => {
    const result = computeCompensation(
      {
        contractType: "CLT",
        cltAmount: 10000,
        cltCharges: { autoApplyDeductions: true },
      },
      [],
    );
    const charges = result.cltCharges!;
    expect(result.discountAmount).toBeCloseTo(charges.employeeDeductions, 2);
    expect(result.netAmount).toBeCloseTo(10000 - charges.employeeDeductions, 2);
    // FGTS must never be part of the employee deductions.
    expect(charges.employeeDeductions).toBe(
      Math.round((charges.inss + charges.irrf) * 100) / 100,
    );
  });

  it("CLT FLEX applies charges on the CLT portion only, alongside benefits", () => {
    const result = computeCompensation(
      {
        contractType: "CLT_FLEX",
        cltAmount: 5000,
        pjAmount: 6000,
        benefitCardAmount: 500,
        cltCharges: { autoApplyDeductions: true, dependents: 1 },
      },
      [{ amount: 660 }],
    );
    const charges = result.cltCharges!;
    // Charges are based on the CLT slice (5000), not the gross.
    expect(charges.base).toBe(5000);
    expect(charges.fgts).toBe(400); // 8% of 5000
    expect(result.grossAmount).toBe(11000);
    expect(result.benefitAmount).toBe(1160); // 500 card + 660 benefit
    expect(result.discountAmount).toBeCloseTo(charges.employeeDeductions, 2);
    expect(result.netAmount).toBeCloseTo(
      11000 + 1160 - charges.employeeDeductions,
      2,
    );
  });

  it("combines manual discountRules with automatic CLT deductions", () => {
    const result = computeCompensation(
      {
        contractType: "CLT",
        cltAmount: 8000,
        discountRules: {
          version: 1,
          fixedDiscounts: [{ label: "Coparticipacao", amount: 100 }],
        },
        cltCharges: { autoApplyDeductions: true },
      },
      [],
    );
    const charges = result.cltCharges!;
    expect(result.discountAmount).toBeCloseTo(
      100 + charges.employeeDeductions,
      2,
    );
  });
});
