import { describe, expect, it } from "vitest";
import {
  addBusinessDays,
  businessDaysBetween,
  businessDaysOfMonth,
  computeStageDeadline,
  createBusinessCalendar,
  endOfDayInstant,
  formatDeadlineShort,
  isBusinessDay,
  isoDateInSaoPaulo,
  lastBusinessDayOfMonth,
  nthBusinessDayOfMonth,
  parseCompetenceKey,
  resolvePaymentDate,
  shiftCompetence,
  slaCalendarFromHolidays,
} from "./business-days";
import { SLA_STAGE_DEFAULTS, type SlaStageKeyName } from "./types";

const NATIONAL_2026 = [
  "2026-01-01",
  "2026-04-03",
  "2026-04-21",
  "2026-05-01",
  "2026-09-07",
  "2026-10-12",
  "2026-11-02",
  "2026-11-15",
  "2026-11-20",
  "2026-12-25",
].map((date) => ({ date, name: `Feriado ${date}`, scope: "NATIONAL" as const }));

const cal = slaCalendarFromHolidays(NATIONAL_2026, false);
const settings = { paymentDay: 16 };

describe("business days", () => {
  it("weekends and holidays are not business days", () => {
    expect(isBusinessDay("2026-10-31", cal)).toBe(false); // sabado
    expect(isBusinessDay("2026-11-02", cal)).toBe(false); // Finados (segunda)
    expect(isBusinessDay("2026-11-03", cal)).toBe(true);
  });

  it("calendar filter: state holidays only when enabled; city never", () => {
    const holidays = [
      { date: "2026-07-09", name: "Revolução Constitucionalista", scope: "STATE" as const },
      { date: "2026-01-25", name: "Aniversário de SP", scope: "CITY" as const },
    ];
    expect(slaCalendarFromHolidays(holidays, false).holidays.size).toBe(0);
    const withState = slaCalendarFromHolidays(holidays, true);
    expect(withState.holidays.has("2026-07-09")).toBe(true);
    expect(withState.holidays.has("2026-01-25")).toBe(false);
  });

  it("addBusinessDays skips weekends/holidays both ways; 0 is identity", () => {
    expect(addBusinessDays("2026-10-30", 1, cal)).toBe("2026-11-03"); // pula fds + Finados
    expect(addBusinessDays("2026-11-03", -1, cal)).toBe("2026-10-30");
    expect(addBusinessDays("2026-11-16", -5, cal)).toBe("2026-11-09");
    expect(addBusinessDays("2026-10-31", 0, cal)).toBe("2026-10-31");
  });

  it("nth business day of month handles a holiday on the 1st business Monday (Nov 2 2026)", () => {
    expect(nthBusinessDayOfMonth(2026, 11, 1, cal)).toBe("2026-11-03");
    expect(nthBusinessDayOfMonth(2026, 11, 4, cal)).toBe("2026-11-06");
    expect(nthBusinessDayOfMonth(2026, 11, 1, createBusinessCalendar())).toBe("2026-11-02");
    expect(() => nthBusinessDayOfMonth(2026, 11, 0, cal)).toThrow();
  });

  it("last business day across month boundaries", () => {
    expect(lastBusinessDayOfMonth(2026, 10, cal)).toBe("2026-10-30"); // 31 = sabado
    expect(lastBusinessDayOfMonth(2026, 11, cal)).toBe("2026-11-30");
    expect(lastBusinessDayOfMonth(2026, 12, cal)).toBe("2026-12-31");
  });

  it("businessDaysBetween counts (from, to] and is signed", () => {
    expect(businessDaysBetween("2026-11-06", "2026-11-09", cal)).toBe(1);
    expect(businessDaysBetween("2026-11-09", "2026-11-09", cal)).toBe(0);
    expect(businessDaysBetween("2026-11-09", "2026-11-06", cal)).toBe(-1);
    expect(businessDaysBetween("2026-10-30", "2026-11-03", cal)).toBe(1);
    expect(businessDaysBetween("2026-10-27", "2026-11-06", cal)).toBe(7);
  });

  it("counts business days of the month", () => {
    expect(businessDaysOfMonth(2026, 11, cal)).toHaveLength(19);
    expect(businessDaysOfMonth(2026, 10, cal)).toHaveLength(21);
  });
});

