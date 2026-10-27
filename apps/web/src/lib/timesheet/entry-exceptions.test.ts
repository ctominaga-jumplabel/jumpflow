import { describe, expect, it } from "vitest";
import {
  formatEntryExceptions,
  getEntryExceptions,
  summarizeEntryExceptions,
  weekdayLabelPt,
} from "./entry-exceptions";
import type { HolidayLookup } from "./holidays";

const holidays: HolidayLookup = {
  global: { "2026-11-20": "Consciência Negra", "2026-11-15": "Proclamação da República" },
  byProject: { "proj-atlas": { "2026-11-23": "Folga do Cliente" } },
};

describe("getEntryExceptions", () => {
  it("returns nothing for a WORKDAY on a normal weekday", () => {
    // 2026-11-24 é terça-feira.
    expect(
      getEntryExceptions({ date: "2026-11-24", activityType: "WORKDAY", holidays }),
    ).toEqual([]);
  });

  it("flags Saturday and Sunday using UTC (no timezone drift)", () => {
    expect(
      getEntryExceptions({ date: "2026-11-21", activityType: "WORKDAY" }).map(
        (e) => [e.kind, e.label],
      ),
    ).toEqual([["WEEKEND", "Sábado"]]);
    expect(
      getEntryExceptions({
        date: "2026-11-22T00:00:00.000Z",
        activityType: "WORKDAY",
      })[0]?.label,
    ).toBe("Domingo");
  });

  it("flags a global holiday with its name", () => {
    const result = getEntryExceptions({
      date: "2026-11-20",
      activityType: "WORKDAY",
      holidays,
    });
    expect(result).toEqual([
      expect.objectContaining({ kind: "HOLIDAY", label: "Feriado: Consciência Negra" }),
    ]);
  });

  it("combines weekend + holiday + activity in a stable order", () => {
    // 2026-11-15 é domingo e feriado nacional.
    const result = getEntryExceptions({
      date: "2026-11-15",
      activityType: "ON_CALL",
      holidays,
    });
    expect(result.map((e) => e.kind)).toEqual(["WEEKEND", "HOLIDAY", "ACTIVITY"]);
    expect(formatEntryExceptions(result)).toBe(
      "Domingo; Feriado: Proclamação da República; Sobreaviso",
    );
  });

  it("respects project-linked holidays only when the project matches", () => {
    expect(
      getEntryExceptions({
        date: "2026-11-23",
        activityType: "WORKDAY",
        projectId: "proj-atlas",
        holidays,
      })[0],
    ).toMatchObject({ kind: "HOLIDAY", label: "Feriado: Folga do Cliente" });
    expect(
      getEntryExceptions({
        date: "2026-11-23",
        activityType: "WORKDAY",
        projectId: "proj-orion",
        holidays,
      }),
    ).toEqual([]);
    // Sem projeto: só feriados globais.
    expect(
      getEntryExceptions({ date: "2026-11-23", activityType: "WORKDAY", holidays }),
    ).toEqual([]);
  });

  it.each([
    ["ON_CALL", "Sobreaviso"],
    ["OVERTIME", "Hora Extra"],
    ["DAY_OFF", "Folga"],
    ["VACATION", "Férias"],
    ["LEAVE", "Licença"],
    ["ABSENCE", "Ausência / Falta"],
    ["PAID_ABSENCE", "Ausência Remunerada"],
    ["WAITING_PROJECT_START", "Aguardando início no projeto"],
  ])("flags non-standard activity %s", (activityType, label) => {
    expect(
      getEntryExceptions({ date: "2026-11-24", activityType }),
    ).toEqual([expect.objectContaining({ kind: "ACTIVITY", label })]);
  });

  it("does not flag legacy work activities", () => {
    expect(
      getEntryExceptions({ date: "2026-11-24", activityType: "DEVELOPMENT" }),
    ).toEqual([]);
  });

  it("flags overtime hours on a workday, without duplicating an OVERTIME entry", () => {
    expect(
      getEntryExceptions({ date: "2026-11-24", activityType: "WORKDAY", overtimeHours: 2 }),
    ).toEqual([
      expect.objectContaining({ kind: "ACTIVITY", label: "Hora Extra", detail: "2h acima do padrão do dia" }),
    ]);
    expect(
      getEntryExceptions({ date: "2026-11-24", activityType: "OVERTIME", overtimeHours: 2 }),
    ).toHaveLength(1);
  });

  it("ignores invalid dates without throwing", () => {
    expect(getEntryExceptions({ date: "", activityType: "WORKDAY" })).toEqual([]);
  });
});

describe("weekdayLabelPt", () => {
  it("returns the pt-BR weekday in UTC", () => {
    expect(weekdayLabelPt("2026-11-21")).toBe("Sábado");
    expect(weekdayLabelPt("2026-11-24")).toBe("Terça");
    expect(weekdayLabelPt("bad")).toBe("");
  });
});

describe("summarizeEntryExceptions", () => {
  it("counts flagged entries and lists dates in order, deduplicating labels", () => {
    const sat = getEntryExceptions({ date: "2026-11-21", activityType: "WORKDAY" });
    const satOnCall = getEntryExceptions({ date: "2026-11-21", activityType: "ON_CALL" });
    const hol = getEntryExceptions({ date: "2026-11-20", activityType: "WORKDAY", holidays });
    const summary = summarizeEntryExceptions([
      { date: "2026-11-21", exceptions: sat },
      { date: "2026-11-24", exceptions: [] },
      { date: "2026-11-21", exceptions: satOnCall },
      { date: "2026-11-20", exceptions: hol },
    ]);
    expect(summary.count).toBe(3);
    expect(summary.lines).toEqual([
      "20/11 (Sex): Feriado: Consciência Negra",
      "21/11 (Sáb): Sábado; Sobreaviso",
    ]);
  });
});
