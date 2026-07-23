import { describe, expect, it } from "vitest";
import {
  projectRateKey,
  resolveProjectRate,
  type ProjectRateWindow,
} from "./project-rate";

const d = (iso: string) => new Date(`${iso}T00:00:00.000Z`);

describe("resolveProjectRate (M2)", () => {
  it("returns null when there are no windows", () => {
    expect(resolveProjectRate([], d("2026-07-10"))).toBeNull();
  });

  it("matches an open-ended window from its start (inclusive)", () => {
    const windows: ProjectRateWindow[] = [
      { startsAt: d("2026-07-01"), endsAt: null, hourlyRate: 180 },
    ];
    expect(resolveProjectRate(windows, d("2026-06-30"))).toBeNull();
    expect(resolveProjectRate(windows, d("2026-07-01"))).toBe(180);
    expect(resolveProjectRate(windows, d("2027-01-01"))).toBe(180);
  });

  it("treats endsAt as inclusive (last active day)", () => {
    const windows: ProjectRateWindow[] = [
      { startsAt: d("2026-07-01"), endsAt: d("2026-07-31"), hourlyRate: 200 },
    ];
    expect(resolveProjectRate(windows, d("2026-07-31"))).toBe(200);
    expect(resolveProjectRate(windows, d("2026-08-01"))).toBeNull();
  });

  it("when windows overlap, the latest startsAt wins", () => {
    const windows: ProjectRateWindow[] = [
      { startsAt: d("2026-01-01"), endsAt: null, hourlyRate: 150 },
      { startsAt: d("2026-07-01"), endsAt: null, hourlyRate: 220 },
    ];
    expect(resolveProjectRate(windows, d("2026-06-15"))).toBe(150);
    expect(resolveProjectRate(windows, d("2026-07-15"))).toBe(220);
  });

  it("builds a stable consultant+project key", () => {
    expect(projectRateKey("c-1", "p-1")).toBe("c-1::p-1");
    expect(projectRateKey("c-1", "p-1")).not.toBe(projectRateKey("c-1", "p-2"));
  });
});
