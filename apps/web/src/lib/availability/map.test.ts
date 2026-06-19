import { describe, expect, it } from "vitest";
import {
  buildAvailabilityMap,
  buildWeeklyPeriods,
  classifyCell,
  countStatesForPeriod,
  rangesOverlap,
} from "./map";
import type {
  AvailabilityConsultantInput,
  AvailabilityPeriod,
} from "./types";

// Janela de referência: semana de 2026-06-15 (segunda) por 3 semanas.
const FROM = new Date(Date.UTC(2026, 5, 17)); // quarta 17/06 → snap p/ 15/06
const PERIODS = buildWeeklyPeriods(FROM, 3);

const consultant = (
  over: Partial<AvailabilityConsultantInput>,
): AvailabilityConsultantInput => ({
  id: "c1",
  name: "Ana",
  seniority: "Sênior",
  area: "Engenharia",
  jobTitle: "Dev",
  status: "ACTIVE",
  allocations: [],
  vacations: [],
  ...over,
});

describe("buildWeeklyPeriods", () => {
  it("snaps to Monday and produces N consecutive Mon→Sun windows", () => {
    expect(PERIODS).toHaveLength(3);
    expect(PERIODS[0].start).toBe("2026-06-15");
    expect(PERIODS[0].end).toBe("2026-06-21");
    expect(PERIODS[1].start).toBe("2026-06-22");
    expect(PERIODS[2].start).toBe("2026-06-29");
  });

  it("keys are stable Monday ISO dates", () => {
    expect(PERIODS.map((p) => p.key)).toEqual([
      "2026-06-15",
      "2026-06-22",
      "2026-06-29",
    ]);
  });

  it("never returns fewer than one period", () => {
    expect(buildWeeklyPeriods(FROM, 0)).toHaveLength(1);
  });
});

describe("rangesOverlap", () => {
  it("detects overlapping inclusive ranges", () => {
    expect(rangesOverlap("2026-06-10", "2026-06-20", "2026-06-15", "2026-06-21")).toBe(
      true,
    );
  });

  it("treats touching bounds as overlap (inclusive)", () => {
    expect(rangesOverlap("2026-06-21", "2026-06-30", "2026-06-15", "2026-06-21")).toBe(
      true,
    );
  });

  it("open-ended range overlaps any later period", () => {
    expect(rangesOverlap("2026-01-01", null, "2026-06-15", "2026-06-21")).toBe(true);
  });

  it("returns false when ranges are disjoint", () => {
    expect(rangesOverlap("2026-05-01", "2026-05-31", "2026-06-15", "2026-06-21")).toBe(
      false,
    );
  });

  it("is defensive against malformed dates", () => {
    expect(rangesOverlap("not-a-date", null, "2026-06-15", "2026-06-21")).toBe(false);
  });
});

describe("classifyCell (EP11 estados + precedência)", () => {
  it("INACTIVE wins regardless of allocation/vacation", () => {
    expect(classifyCell("INACTIVE", 50, true, true)).toBe("INACTIVE");
  });

  it("ON_LEAVE for afastado", () => {
    expect(classifyCell("ON_LEAVE", 0, false, false)).toBe("ON_LEAVE");
  });

  it("VACATION prevails over allocation", () => {
    expect(classifyCell("ACTIVE", 100, true, true)).toBe("VACATION");
  });

  it(">=100% is FULL", () => {
    expect(classifyCell("ACTIVE", 100, false, true)).toBe("FULL");
    expect(classifyCell("ACTIVE", 130, false, true)).toBe("FULL");
  });

  it("1..99% is PARTIAL", () => {
    expect(classifyCell("ACTIVE", 1, false, true)).toBe("PARTIAL");
    expect(classifyCell("ACTIVE", 60, false, true)).toBe("PARTIAL");
  });

  it("0% with allocation elsewhere in window is FREE", () => {
    expect(classifyCell("ACTIVE", 0, false, true)).toBe("FREE");
  });

  it("0% with no active allocation in the whole window is BENCH", () => {
    expect(classifyCell("ACTIVE", 0, false, false)).toBe("BENCH");
  });
});

