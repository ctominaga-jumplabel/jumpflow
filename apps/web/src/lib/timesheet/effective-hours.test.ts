import { describe, expect, it } from "vitest";
import { timeEntryEffectiveHours } from "./effective-hours";

describe("timeEntryEffectiveHours", () => {
  it("multiplies hours by the remuneration factor", () => {
    expect(timeEntryEffectiveHours(12, 0.33)).toBeCloseTo(3.96, 2);
    expect(timeEntryEffectiveHours(8, 1)).toBe(8);
  });

  it("is neutral for normal activities (multiplier 1.00)", () => {
    expect(timeEntryEffectiveHours(7.5, 1)).toBe(7.5);
  });

  it("rounds to 2 decimals", () => {
    expect(timeEntryEffectiveHours(10, 0.333)).toBe(3.33);
  });

  it("handles zero", () => {
    expect(timeEntryEffectiveHours(0, 0.5)).toBe(0);
  });
});
