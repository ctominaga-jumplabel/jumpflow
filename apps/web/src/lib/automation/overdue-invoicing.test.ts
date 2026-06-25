import { describe, expect, it } from "vitest";
import { buildOverdueLines, overdueDays } from "./overdue-invoicing";

const NOW = new Date("2026-06-23T12:00:00Z");

describe("overdueDays", () => {
  it("counts whole days since closedAt", () => {
    expect(overdueDays(new Date("2026-06-13T12:00:00Z"), NOW)).toBe(10);
    expect(overdueDays(new Date("2026-06-23T12:00:00Z"), NOW)).toBe(0);
    expect(overdueDays(null, NOW)).toBe(0);
  });
});

describe("buildOverdueLines", () => {
  it("maps closings to lines sorted by days open desc", () => {
    const lines = buildOverdueLines(
      [
        {
          projectName: "A",
          clientName: "Cli A",
          month: 5,
          year: 2026,
          amount: 1000,
          closedAt: new Date("2026-06-20T12:00:00Z"),
        },
        {
          projectName: "B",
          clientName: "Cli B",
          month: 4,
          year: 2026,
          amount: 2000,
          closedAt: new Date("2026-06-10T12:00:00Z"),
        },
      ],
      NOW,
    );
    expect(lines.map((l) => l.projectName)).toEqual(["B", "A"]); // B is older
    expect(lines[0].daysOpen).toBe(13);
    expect(lines[0].competenceLabel).toBe("Abril/2026");
    expect(lines[1].amount).toBe(1000);
  });
});