describe("buildAvailabilityMap", () => {
  it("sums overlapping active allocations to classify FULL vs PARTIAL", () => {
    const map = buildAvailabilityMap(
      [
        consultant({
          id: "full",
          name: "Bruno",
          allocations: [
            { allocationPercent: 60, startDate: "2026-06-01", endDate: null },
            { allocationPercent: 40, startDate: "2026-06-01", endDate: null },
          ],
        }),
      ],
      PERIODS,
    );
    expect(map.rows[0].cells.every((c) => c.state === "FULL")).toBe(true);
    expect(map.rows[0].cells[0].allocationPercent).toBe(100);
  });

  it("vacation prevails over allocation only on the covered period", () => {
    const map = buildAvailabilityMap(
      [
        consultant({
          allocations: [
            { allocationPercent: 100, startDate: "2026-06-01", endDate: null },
          ],
          // Férias só na 2ª semana (22–28/06).
          vacations: [{ start: "2026-06-23", end: "2026-06-25" }],
        }),
      ],
      PERIODS,
    );
    const [w1, w2, w3] = map.rows[0].cells;
    expect(w1.state).toBe("FULL");
    expect(w2.state).toBe("VACATION");
    expect(w2.allocationPercent).toBe(0); // férias não reporta capacidade
    expect(w3.state).toBe("FULL");
  });

  it("inactive consultant never reports capacity", () => {
    const map = buildAvailabilityMap(
      [
        consultant({
          status: "INACTIVE",
          allocations: [
            { allocationPercent: 50, startDate: "2026-06-01", endDate: null },
          ],
        }),
      ],
      PERIODS,
    );
    expect(map.rows[0].cells.every((c) => c.state === "INACTIVE")).toBe(true);
    expect(map.rows[0].cells.every((c) => c.allocationPercent === 0)).toBe(true);
  });

  it("distinguishes FREE (alocado em outro período) de BENCH (ocioso na janela)", () => {
    const map = buildAvailabilityMap(
      [
        // Alocação só na 1ª semana → livre nas demais.
        consultant({
          id: "free",
          name: "Carla",
          allocations: [
            {
              allocationPercent: 50,
              startDate: "2026-06-15",
              endDate: "2026-06-21",
            },
          ],
        }),
        // Sem alocação em toda a janela → bench em todas.
        consultant({ id: "bench", name: "Diego", allocations: [] }),
      ],
      PERIODS,
    );
    const free = map.rows.find((r) => r.consultantId === "free")!;
    expect(free.cells[0].state).toBe("PARTIAL");
    expect(free.cells[1].state).toBe("FREE");
    expect(free.cells[2].state).toBe("FREE");

    const bench = map.rows.find((r) => r.consultantId === "bench")!;
    expect(bench.cells.every((c) => c.state === "BENCH")).toBe(true);
  });

  it("orders rows by name (pt-BR)", () => {
    const map = buildAvailabilityMap(
      [consultant({ id: "z", name: "Zélia" }), consultant({ id: "a", name: "Ângela" })],
      PERIODS,
    );
    expect(map.rows.map((r) => r.consultantName)).toEqual(["Ângela", "Zélia"]);
  });
});

describe("countStatesForPeriod", () => {
  it("counts consultants per state on a given period", () => {
    const map = buildAvailabilityMap(
      [
        consultant({
          id: "a",
          name: "A",
          allocations: [
            { allocationPercent: 100, startDate: "2026-06-01", endDate: null },
          ],
        }),
        consultant({ id: "b", name: "B", allocations: [] }),
        consultant({ id: "c", name: "C", status: "ON_LEAVE" }),
      ],
      PERIODS,
    );
    const counts = countStatesForPeriod(map, PERIODS[0].key);
    expect(counts.FULL).toBe(1);
    expect(counts.BENCH).toBe(1);
    expect(counts.ON_LEAVE).toBe(1);
  });

  it("returns an empty tally (zeros) for an unknown period key", () => {
    const map = buildAvailabilityMap([consultant({})], PERIODS);
    const counts = countStatesForPeriod(map, "1999-01-01");
    const total = Object.values(counts).reduce((s, n) => s + n, 0);
    expect(total).toBe(0);
  });
});

it("buildWeeklyPeriods produces unique-period AvailabilityPeriod shape", () => {
  const period: AvailabilityPeriod = PERIODS[0];
  expect(period.shortLabel).toContain("Sem");
  expect(period.label).toContain("Semana");
});
