import { describe, expect, it } from "vitest";
import {
  computeHoursFromClock,
  normalizeBreak,
  parseClockMinutes,
  validateClockTimes,
} from "./time-clock";

describe("parseClockMinutes", () => {
  it("parses HH:mm into minutes since midnight", () => {
    expect(parseClockMinutes("00:00")).toBe(0);
    expect(parseClockMinutes("09:30")).toBe(570);
    expect(parseClockMinutes("23:59")).toBe(1439);
  });

  it("returns null for malformed or out-of-range values", () => {
    expect(parseClockMinutes("24:00")).toBeNull();
    expect(parseClockMinutes("9:30")).toBeNull();
    expect(parseClockMinutes("12:60")).toBeNull();
    expect(parseClockMinutes("")).toBeNull();
    expect(parseClockMinutes(null)).toBeNull();
  });
});

describe("validateClockTimes", () => {
  it("computes worked hours discounting the break", () => {
    const result = validateClockTimes({
      startTime: "09:00",
      endTime: "18:00",
      breakStart: "12:00",
      breakEnd: "13:00",
    });
    expect(result).toEqual({ ok: true, hours: 8, hasBreak: true });
  });

  it("computes worked hours without a break", () => {
    const result = validateClockTimes({
      startTime: "09:00",
      endTime: "15:30",
      breakStart: null,
      breakEnd: null,
    });
    expect(result).toEqual({ ok: true, hours: 6.5, hasBreak: false });
  });

  it("rejects end before or equal to start", () => {
    expect(
      validateClockTimes({ startTime: "18:00", endTime: "09:00" }).ok,
    ).toBe(false);
    expect(
      validateClockTimes({ startTime: "09:00", endTime: "09:00" }).ok,
    ).toBe(false);
  });

  it("rejects only one side of the break", () => {
    expect(
      validateClockTimes({
        startTime: "09:00",
        endTime: "18:00",
        breakStart: "12:00",
        breakEnd: null,
      }).ok,
    ).toBe(false);
  });

  it("rejects a break outside the worked interval or inverted", () => {
    expect(
      validateClockTimes({
        startTime: "09:00",
        endTime: "18:00",
        breakStart: "08:00",
        breakEnd: "08:30",
      }).ok,
    ).toBe(false);
    expect(
      validateClockTimes({
        startTime: "09:00",
        endTime: "18:00",
        breakStart: "13:00",
        breakEnd: "12:00",
      }).ok,
    ).toBe(false);
  });

  it("rejects a break that swallows the whole interval", () => {
    expect(
      validateClockTimes({
        startTime: "09:00",
        endTime: "10:00",
        breakStart: "09:00",
        breakEnd: "10:00",
      }).ok,
    ).toBe(false);
  });
});

describe("computeHoursFromClock", () => {
  it("returns the worked hours for a valid clock", () => {
    expect(
      computeHoursFromClock({
        startTime: "08:00",
        endTime: "17:00",
        breakStart: "12:00",
        breakEnd: "13:00",
      }),
    ).toBe(8);
  });

  it("throws on invalid clock times", () => {
    expect(() =>
      computeHoursFromClock({ startTime: "18:00", endTime: "09:00" }),
    ).toThrow();
  });
});

describe("normalizeBreak", () => {
  it("treats blank break fields as no break", () => {
    expect(normalizeBreak("", "  ")).toEqual({ breakStart: null, breakEnd: null });
    expect(normalizeBreak(null, null)).toEqual({
      breakStart: null,
      breakEnd: null,
    });
  });

  it("trims and keeps provided break fields", () => {
    expect(normalizeBreak(" 12:00 ", "13:00")).toEqual({
      breakStart: "12:00",
      breakEnd: "13:00",
    });
  });
});
