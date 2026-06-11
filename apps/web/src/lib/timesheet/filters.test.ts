import { describe, expect, it } from "vitest";
import {
  hasActiveTimesheetFilter,
  parseTimesheetFilter,
  timesheetFilterSchema,
} from "./filters";

describe("timesheetFilterSchema", () => {
  it("accepts an empty object (all filters optional)", () => {
    expect(timesheetFilterSchema.parse({})).toEqual({});
  });

  it("treats ALL and blank as absent", () => {
    const parsed = timesheetFilterSchema.parse({
      projectId: "",
      activity: "ALL",
      status: "   ",
    });
    expect(parsed.projectId).toBeUndefined();
    expect(parsed.activity).toBeUndefined();
    expect(parsed.status).toBeUndefined();
  });

  it("accepts canonical activity and rejects legacy/unknown", () => {
    expect(timesheetFilterSchema.safeParse({ activity: "WORKDAY" }).success).toBe(
      true,
    );
    expect(timesheetFilterSchema.safeParse({ activity: "ON_CALL" }).success).toBe(
      true,
    );
    // Legacy value is no longer in the canonical catalog.
    expect(
      timesheetFilterSchema.safeParse({ activity: "DEVELOPMENT" }).success,
    ).toBe(false);
    expect(timesheetFilterSchema.safeParse({ activity: "NOPE" }).success).toBe(
      false,
    );
  });

  it("validates the entry status enum", () => {
    expect(timesheetFilterSchema.safeParse({ status: "APPROVED" }).success).toBe(
      true,
    );
    expect(timesheetFilterSchema.safeParse({ status: "PAID" }).success).toBe(
      false,
    );
  });

  it("validates the project status enum", () => {
    expect(
      timesheetFilterSchema.safeParse({ projectStatus: "PAUSED" }).success,
    ).toBe(true);
    expect(
      timesheetFilterSchema.safeParse({ projectStatus: "WRONG" }).success,
    ).toBe(false);
  });

  it("coerces billable true/false and treats blank/ALL as undefined", () => {
    expect(timesheetFilterSchema.parse({ billable: "true" }).billable).toBe(
      true,
    );
    expect(timesheetFilterSchema.parse({ billable: "false" }).billable).toBe(
      false,
    );
    expect(timesheetFilterSchema.parse({ billable: "" }).billable).toBeUndefined();
    expect(
      timesheetFilterSchema.parse({ billable: "ALL" }).billable,
    ).toBeUndefined();
    // An unexpected value falls through to the boolean validator and fails.
    expect(timesheetFilterSchema.safeParse({ billable: "1" }).success).toBe(
      false,
    );
  });

  it("whitelists the sort field; an injection-ish value is rejected", () => {
    expect(timesheetFilterSchema.parse({ sort: "activity" }).sort).toBe(
      "activity",
    );
    expect(timesheetFilterSchema.parse({ sort: "date" }).sort).toBe("date");
    expect(
      timesheetFilterSchema.safeParse({ sort: "id; DROP TABLE" }).success,
    ).toBe(false);
    // `hours` is a reports sort, not a horas-grid sort.
    expect(timesheetFilterSchema.safeParse({ sort: "hours" }).success).toBe(
      false,
    );
  });

  it("validates direction enum", () => {
    expect(timesheetFilterSchema.parse({ direction: "asc" }).direction).toBe(
      "asc",
    );
    expect(timesheetFilterSchema.parse({ direction: "desc" }).direction).toBe(
      "desc",
    );
    expect(
      timesheetFilterSchema.safeParse({ direction: "sideways" }).success,
    ).toBe(false);
  });
});

describe("parseTimesheetFilter (safe fallback)", () => {
  it("drops the whole filter on an invalid value (page never throws)", () => {
    // `semana` is not part of the filter; an invalid sort drops to defaults.
    expect(parseTimesheetFilter({ semana: "2026-06-08" })).toEqual({});
    expect(parseTimesheetFilter({ sort: "bogus" })).toEqual({});
  });

  it("keeps valid values and ignores unrelated params", () => {
    const filter = parseTimesheetFilter({
      semana: "2026-06-08",
      status: "DRAFT",
      activity: "WORKDAY",
      billable: "true",
      sort: "status",
      direction: "desc",
    });
    expect(filter).toEqual({
      status: "DRAFT",
      activity: "WORKDAY",
      billable: true,
      sort: "status",
      direction: "desc",
    });
  });

  it("reads the first value of a repeated query param", () => {
    const filter = parseTimesheetFilter({ status: ["DRAFT", "APPROVED"] });
    expect(filter.status).toBe("DRAFT");
  });
});

describe("hasActiveTimesheetFilter", () => {
  it("is false for empty / only-ordering filters", () => {
    expect(hasActiveTimesheetFilter({})).toBe(false);
    expect(hasActiveTimesheetFilter({ sort: "date", direction: "desc" })).toBe(
      false,
    );
  });

  it("is true when a reducing filter is set", () => {
    expect(hasActiveTimesheetFilter({ status: "DRAFT" })).toBe(true);
    expect(hasActiveTimesheetFilter({ billable: false })).toBe(true);
    expect(hasActiveTimesheetFilter({ projectStatus: "ACTIVE" })).toBe(true);
  });
});
