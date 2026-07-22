import { describe, expect, it } from "vitest";
import { isRevenueExceptionEntry } from "./period-exceptions";

describe("isRevenueExceptionEntry", () => {
  it("plain workday with no attachment is NOT an exception", () => {
    expect(
      isRevenueExceptionEntry({ activityType: "WORKDAY", hasAttachment: false }),
    ).toBe(false);
  });

  it("workday WITH an attachment is an exception", () => {
    expect(
      isRevenueExceptionEntry({ activityType: "WORKDAY", hasAttachment: true }),
    ).toBe(true);
  });

  it("non-workday activity is an exception even without attachment", () => {
    for (const activityType of [
      "VACATION",
      "LEAVE",
      "PAID_ABSENCE",
      "ON_CALL",
      "ABSENCE",
    ]) {
      expect(
        isRevenueExceptionEntry({ activityType, hasAttachment: false }),
      ).toBe(true);
    }
  });

  it("non-workday activity with attachment is still an exception", () => {
    expect(
      isRevenueExceptionEntry({ activityType: "ON_CALL", hasAttachment: true }),
    ).toBe(true);
  });
});
