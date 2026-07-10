import { describe, expect, it } from "vitest";
import {
  collectProjectHolidays,
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

describe("collectProjectHolidays (weekly trigger, Onda A-ext/fix2)", () => {
  // Semana visível Mon→Sun (Seg 08 .. Dom 14 jun 2026). No modo semanal o
  // formulário mapeia weekday i+1 -> days[i].date; aqui simulamos as datas já
  // resolvidas para os dias-da-semana marcados.
  const weekDates = [
    "2026-06-08", // Seg
    "2026-06-09", // Ter
    "2026-06-10", // Qua (global)
    "2026-06-11", // Qui (proj-atlas)
    "2026-06-12", // Sex
  ];

  it("collects both a GLOBAL and a project-scoped holiday within the selected days", () => {
    const hits = collectProjectHolidays(lookup, "proj-atlas", weekDates);
    expect(hits).toEqual([
      { date: "2026-06-10", name: "Feriado Nacional" },
      { date: "2026-06-11", name: "Folga do Cliente" },
    ]);
  });

  it("omits the project-scoped holiday for a project without the link", () => {
    const hits = collectProjectHolidays(lookup, "proj-orion", weekDates);
    // Só o global permanece; a folga de proj-atlas não atinge proj-orion.
    expect(hits).toEqual([{ date: "2026-06-10", name: "Feriado Nacional" }]);
  });

  it("returns empty when no selected day is a holiday", () => {
    const hits = collectProjectHolidays(lookup, "proj-atlas", [
      "2026-06-08",
      "2026-06-09",
      "2026-06-12",
    ]);
    expect(hits).toEqual([]);
  });

  it("dedupes repeated dates and tolerates an empty lookup", () => {
    expect(
      collectProjectHolidays(lookup, "proj-atlas", [
        "2026-06-10",
        "2026-06-10",
      ]),
    ).toEqual([{ date: "2026-06-10", name: "Feriado Nacional" }]);
    expect(
      collectProjectHolidays(EMPTY_HOLIDAY_LOOKUP, "proj-atlas", weekDates),
    ).toEqual([]);
  });

  it("feeds the WORKDAY confirmation trigger for weekly entries", () => {
    const hits = collectProjectHolidays(lookup, "proj-atlas", weekDates);
    // Espelha o form: WORKDAY + >=1 data-feriado => confirmação.
    expect(needsWorkdayHolidayConfirmation("WORKDAY", hits[0]?.name)).toBe(true);
    // Atividade não-WORKDAY nunca confirma, mesmo com datas-feriado.
    expect(needsWorkdayHolidayConfirmation("VACATION", hits[0]?.name)).toBe(
      false,
    );
  });
});
