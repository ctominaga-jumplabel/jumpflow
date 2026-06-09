import { describe, expect, it } from "vitest";
import {
  formatCurrency,
  formatCurrencyPrecise,
  formatDate,
  formatHours,
  formatMonth,
  formatPercent,
} from "@/lib/format";

describe("format helpers", () => {
  it("formats whole and fractional hours", () => {
    expect(formatHours(186)).toBe("186h");
    expect(formatHours(8.5)).toBe("8,5h");
    expect(formatHours(0)).toBe("0h");
  });

  it("formats percentages as rounded integers", () => {
    expect(formatPercent(95)).toBe("95%");
    expect(formatPercent(120.4)).toBe("120%");
  });

  it("formats month/year labels", () => {
    expect(formatMonth(5, 2026)).toBe("Maio/2026");
    expect(formatMonth(12, 2026)).toBe("Dezembro/2026");
  });

  it("clamps out-of-range months", () => {
    expect(formatMonth(0, 2026)).toBe("Janeiro/2026");
    expect(formatMonth(13, 2026)).toBe("Dezembro/2026");
  });

  it("formats ISO dates as dd/mm/yyyy", () => {
    expect(formatDate("2026-06-09")).toBe("09/06/2026");
  });

  it("formats BRL currency with and without decimals", () => {
    // Non-breaking space is used by Intl; assert on the meaningful parts.
    expect(formatCurrency(48000)).toContain("48.000");
    expect(formatCurrencyPrecise(320)).toContain("320,00");
  });
});
