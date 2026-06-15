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
    expect(result).toEqual({
      grossAmount: 12000,
      benefitAmount: 1460,
      discountAmount: 680,
      netAmount: 12780,
    });
  });
});

