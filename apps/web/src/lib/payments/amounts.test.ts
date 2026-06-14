import { describe, expect, it } from "vitest";
import { buildConsultantPaymentAmounts } from "./amounts";

describe("buildConsultantPaymentAmounts", () => {
  it("calculates PJ from project lines plus benefits", () => {
    expect(
      buildConsultantPaymentAmounts(
        { contractType: "PJ", hourlyRate: 150 },
        [{ amount: 300 }],
        [{ amount: 1000 }, { amount: 500 }],
      ),
    ).toEqual({
      cltNetAmount: 0,
      pjAmount: 1500,
      benefitAmount: 300,
      totalAmount: 1800,
    });
  });

  it("treats PJ fixed monthly amount as total, not hourly rate", () => {
    expect(
      buildConsultantPaymentAmounts(
        { contractType: "PJ", pjAmount: 12000 },
        [],
        [{ amount: 0 }],
      ),
    ).toEqual({
      cltNetAmount: 0,
      pjAmount: 12000,
      benefitAmount: 0,
      totalAmount: 12000,
    });
  });

  it("calculates CLT net amount with benefits and discounts", () => {
    expect(
      buildConsultantPaymentAmounts(
        {
          contractType: "CLT",
          cltAmount: 7000,
          benefitCardAmount: 800,
          discountRules: {
            version: 1,
            fixedDiscounts: [{ label: "Coparticipacao", amount: 100 }],
            percentDiscounts: [{ label: "INSS", percent: 10, base: "CLT" }],
          },
        },
        [{ amount: 200 }],
        [],
      ),
    ).toEqual({
      cltNetAmount: 7200,
      pjAmount: 0,
      benefitAmount: 1000,
      totalAmount: 7200,
    });
  });

  it("calculates CLT FLEX with separated CLT and PJ buckets", () => {
    expect(
      buildConsultantPaymentAmounts(
        {
          contractType: "CLT_FLEX",
          cltAmount: 5000,
          pjAmount: 4000,
          benefitCardAmount: 600,
          discountRules: {
            version: 1,
            percentDiscounts: [{ label: "INSS", percent: 8, base: "CLT" }],
          },
        },
        [{ amount: 400 }],
        [{ amount: 4500 }],
      ),
    ).toEqual({
      cltNetAmount: 5600,
      pjAmount: 4000,
      benefitAmount: 1000,
      totalAmount: 9600,
    });
  });
});
