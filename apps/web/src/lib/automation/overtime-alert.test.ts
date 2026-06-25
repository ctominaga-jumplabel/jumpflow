import { describe, expect, it } from "vitest";
import { aggregateOvertimeLines, type OvertimeEntryRow } from "./overtime-alert";

function row(
  consultantId: string,
  contractType: OvertimeEntryRow["contractType"],
  hours: number,
): OvertimeEntryRow {
  return { consultantId, consultantName: consultantId, contractType, hours };
}

describe("aggregateOvertimeLines", () => {
  it("sums overtime per consultant and sorts by hours desc", () => {
    const lines = aggregateOvertimeLines([
      row("ana", "CLT", 2),
      row("ana", "CLT", 3),
      row("bob", "PJ", 8),
    ]);
    expect(lines).toEqual([
      { consultantName: "bob", contractType: "PJ", overtimeHours: 8 },
      { consultantName: "ana", contractType: "CLT", overtimeHours: 5 },
    ]);
  });

  it("ignores zero/negative entries and drops consultants left at zero", () => {
    const lines = aggregateOvertimeLines([
      row("ana", "CLT", 0),
      row("bob", "PJ", -4),
      row("carla", "CLT_FLEX", 1.5),
    ]);
    expect(lines).toEqual([
      { consultantName: "carla", contractType: "CLT_FLEX", overtimeHours: 1.5 },
    ]);
  });

  it("returns an empty list when there is no overtime", () => {
    expect(aggregateOvertimeLines([])).toEqual([]);
  });
});
