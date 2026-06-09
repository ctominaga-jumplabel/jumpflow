import { describe, expect, it } from "vitest";
import {
  buildMissingTimesheetCsv,
  MISSING_TIMESHEET_HEADERS,
  missingTimesheetReferenceKey,
  type MissingTimesheetRow,
} from "@jumpflow/shared";

const period = {
  start: new Date("2026-06-01T00:00:00Z"),
  end: new Date("2026-06-08T00:00:00Z"),
  generatedAt: new Date("2026-06-09T09:00:00Z"),
};

const BOM = "﻿";

function baseRow(over: Partial<MissingTimesheetRow> = {}): MissingTimesheetRow {
  return {
    consultantId: "c1",
    consultantName: "Ana Lima",
    consultantEmail: "ana@x.com",
    area: "Data",
    seniority: "SENIOR",
    projectId: "p1",
    projectName: "Projeto A",
    status: "SEM_LANCAMENTO_NO_PROJETO",
    loggedInOtherProject: false,
    ...over,
  };
}

/** Strip leading BOM and trailing CRLF, then split data/header lines. */
function lines(csv: string): string[] {
  return csv.replace(/^﻿/, "").replace(/\r\n$/, "").split("\r\n");
}

describe("MISSING_TIMESHEET_HEADERS", () => {
  it("has exactly the 12 expected columns in order", () => {
    expect([...MISSING_TIMESHEET_HEADERS]).toEqual([
      "periodStart",
      "periodEnd",
      "consultantId",
      "consultantName",
      "consultantEmail",
      "area",
      "seniority",
      "projectId",
      "projectName",
      "status",
      "loggedInOtherProject",
      "generatedAt",
    ]);
    expect(MISSING_TIMESHEET_HEADERS).toHaveLength(12);
  });
});

describe("buildMissingTimesheetCsv", () => {
  it("always emits the stable header even with zero rows", () => {
    const csv = buildMissingTimesheetCsv([], period);
    const all = lines(csv);
    expect(all).toHaveLength(1);
    expect(all[0]).toBe(MISSING_TIMESHEET_HEADERS.join(","));
  });

  it("prepends a UTF-8 BOM for Excel (pt-BR)", () => {
    expect(buildMissingTimesheetCsv([], period).startsWith(BOM)).toBe(true);
  });

  it("emits one data line per row with all 12 quoted fields", () => {
    const csv = buildMissingTimesheetCsv([baseRow()], period);
    const all = lines(csv);
    expect(all).toHaveLength(2);
    expect(all[1]).toBe(
      [
        '"2026-06-01"',
        '"2026-06-08"',
        '"c1"',
        '"Ana Lima"',
        '"ana@x.com"',
        '"Data"',
        '"SENIOR"',
        '"p1"',
        '"Projeto A"',
        '"SEM_LANCAMENTO_NO_PROJETO"',
        '"false"',
        `"${period.generatedAt.toISOString()}"`,
      ].join(","),
    );
  });

  it("doubles embedded quotes per RFC 4180", () => {
    const csv = buildMissingTimesheetCsv(
      [baseRow({ consultantName: 'Ana "Bug" Lima' })],
      period,
    );
    expect(lines(csv)[1]).toContain('"Ana ""Bug"" Lima"');
  });

  it("serializes loggedInOtherProject as the literal true/false strings", () => {
    const csv = buildMissingTimesheetCsv(
      [
        baseRow({ consultantName: "Aaa", loggedInOtherProject: true }),
        baseRow({ consultantName: "Bbb", loggedInOtherProject: false }),
      ],
      period,
    );
    const data = lines(csv).slice(1);
    // Column index 10 (zero-based) is loggedInOtherProject.
    expect(data[0].split(",")[10]).toBe('"true"');
    expect(data[1].split(",")[10]).toBe('"false"');
  });

  it("renders a null area as an empty quoted field", () => {
    const csv = buildMissingTimesheetCsv([baseRow({ area: null })], period);
    // Column index 5 is area.
    expect(lines(csv)[1].split(",")[5]).toBe('""');
  });

  it("emits one data line for every row provided", () => {
    const csv = buildMissingTimesheetCsv(
      [
        baseRow({ consultantName: "Aaa" }),
        baseRow({ consultantName: "Bbb" }),
        baseRow({ consultantName: "Ccc" }),
      ],
      period,
    );
    expect(lines(csv)).toHaveLength(4); // header + 3
  });
});

describe("missingTimesheetReferenceKey", () => {
  it("is stable for the same window (idempotency key)", () => {
    expect(
      missingTimesheetReferenceKey(
        new Date("2026-06-01T00:00:00Z"),
        new Date("2026-06-08T00:00:00Z"),
      ),
    ).toBe("2026-06-01_2026-06-08");
  });

  it("changes when the window changes", () => {
    expect(
      missingTimesheetReferenceKey(
        new Date("2026-06-08T00:00:00Z"),
        new Date("2026-06-15T00:00:00Z"),
      ),
    ).toBe("2026-06-08_2026-06-15");
  });
});
