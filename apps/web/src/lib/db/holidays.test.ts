import { describe, expect, it } from "vitest";
import { detectHolidayDuplicate, normalizeRegion } from "@/lib/db/holidays";

/**
 * Project-aware duplicate rule (R1 fix). `detectHolidayDuplicate` receives the
 * OTHER holidays already on the same (date, scope, region) and the desired set
 * of linked projects. These tests pin the "two clients on the same day" case
 * that used to be blocked incorrectly.
 */
describe("detectHolidayDuplicate", () => {
  const clientA = { id: "proj-a", name: "Cliente A" };
  const clientB = { id: "proj-b", name: "Cliente B" };

  it("blocks two GLOBAL holidays on the same key", () => {
    const result = detectHolidayDuplicate([{ projects: [] }], []);
    expect(result.duplicate).toBe(true);
    expect(result.conflictProjectName).toBeUndefined();
  });

  it("allows the first GLOBAL holiday (no candidates)", () => {
    expect(detectHolidayDuplicate([], []).duplicate).toBe(false);
  });

  it("does NOT treat a project-scoped candidate as a global duplicate", () => {
    // New holiday is global; the only existing one is bound to a project.
    const result = detectHolidayDuplicate([{ projects: [clientA] }], []);
    expect(result.duplicate).toBe(false);
  });

  it("allows two projects with DISJOINT sets on the same day", () => {
    // "Folga Cliente A"→A already exists; new "Folga Cliente B"→B must pass.
    const result = detectHolidayDuplicate([{ projects: [clientA] }], [clientB.id]);
    expect(result.duplicate).toBe(false);
  });

  it("blocks when the same project is booked twice on the same day", () => {
    const result = detectHolidayDuplicate([{ projects: [clientA] }], [clientA.id]);
    expect(result.duplicate).toBe(true);
    expect(result.conflictProjectName).toBe("Cliente A");
  });

  it("blocks on ANY shared project even when other projects differ", () => {
    const result = detectHolidayDuplicate(
      [{ projects: [clientA, clientB] }],
      [clientB.id, "proj-c"],
    );
    expect(result.duplicate).toBe(true);
    expect(result.conflictProjectName).toBe("Cliente B");
  });

  it("does not conflict a project-scoped request with a GLOBAL candidate", () => {
    const result = detectHolidayDuplicate([{ projects: [] }], [clientA.id]);
    expect(result.duplicate).toBe(false);
  });
});

describe("normalizeRegion", () => {
  it("drops the region for national holidays", () => {
    expect(normalizeRegion("NATIONAL", "SP")).toBeNull();
  });

  it("trims and upper-cases state/city regions (N4)", () => {
    expect(normalizeRegion("STATE", " sp ")).toBe("SP");
    expect(normalizeRegion("CITY", "são paulo")).toBe("SÃO PAULO");
  });

  it("returns null for an empty region", () => {
    expect(normalizeRegion("STATE", "   ")).toBeNull();
    expect(normalizeRegion("CITY", null)).toBeNull();
  });
});
