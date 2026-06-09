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

describe("buildMissingTimesheetCsv", () => {
  it("always emits the stable header even with zero rows", () => {
    const csv = buildMissingTimesheetCsv([], period);
    const firstLine = csv.replace(/^﻿/, "").split("\r\n")[0];
    expect(firstLine).toBe(MISSING_TIMESHEET_HEADERS.join(","));
  });

  it("emits one data line per row and quotes fields", () => {
    const rows: MissingTimesheetRow[] = [
      {
        consultantId: "c1",
        consultantName: 'Ana "Bug" Lima',
        consultantEmail: "ana@x.com",
        area: "Data",
        seniority: "SENIOR",
      },
    ];
    const csv = buildMissingTimesheetCsv(rows, period);
    const lines = csv.replace(/^﻿/, "").trimEnd().split("\r\n");
    expect(lines).toHaveLength(2);
    // Embedded quotes are doubled per RFC 4180.
    expect(lines[1]).toContain('"Ana ""Bug"" Lima"');
    expect(lines[1]).toContain('"c1"');
  });

  it("prepends a UTF-8 BOM for Excel", () => {
    expect(buildMissingTimesheetCsv([], period).startsWith("﻿")).toBe(true);
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
});
