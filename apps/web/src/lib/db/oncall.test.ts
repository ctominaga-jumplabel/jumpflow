import { describe, expect, it } from "vitest";
import { onCallEffectiveHours } from "./oncall";

describe("onCallEffectiveHours", () => {
  it("multiplies hours by the remuneration factor", () => {
    expect(onCallEffectiveHours(12, 0.33)).toBeCloseTo(3.96, 2);
    expect(onCallEffectiveHours(8, 1)).toBe(8);
  });

  it("rounds to 2 decimals", () => {
    expect(onCallEffectiveHours(10, 0.333)).toBe(3.33);
  });

  it("handles zero", () => {
    expect(onCallEffectiveHours(0, 0.5)).toBe(0);
  });
});
