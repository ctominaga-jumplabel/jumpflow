import { describe, expect, it } from "vitest";
import {
  EMPTY_HOLIDAY_LOOKUP,
  needsWorkdayHolidayConfirmation,
  resolveGlobalHoliday,
  resolveProjectHoliday,
  type HolidayLookup,
} from "./holidays";

const lookup: HolidayLookup = {
  global: { "2026-06-10": "Feriado Nacional" },
  byProject: {
    "proj-atlas": { "2026-06-11": "Folga do Cliente" },
  },
};

describe("resolveProjectHoliday", () => {
  it("resolves a GLOBAL holiday for any project", () => {
    expect(resolveProjectHoliday(lookup, "proj-atlas", "2026-06-10")).toBe(
      "Feriado Nacional",
    );
    expect(resolveProjectHoliday(lookup, "proj-orion", "2026-06-10")).toBe(
      "Feriado Nacional",
    );
  });

  it("resolves a project-scoped holiday ONLY for the linked project", () => {
    expect(resolveProjectHoliday(lookup, "proj-atlas", "2026-06-11")).toBe(
      "Folga do Cliente",
    );
    expect(
      resolveProjectHoliday(lookup, "proj-orion", "2026-06-11"),
    ).toBeUndefined();
  });

  it("returns undefined for non-holiday dates or empty lookup", () => {
    expect(
      resolveProjectHoliday(lookup, "proj-atlas", "2026-06-09"),
    ).toBeUndefined();
    expect(
      resolveProjectHoliday(EMPTY_HOLIDAY_LOOKUP, "proj-atlas", "2026-06-10"),
    ).toBeUndefined();
    expect(
      resolveProjectHoliday(undefined, "proj-atlas", "2026-06-10"),
    ).toBeUndefined();
  });

  it("prefers the project-specific name when both global and scoped exist", () => {
    const both: HolidayLookup = {
      global: { "2026-06-11": "Global" },
      byProject: { "proj-atlas": { "2026-06-11": "Escopo" } },
    };
    expect(resolveProjectHoliday(both, "proj-atlas", "2026-06-11")).toBe(
      "Escopo",
    );
    expect(resolveProjectHoliday(both, "proj-orion", "2026-06-11")).toBe(
      "Global",
    );
  });
});

describe("resolveGlobalHoliday", () => {
  it("only sees global holidays (ignores project scope)", () => {
    expect(resolveGlobalHoliday(lookup, "2026-06-10")).toBe("Feriado Nacional");
    expect(resolveGlobalHoliday(lookup, "2026-06-11")).toBeUndefined();
  });
});

describe("needsWorkdayHolidayConfirmation", () => {
  it("triggers only for WORKDAY on a holiday date", () => {
    expect(needsWorkdayHolidayConfirmation("WORKDAY", "Natal")).toBe(true);
  });

  it("does not trigger for WORKDAY off a holiday", () => {
    expect(needsWorkdayHolidayConfirmation("WORKDAY", undefined)).toBe(false);
  });

  it("does not trigger for non-WORKDAY activities even on a holiday", () => {
    expect(needsWorkdayHolidayConfirmation("VACATION", "Natal")).toBe(false);
    expect(needsWorkdayHolidayConfirmation("DAY_OFF", "Natal")).toBe(false);
    expect(needsWorkdayHolidayConfirmation("ON_CALL", "Natal")).toBe(false);
  });
});