describe("payment date", () => {
  it("keeps the configured day when it is a business day", () => {
    expect(resolvePaymentDate({ year: 2026, month: 10 }, 16, cal)).toBe("2026-11-16");
  });

  it("anticipates to the previous business day on weekends", () => {
    expect(resolvePaymentDate({ year: 2026, month: 4 }, 16, cal)).toBe("2026-05-15"); // sab
    expect(resolvePaymentDate({ year: 2026, month: 7 }, 16, cal)).toBe("2026-08-14"); // dom
  });

  it("anticipates over a holiday + weekend (Nov 2 2026)", () => {
    expect(resolvePaymentDate({ year: 2026, month: 10 }, 2, cal)).toBe("2026-10-30");
    expect(resolvePaymentDate({ year: 2026, month: 10 }, 2, cal, "NEXT_BUSINESS_DAY")).toBe("2026-11-03");
  });

  it("clamps the day to the month length", () => {
    expect(resolvePaymentDate({ year: 2026, month: 1 }, 31, cal)).toBe("2026-02-27"); // 28 = sab
  });
});

function deadlinesFor(year: number, month: number, process: "HOURS_TO_BILLING" | "HOURS_TO_PAYMENT") {
  const out: Partial<Record<SlaStageKeyName, string>> = {};
  for (const stage of SLA_STAGE_DEFAULTS.filter((s) => s.process === process)) {
    out[stage.stageKey] = computeStageDeadline(stage, { year, month }, settings, cal);
  }
  return out;
}

describe("default stage deadlines", () => {
  it("competence Oct 2026 (Finados shifts the 1st business day to Nov 3)", () => {
    expect(deadlinesFor(2026, 10, "HOURS_TO_PAYMENT")).toEqual({
      TIMESHEET_SUBMISSION: "2026-10-30",
      MANAGER_APPROVAL: "2026-11-03",
      OPERATION_CLOSING: "2026-11-03",
      PEOPLE_PAYMENT_RELEASE: "2026-11-06",
      INVOICE_REQUEST: "2026-11-09",
      INVOICE_RECEIPT: "2026-11-12",
      PAYMENT: "2026-11-16",
    });
    expect(deadlinesFor(2026, 10, "HOURS_TO_BILLING").BILLING_RELEASE).toBe("2026-11-03");
  });

  it("competence Nov 2026", () => {
    expect(deadlinesFor(2026, 11, "HOURS_TO_PAYMENT")).toEqual({
      TIMESHEET_SUBMISSION: "2026-11-30",
      MANAGER_APPROVAL: "2026-12-01",
      OPERATION_CLOSING: "2026-12-01",
      PEOPLE_PAYMENT_RELEASE: "2026-12-04",
      INVOICE_REQUEST: "2026-12-09",
      INVOICE_RECEIPT: "2026-12-14",
      PAYMENT: "2026-12-16",
    });
  });
});

describe("time zone helpers", () => {
  it("deadline ends at 23:59:59.999 in Sao Paulo (02:59 UTC next day)", () => {
    expect(endOfDayInstant("2026-11-03").toISOString()).toBe("2026-11-04T02:59:59.999Z");
  });

  it("today in Sao Paulo differs from UTC late at night", () => {
    expect(isoDateInSaoPaulo(new Date("2026-11-04T01:00:00.000Z"))).toBe("2026-11-03");
  });

  it("formats dd/mm (weekday)", () => {
    expect(formatDeadlineShort("2026-11-03")).toBe("03/11 (ter)");
  });

  it("competence helpers", () => {
    expect(parseCompetenceKey("2026-10")).toEqual({ year: 2026, month: 10 });
    expect(parseCompetenceKey("2026-13")).toBeNull();
    expect(shiftCompetence({ year: 2026, month: 11 }, 3)).toEqual({ year: 2027, month: 2 });
    expect(shiftCompetence({ year: 2026, month: 2 }, -5)).toEqual({ year: 2025, month: 9 });
  });
});
