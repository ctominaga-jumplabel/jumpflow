import { describe, expect, it } from "vitest";
import {
  addDays,
  buildWeekDays,
  isoWeekNumber,
  parseIsoDateUtc,
  parseWeekParam,
  startOfUtcDay,
  toIsoDate,
  weekLabel,
  weekStartOf,
} from "./week";

describe("parseIsoDateUtc", () => {
  it("parses a valid date at midnight UTC", () => {
    const date = parseIsoDateUtc("2026-06-10");
    expect(date?.toISOString()).toBe("2026-06-10T00:00:00.000Z");
  });

  it("rejects malformed strings", () => {
    expect(parseIsoDateUtc("10/06/2026")).toBeNull();
    expect(parseIsoDateUtc("2026-6-1")).toBeNull();
    expect(parseIsoDateUtc("")).toBeNull();
  });

  it("rejects impossible dates", () => {
    expect(parseIsoDateUtc("2026-02-30")).toBeNull();
    expect(parseIsoDateUtc("2026-13-01")).toBeNull();
  });
});

describe("weekStartOf", () => {
  it("returns the same Monday for every day of the week", () => {
    // 2026-06-08 is a Monday.
    for (let i = 0; i < 7; i += 1) {
      const day = addDays(parseIsoDateUtc("2026-06-08")!, i);
      expect(toIsoDate(weekStartOf(day))).toBe("2026-06-08");
    }
  });

  it("normalizes any time-of-day to midnight UTC", () => {
    const wednesdayAfternoon = new Date("2026-06-10T15:30:45.123Z");
    expect(weekStartOf(wednesdayAfternoon).toISOString()).toBe(
      "2026-06-08T00:00:00.000Z",
    );
  });

  it("crosses month and year boundaries", () => {
    // 2026-01-01 is a Thursday: its week starts Monday 2025-12-29.
    expect(toIsoDate(weekStartOf(parseIsoDateUtc("2026-01-01")!))).toBe(
      "2025-12-29",
    );
    // 2026-07-01 is a Wednesday: week starts in June.
    expect(toIsoDate(weekStartOf(parseIsoDateUtc("2026-07-01")!))).toBe(
      "2026-06-29",
    );
  });
});

describe("addDays / startOfUtcDay", () => {
  it("adds days across month boundaries at midnight UTC", () => {
    const result = addDays(parseIsoDateUtc("2026-06-30")!, 1);
    expect(result.toISOString()).toBe("2026-07-01T00:00:00.000Z");
  });

  it("normalizes before adding", () => {
    const result = addDays(new Date("2026-06-08T23:59:59.999Z"), 7);
    expect(result.toISOString()).toBe("2026-06-15T00:00:00.000Z");
  });

  it("startOfUtcDay keeps the UTC calendar day", () => {
    expect(startOfUtcDay(new Date("2026-06-10T23:59:59.999Z")).toISOString()).toBe(
      "2026-06-10T00:00:00.000Z",
    );
  });
});

describe("isoWeekNumber", () => {
  it("matches known ISO weeks", () => {
    expect(isoWeekNumber(parseIsoDateUtc("2026-06-08")!)).toBe(24);
    expect(isoWeekNumber(parseIsoDateUtc("2026-01-01")!)).toBe(1);
    // 2026-12-31 is a Thursday in ISO week 53.
    expect(isoWeekNumber(parseIsoDateUtc("2026-12-31")!)).toBe(53);
  });
});

describe("weekLabel", () => {
  it("matches the established label format within a month", () => {
    expect(weekLabel(parseIsoDateUtc("2026-06-08")!)).toBe(
      "Semana 24 · 08–14 jun 2026",
    );
  });

  it("includes both months for cross-month weeks", () => {
    expect(weekLabel(parseIsoDateUtc("2026-06-29")!)).toBe(
      "Semana 27 · 29 jun–05 jul 2026",
    );
  });
});

describe("buildWeekDays", () => {
  it("builds 7 days Mon→Sun with weekend flags", () => {
    const days = buildWeekDays(parseIsoDateUtc("2026-06-08")!);
    expect(days).toHaveLength(7);
    expect(days[0]).toEqual({ label: "Seg", date: "2026-06-08", weekend: false });
    expect(days[5]).toEqual({ label: "Sáb", date: "2026-06-13", weekend: true });
    expect(days[6]).toEqual({ label: "Dom", date: "2026-06-14", weekend: true });
  });
});

describe("parseWeekParam", () => {
  const today = new Date("2026-06-10T12:00:00Z");

  it("falls back to the current week when absent or invalid", () => {
    expect(toIsoDate(parseWeekParam(undefined, today))).toBe("2026-06-08");
    expect(toIsoDate(parseWeekParam("nope", today))).toBe("2026-06-08");
  });

  it("snaps any day to its Monday", () => {
    expect(toIsoDate(parseWeekParam("2026-06-14", today))).toBe("2026-06-08");
    expect(toIsoDate(parseWeekParam("2026-06-15", today))).toBe("2026-06-15");
  });

  it("uses the first value when the param repeats", () => {
    expect(toIsoDate(parseWeekParam(["2026-06-01", "2026-06-15"], today))).toBe(
      "2026-06-01",
    );
  });
});
