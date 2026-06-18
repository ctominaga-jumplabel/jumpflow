import { describe, expect, it } from "vitest";
import { signedHourBankHours } from "./hour-bank";

describe("signedHourBankHours", () => {
  it("OVERTIME is always a credit (positive)", () => {
    expect(signedHourBankHours("OVERTIME", 8)).toBe(8);
    expect(signedHourBankHours("OVERTIME", -8)).toBe(8);
  });

  it("COMPENSATION is always a debit (negative)", () => {
    expect(signedHourBankHours("COMPENSATION", 4)).toBe(-4);
    expect(signedHourBankHours("COMPENSATION", -4)).toBe(-4);
  });

  it("ADJUSTMENT keeps the entered sign (can reduce the balance)", () => {
    expect(signedHourBankHours("ADJUSTMENT", 2)).toBe(2);
    expect(signedHourBankHours("ADJUSTMENT", -2)).toBe(-2);
  });

  it("balance is the sum of signed entries", () => {
    const entries: Array<["OVERTIME" | "COMPENSATION" | "ADJUSTMENT", number]> =
      [
        ["OVERTIME", 8],
        ["COMPENSATION", 3],
        ["ADJUSTMENT", -1],
      ];
    const balance = entries.reduce(
      (sum, [kind, hours]) => sum + signedHourBankHours(kind, hours),
      0,
    );
    expect(balance).toBe(4); // +8 - 3 - 1
  });
});
