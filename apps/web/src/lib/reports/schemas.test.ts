import { describe, expect, it } from "vitest";
import {
  consolidatedReportFilterSchema,
  EXPENSE_STAGE_STATUSES,
  expensesReportFilterSchema,
  hoursReportFilterSchema,
  resolveConsolidatedRange,
} from "./schemas";

describe("hoursReportFilterSchema", () => {
  it("accepts an empty object (all filters optional)", () => {
    const parsed = hoursReportFilterSchema.parse({});
    expect(parsed).toEqual({});
  });

  it("treats ALL and empty string as absent", () => {
    const parsed = hoursReportFilterSchema.parse({
      clientId: "ALL",
      projectId: "",
      consultantId: "  ",
    });
    expect(parsed.clientId).toBeUndefined();
    expect(parsed.projectId).toBeUndefined();
    expect(parsed.consultantId).toBeUndefined();
  });

  it("rejects to < from (INVALID_INPUT)", () => {
    const result = hoursReportFilterSchema.safeParse({
      from: "2026-06-10",
      to: "2026-06-01",
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0].path).toEqual(["to"]);
    }
  });

  it("accepts to === from", () => {
    const result = hoursReportFilterSchema.safeParse({
      from: "2026-06-10",
      to: "2026-06-10",
    });
    expect(result.success).toBe(true);
  });

  it("rejects an impossible date", () => {
    expect(
      hoursReportFilterSchema.safeParse({ from: "2026-02-30" }).success,
    ).toBe(false);
  });

  it("rejects a status outside the hours enum", () => {
    expect(
      hoursReportFilterSchema.safeParse({ status: "PAID" }).success,
    ).toBe(false);
    expect(
      hoursReportFilterSchema.safeParse({ status: "APPROVED" }).success,
    ).toBe(true);
  });

  it("rejects an unknown activity type", () => {
    expect(
      hoursReportFilterSchema.safeParse({ activityType: "NAP" }).success,
    ).toBe(false);
    expect(
      hoursReportFilterSchema.safeParse({ activityType: "MEETING" }).success,
    ).toBe(true);
  });
});

describe("expensesReportFilterSchema", () => {
  it("rejects a status outside the expense chain", () => {
    expect(
      expensesReportFilterSchema.safeParse({ status: "CLOSED" }).success,
    ).toBe(false);
    expect(
      expensesReportFilterSchema.safeParse({ status: "PAID" }).success,
    ).toBe(true);
  });

  it("accepts a valid pipeline stage", () => {
    for (const stage of ["GESTOR", "FINANCEIRO", "PAGAMENTO", "FINALIZADA"]) {
      expect(
        expensesReportFilterSchema.safeParse({ stage }).success,
      ).toBe(true);
    }
    expect(
      expensesReportFilterSchema.safeParse({ stage: "OUTRO" }).success,
    ).toBe(false);
  });

  it("maps each stage to the correct status set", () => {
    expect(EXPENSE_STAGE_STATUSES.GESTOR).toEqual([
      "SUBMITTED",
      "MANAGER_REJECTED",
    ]);
    expect(EXPENSE_STAGE_STATUSES.FINANCEIRO).toEqual([
      "MANAGER_APPROVED",
      "FINANCE_REJECTED",
    ]);
    expect(EXPENSE_STAGE_STATUSES.PAGAMENTO).toEqual([
      "FINANCE_APPROVED",
      "PAYMENT_SCHEDULED",
    ]);
    expect(EXPENSE_STAGE_STATUSES.FINALIZADA).toEqual(["PAID"]);
  });
});

describe("consolidatedReportFilterSchema + resolveConsolidatedRange", () => {
  it("expands month to the UTC month range", () => {
    const parsed = consolidatedReportFilterSchema.parse({ month: "2026-02" });
    const range = resolveConsolidatedRange(parsed);
    // 2026 is not a leap year => February has 28 days.
    expect(range).toEqual({ from: "2026-02-01", to: "2026-02-28" });
  });

  it("expands a leap-year February to 29 days", () => {
    const parsed = consolidatedReportFilterSchema.parse({ month: "2024-02" });
    expect(resolveConsolidatedRange(parsed)).toEqual({
      from: "2024-02-01",
      to: "2024-02-29",
    });
  });

  it("falls back to explicit from/to when no month", () => {
    const parsed = consolidatedReportFilterSchema.parse({
      from: "2026-06-01",
      to: "2026-06-30",
    });
    expect(resolveConsolidatedRange(parsed)).toEqual({
      from: "2026-06-01",
      to: "2026-06-30",
    });
  });

  it("rejects a malformed month", () => {
    expect(
      consolidatedReportFilterSchema.safeParse({ month: "2026-13" }).success,
    ).toBe(false);
    expect(
      consolidatedReportFilterSchema.safeParse({ month: "2026-00" }).success,
    ).toBe(false);
    expect(
      consolidatedReportFilterSchema.safeParse({ month: "26-1" }).success,
    ).toBe(false);
  });
});
