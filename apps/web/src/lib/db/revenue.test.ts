import { describe, expect, it } from "vitest";
import { closingAverageRate, revenueClosingTransitions } from "./revenue";

describe("revenue closing helpers", () => {
  it("computes the weighted average hourly rate", () => {
    expect(closingAverageRate(10, 3500)).toBe(350);
    expect(closingAverageRate(0, 3500)).toBe(0);
  });

  it("keeps the closing lifecycle explicit and forward-only", () => {
    expect(revenueClosingTransitions.SUBMIT_REVIEW).toMatchObject({
      expected: "OPEN",
      next: "IN_REVIEW",
    });
    expect(revenueClosingTransitions.MARK_READY).toMatchObject({
      expected: "IN_REVIEW",
      next: "READY_TO_CLOSE",
    });
    expect(revenueClosingTransitions.CLOSE).toMatchObject({
      expected: "READY_TO_CLOSE",
      next: "CLOSED",
    });
    expect(revenueClosingTransitions.MARK_INVOICED).toMatchObject({
      expected: "CLOSED",
      next: "INVOICED",
    });
  });
});
