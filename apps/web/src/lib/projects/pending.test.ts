import { describe, expect, it } from "vitest";
import type { ProjectItem } from "./types";
import {
  countMissingBillingConfig,
  countMissingSaleRate,
  isMissingBillingConfig,
  isMissingSaleRate,
  isProjectBaseSaleRateActive,
  projectHasSaleValue,
} from "./pending";

function project(overrides: Partial<ProjectItem>): ProjectItem {
  return {
    id: "prj",
    clientId: "cli",
    clientName: "Cliente",
    name: "Projeto",
    status: "ACTIVE",
    startDate: "2026-01-01",
    consumedHours: 0,
    allocatedConsultants: 0,
    allocations: [],
    saleRates: [],
    hasActiveSaleRate: false,
    hasBillingConfig: false,
    ...overrides,
  };
}

describe("project pending queues", () => {
  it("flags an active project without a sale rate", () => {
    expect(isMissingSaleRate(project({ hasActiveSaleRate: false }))).toBe(true);
    expect(isMissingSaleRate(project({ hasActiveSaleRate: true }))).toBe(false);
  });

  it("flags an active project without a billing config", () => {
    expect(isMissingBillingConfig(project({ hasBillingConfig: false }))).toBe(
      true,
    );
    expect(isMissingBillingConfig(project({ hasBillingConfig: true }))).toBe(
      false,
    );
  });

  it("never flags a non-active project", () => {
    const proposal = project({ status: "PROPOSAL" });
    const closed = project({ status: "CLOSED" });
    expect(isMissingSaleRate(proposal)).toBe(false);
    expect(isMissingBillingConfig(proposal)).toBe(false);
    expect(isMissingSaleRate(closed)).toBe(false);
    expect(isMissingBillingConfig(closed)).toBe(false);
  });

  it("treats a base sale rate as active only within its vigência", () => {
    const today = "2026-06-17";
    // Base rate (no consultant/allocation), open-ended, started in the past.
    expect(
      isProjectBaseSaleRateActive({ startsAt: "2026-01-01" }, today),
    ).toBe(true);
    // Future start → not yet in effect.
    expect(
      isProjectBaseSaleRateActive({ startsAt: "2026-12-01" }, today),
    ).toBe(false);
    // Already expired.
    expect(
      isProjectBaseSaleRateActive(
        { startsAt: "2026-01-01", endsAt: "2026-03-01" },
        today,
      ),
    ).toBe(false);
    // Consultant- or allocation-scoped rate is not a project base rate.
    expect(
      isProjectBaseSaleRateActive(
        { consultantId: "con-1", startsAt: "2026-01-01" },
        today,
      ),
    ).toBe(false);
  });

  it("treats a project as priced when every active allocation has a rate", () => {
    const allocations = [
      { id: "a1", consultantId: "c1", status: "ACTIVE" as const },
      { id: "a2", consultantId: "c2", status: "PLANNED" as const },
    ];
    // Nothing priced yet.
    expect(projectHasSaleValue(allocations, [])).toBe(false);
    // Only one consultant priced → still missing.
    expect(projectHasSaleValue(allocations, [{ allocationId: "a1" }])).toBe(
      false,
    );
    // Both priced (one allocation-scoped, one consultant-scoped) → covered.
    expect(
      projectHasSaleValue(allocations, [
        { allocationId: "a1" },
        { consultantId: "c2" },
      ]),
    ).toBe(true);
    // A project-level base rate covers everyone regardless of allocations.
    expect(projectHasSaleValue(allocations, [{}])).toBe(true);
  });

  it("is not priced when there are no allocations and no base rate", () => {
    expect(projectHasSaleValue([], [])).toBe(false);
    expect(projectHasSaleValue([], [{}])).toBe(true);
  });

  it("counts only the active projects missing each piece", () => {
    const projects = [
      project({ id: "a", hasActiveSaleRate: false, hasBillingConfig: false }),
      project({ id: "b", hasActiveSaleRate: true, hasBillingConfig: false }),
      project({ id: "c", status: "PROPOSAL" }),
      project({ id: "d", hasActiveSaleRate: true, hasBillingConfig: true }),
    ];
    expect(countMissingSaleRate(projects)).toBe(1);
    expect(countMissingBillingConfig(projects)).toBe(2);
  });
});
