import { describe, expect, it } from "vitest";
import {
  INVOICE_AMOUNT_TOLERANCE,
  buildInvoiceComparison,
  compareInvoiceAmount,
  expectedInvoiceAmount,
} from "./invoice-validation";

describe("INVOICE_AMOUNT_TOLERANCE", () => {
  it("is a 1% relative tolerance", () => {
    expect(INVOICE_AMOUNT_TOLERANCE).toBe(0.01);
  });
});

describe("compareInvoiceAmount", () => {
  it("treats equal amounts as a perfect match", () => {
    expect(compareInvoiceAmount({ declared: 1000, expected: 1000 })).toEqual({
      expected: 1000,
      declared: 1000,
      diff: 0,
      diffPct: 0,
      isDivergent: false,
    });
  });

  it("does not flag a divergence within the tolerance (0.5%)", () => {
    // 1000 expected, 1005 declared -> 5/1000 = 0.5% <= 1%.
    const result = compareInvoiceAmount({ declared: 1005, expected: 1000 });
    expect(result.diff).toBe(5);
    expect(result.diffPct).toBeCloseTo(0.005, 10);
    expect(result.isDivergent).toBe(false);
  });

  it("does not flag a divergence exactly at the tolerance (1%)", () => {
    // Boundary: isDivergent uses a STRICT > comparison, so exactly 1% is fine.
    const result = compareInvoiceAmount({ declared: 1010, expected: 1000 });
    expect(result.diff).toBe(10);
    expect(result.diffPct).toBeCloseTo(0.01, 10);
    expect(result.isDivergent).toBe(false);
  });

  it("flags a divergence just above the tolerance", () => {
    // 1011/1000 -> 1.1% > 1%.
    const result = compareInvoiceAmount({ declared: 1011, expected: 1000 });
    expect(result.diffPct).toBeCloseTo(0.011, 10);
    expect(result.isDivergent).toBe(true);
  });

  it("flags a divergence above expected with a POSITIVE diff (5%)", () => {
    const result = compareInvoiceAmount({ declared: 1050, expected: 1000 });
    expect(result.diff).toBe(50);
    expect(result.diffPct).toBeCloseTo(0.05, 10);
    expect(result.isDivergent).toBe(true);
  });

  it("flags a divergence below expected with a NEGATIVE diff (5%)", () => {
    const result = compareInvoiceAmount({ declared: 950, expected: 1000 });
    expect(result.diff).toBe(-50);
    expect(result.diffPct).toBeCloseTo(0.05, 10);
    expect(result.isDivergent).toBe(true);
  });

  it("rounds inputs and the diff to 2 decimals (cents)", () => {
    const result = compareInvoiceAmount({
      declared: 1000.004,
      expected: 999.996,
    });
    expect(result.declared).toBe(1000);
    expect(result.expected).toBe(1000);
    expect(result.diff).toBe(0);
    expect(result.isDivergent).toBe(false);
  });

  describe("expected = 0 edge case (avoids division by zero)", () => {
    it("matches when declared is also 0", () => {
      expect(compareInvoiceAmount({ declared: 0, expected: 0 })).toEqual({
        expected: 0,
        declared: 0,
        diff: 0,
        diffPct: 0,
        isDivergent: false,
      });
    });

    it("flags any non-zero declared amount as divergent with diffPct 0", () => {
      const result = compareInvoiceAmount({ declared: 100, expected: 0 });
      expect(result.diff).toBe(100);
      // Documented behaviour: diffPct falls back to 0 (no base to divide by),
      // divergence is driven by the absolute diff being non-zero.
      expect(result.diffPct).toBe(0);
      expect(result.isDivergent).toBe(true);
    });
  });
});

describe("expectedInvoiceAmount", () => {
  it("uses pjAmount for pure PJ contracts", () => {
    expect(
      expectedInvoiceAmount({
        contractType: "PJ",
        pjAmount: 12000,
        totalAmount: 12000,
      }),
    ).toBe(12000);
  });

  it("uses totalAmount for CLT (full payment on the NF)", () => {
    expect(
      expectedInvoiceAmount({
        contractType: "CLT",
        pjAmount: 0,
        totalAmount: 7200,
      }),
    ).toBe(7200);
  });

  it("uses totalAmount (not pjAmount) for CLT FLEX", () => {
    // CLT FLEX bundles CLT net + PJ service; the NF covers the whole payment.
    expect(
      expectedInvoiceAmount({
        contractType: "CLT_FLEX",
        pjAmount: 4000,
        totalAmount: 9600,
      }),
    ).toBe(9600);
  });
});

describe("buildInvoiceComparison", () => {
  it("returns null when no invoice amount was declared yet", () => {
    expect(
      buildInvoiceComparison({
        contractType: "PJ",
        pjAmount: 12000,
        totalAmount: 12000,
        invoiceAmount: null,
      }),
    ).toBeNull();
  });

  it("compares a PJ invoice against pjAmount", () => {
    const result = buildInvoiceComparison({
      contractType: "PJ",
      pjAmount: 12000,
      totalAmount: 12000,
      invoiceAmount: 12000,
    });
    expect(result).toEqual({
      expected: 12000,
      declared: 12000,
      diff: 0,
      diffPct: 0,
      isDivergent: false,
    });
  });

  it("compares a CLT FLEX invoice against totalAmount and flags divergence", () => {
    // Declared matches only the PJ bucket (4000) but expected is the full 9600.
    const result = buildInvoiceComparison({
      contractType: "CLT_FLEX",
      pjAmount: 4000,
      totalAmount: 9600,
      invoiceAmount: 4000,
    });
    expect(result).not.toBeNull();
    expect(result?.expected).toBe(9600);
    expect(result?.declared).toBe(4000);
    expect(result?.isDivergent).toBe(true);
  });

  it("treats a declared 0 as a real comparison (not 'no amount')", () => {
    const result = buildInvoiceComparison({
      contractType: "PJ",
      pjAmount: 1000,
      totalAmount: 1000,
      invoiceAmount: 0,
    });
    expect(result).not.toBeNull();
    expect(result?.declared).toBe(0);
    expect(result?.diff).toBe(-1000);
    expect(result?.isDivergent).toBe(true);
  });
});
