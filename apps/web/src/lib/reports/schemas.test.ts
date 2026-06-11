import { describe, expect, it } from "vitest";
import {
  consolidatedReportFilterSchema,
  EXPENSE_STAGE_STATUSES,
  expensesReportFilterSchema,
  hoursReportFilterSchema,
  resolveConsolidatedRange,
  resolveDetailRange,
  resolvePeriodPreset,
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

  it("rejects an unknown activity type, accepts a canonical one", () => {
    expect(
      hoursReportFilterSchema.safeParse({ activityType: "NAP" }).success,
    ).toBe(false);
    // Legacy values are no longer in the canonical catalog (4.2).
    expect(
      hoursReportFilterSchema.safeParse({ activityType: "MEETING" }).success,
    ).toBe(false);
    expect(
      hoursReportFilterSchema.safeParse({ activityType: "WORKDAY" }).success,
    ).toBe(true);
  });

  it("coerces billable true/false and treats blank/ALL as undefined", () => {
    expect(hoursReportFilterSchema.parse({ billable: "true" }).billable).toBe(
      true,
    );
    expect(hoursReportFilterSchema.parse({ billable: "false" }).billable).toBe(
      false,
    );
    expect(
      hoursReportFilterSchema.parse({ billable: "" }).billable,
    ).toBeUndefined();
    expect(
      hoursReportFilterSchema.parse({ billable: "ALL" }).billable,
    ).toBeUndefined();
    // An unexpected value falls through to the boolean validator and fails.
    expect(hoursReportFilterSchema.safeParse({ billable: "1" }).success).toBe(
      false,
    );
  });

  it("validates client/project/consultant status enums", () => {
    expect(
      hoursReportFilterSchema.safeParse({ clientStatus: "ACTIVE" }).success,
    ).toBe(true);
    expect(
      hoursReportFilterSchema.safeParse({ clientStatus: "ON_LEAVE" }).success,
    ).toBe(false); // ON_LEAVE is only valid for consultants
    expect(
      hoursReportFilterSchema.safeParse({ projectStatus: "PAUSED" }).success,
    ).toBe(true);
    expect(
      hoursReportFilterSchema.safeParse({ projectStatus: "WRONG" }).success,
    ).toBe(false);
    expect(
      hoursReportFilterSchema.safeParse({ consultantStatus: "ON_LEAVE" })
        .success,
    ).toBe(true);
  });

  it("whitelists the hours sort field; an invalid value is rejected (anti-injection)", () => {
    expect(hoursReportFilterSchema.parse({ sort: "hours" }).sort).toBe("hours");
    // A SQL-ish column never reaches the schema as a valid value.
    expect(
      hoursReportFilterSchema.safeParse({ sort: "id; DROP TABLE" }).success,
    ).toBe(false);
    // `amount` belongs to expenses, not hours.
    expect(hoursReportFilterSchema.safeParse({ sort: "amount" }).success).toBe(
      false,
    );
  });

  it("validates direction enum", () => {
    expect(hoursReportFilterSchema.parse({ direction: "asc" }).direction).toBe(
      "asc",
    );
    expect(hoursReportFilterSchema.parse({ direction: "desc" }).direction).toBe(
      "desc",
    );
    expect(
      hoursReportFilterSchema.safeParse({ direction: "sideways" }).success,
    ).toBe(false);
  });

  it("coerces page (>=1) and only accepts whitelisted page sizes", () => {
    expect(hoursReportFilterSchema.parse({ page: "3" }).page).toBe(3);
    expect(hoursReportFilterSchema.safeParse({ page: "0" }).success).toBe(false);
    expect(hoursReportFilterSchema.safeParse({ page: "-1" }).success).toBe(
      false,
    );
    for (const size of [25, 50, 100]) {
      expect(
        hoursReportFilterSchema.parse({ pageSize: String(size) }).pageSize,
      ).toBe(size);
    }
    expect(hoursReportFilterSchema.safeParse({ pageSize: "10" }).success).toBe(
      false,
    );
    expect(hoursReportFilterSchema.safeParse({ pageSize: "200" }).success).toBe(
      false,
    );
  });

  it("validates the period preset enum", () => {
    for (const period of ["mes-atual", "mes-anterior", "ano-atual", "custom"]) {
      expect(hoursReportFilterSchema.safeParse({ period }).success).toBe(true);
    }
    expect(
      hoursReportFilterSchema.safeParse({ period: "decada" }).success,
    ).toBe(false);
  });
});

describe("expensesReportFilterSchema sort whitelist", () => {
  it("accepts amount for expenses but not for hours", () => {
    expect(expensesReportFilterSchema.parse({ sort: "amount" }).sort).toBe(
      "amount",
    );
    expect(
      expensesReportFilterSchema.safeParse({ sort: "hours" }).success,
    ).toBe(false);
  });
});

describe("resolvePeriodPreset (pure, injected date)", () => {
  const june11 = new Date(Date.UTC(2026, 5, 11));

  it("mes-atual expands to the current month", () => {
    expect(resolvePeriodPreset("mes-atual", june11)).toEqual({
      from: "2026-06-01",
      to: "2026-06-30",
    });
  });

  it("mes-anterior expands to the previous month (crossing the year on Jan)", () => {
    expect(resolvePeriodPreset("mes-anterior", june11)).toEqual({
      from: "2026-05-01",
      to: "2026-05-31",
    });
    const jan = new Date(Date.UTC(2026, 0, 15));
    expect(resolvePeriodPreset("mes-anterior", jan)).toEqual({
      from: "2025-12-01",
      to: "2025-12-31",
    });
  });

  it("ano-atual expands to the full year", () => {
    expect(resolvePeriodPreset("ano-atual", june11)).toEqual({
      from: "2026-01-01",
      to: "2026-12-31",
    });
  });

  it("custom/undefined return an empty range (caller keeps from/to)", () => {
    expect(resolvePeriodPreset("custom", june11)).toEqual({});
    expect(resolvePeriodPreset(undefined, june11)).toEqual({});
  });

  it("resolveDetailRange: a known preset OVERRIDES explicit from/to", () => {
    expect(
      resolveDetailRange(
        { period: "mes-atual", from: "2020-01-01", to: "2020-01-31" },
        june11,
      ),
    ).toEqual({ from: "2026-06-01", to: "2026-06-30" });
  });

  it("resolveDetailRange: custom keeps the explicit from/to", () => {
    expect(
      resolveDetailRange(
        { period: "custom", from: "2026-03-01", to: "2026-03-31" },
        june11,
      ),
    ).toEqual({ from: "2026-03-01", to: "2026-03-31" });
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
