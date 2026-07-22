import { describe, expect, it } from "vitest";

import {
  buildProjectHoursSheetRows,
  sumProjectHours,
} from "./hours-worksheet";

describe("buildProjectHoursSheetRows", () => {
  it("groups hours per consultant and totals them", () => {
    const rows = buildProjectHoursSheetRows([
      { consultantId: "c-1", consultantName: "Bia", hours: 8 },
      { consultantId: "c-1", consultantName: "Bia", hours: 2.5 },
      { consultantId: "c-2", consultantName: "Ana", hours: 5 },
    ]);
    expect(rows).toEqual([
      { consultant: "Ana", totalHours: 5, entries: 1 },
      { consultant: "Bia", totalHours: 10.5, entries: 2 },
    ]);
  });

  it("sorts by consultant name (pt-BR, accent/case insensitive)", () => {
    const rows = buildProjectHoursSheetRows([
      { consultantId: "c-3", consultantName: "Zeca", hours: 1 },
      { consultantId: "c-2", consultantName: "Ácaro", hours: 1 },
      { consultantId: "c-1", consultantName: "bruno", hours: 1 },
    ]);
    expect(rows.map((row) => row.consultant)).toEqual([
      "Ácaro",
      "bruno",
      "Zeca",
    ]);
  });

  it("coerces negative/NaN hours to zero (never poisons a client total)", () => {
    const rows = buildProjectHoursSheetRows([
      { consultantId: "c-1", consultantName: "Bia", hours: -4 },
      { consultantId: "c-1", consultantName: "Bia", hours: Number.NaN },
      { consultantId: "c-1", consultantName: "Bia", hours: 3 },
    ]);
    expect(rows).toEqual([{ consultant: "Bia", totalHours: 3, entries: 3 }]);
  });

  it("rounds accumulated totals to two decimals", () => {
    const rows = buildProjectHoursSheetRows([
      { consultantId: "c-1", consultantName: "Bia", hours: 0.1 },
      { consultantId: "c-1", consultantName: "Bia", hours: 0.2 },
    ]);
    expect(rows[0]!.totalHours).toBe(0.3);
  });

  it("returns an empty array for no entries", () => {
    expect(buildProjectHoursSheetRows([])).toEqual([]);
  });
});

describe("sumProjectHours", () => {
  it("totals all consultant rows", () => {
    const rows = buildProjectHoursSheetRows([
      { consultantId: "c-1", consultantName: "Bia", hours: 8 },
      { consultantId: "c-2", consultantName: "Ana", hours: 5 },
    ]);
    expect(sumProjectHours(rows)).toBe(13);
  });

  it("is zero for no rows", () => {
    expect(sumProjectHours([])).toBe(0);
  });
});
