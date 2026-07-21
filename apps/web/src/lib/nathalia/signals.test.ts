/**
 * FASE A+B Nathal.IA — Wave 3 (tests).
 *
 * Unit coverage for the app's signal-translation layer
 * (`getNathaliaSignals`) that derives `NathaliaSignals` from the current
 * mock-data sources, with defensive RBAC.
 *
 * Risk focus: the RBAC gate on `approvals` (approver vs non-approver roles),
 * "never invent data" (the deliberately-omitted `reports` block), and that the
 * hours/projects blocks have a stable, well-formed shape. Assertions about
 * hours are structural rather than exact, because `getNathaliaSignals` reads
 * `new Date()` and the mock week is fixed in time.
 */
import { describe, expect, it } from "vitest";
import type { RoleName } from "@/lib/auth/roles";
import { getNathaliaSignals } from "./signals";

function userWith(...roles: RoleName[]) {
  return { id: "u", roles };
}

const APPROVER_ROLES: RoleName[] = [
  "ADMIN",
  "AREA_MANAGER",
  "PROJECT_MANAGER",
  "FINANCE",
];

const NON_APPROVER_ROLES: RoleName[] = ["CONSULTANT", "PEOPLE", "SALES"];

describe("getNathaliaSignals — hours block", () => {
  it("always derives an hours block with a well-formed shape", async () => {
    const signals = await getNathaliaSignals(userWith("CONSULTANT"));

    expect(signals.hours).toBeDefined();
    expect(typeof signals.hours!.loggedToday).toBe("number");
    expect(typeof signals.hours!.expectedToday).toBe("number");
    expect(signals.hours!.expectedToday).toBeGreaterThan(0);
    expect(signals.hours!.loggedToday).toBeGreaterThanOrEqual(0);
    // missingThisWeek is provided and never negative.
    expect(signals.hours!.missingThisWeek).toBeGreaterThanOrEqual(0);
  });

  it("derives hours even for an approver role (everyone sees their own hours)", async () => {
    const signals = await getNathaliaSignals(userWith("ADMIN"));
    expect(signals.hours).toBeDefined();
  });
});

describe("getNathaliaSignals — approvals RBAC", () => {
  it.each(APPROVER_ROLES)(
    "includes the approvals block for approver role %s",
    async (role) => {
      const signals = await getNathaliaSignals(userWith(role));
      expect(signals.approvals).toBeDefined();
      expect(typeof signals.approvals!.pending).toBe("number");
      expect(signals.approvals!.pending).toBeGreaterThanOrEqual(0);
    },
  );

  it.each(NON_APPROVER_ROLES)(
    "omits the approvals block for non-approver role %s",
    async (role) => {
      const signals = await getNathaliaSignals(userWith(role));
      expect(signals.approvals).toBeUndefined();
    },
  );

  it("includes approvals when a non-approver role is combined with an approver role", async () => {
    const signals = await getNathaliaSignals(userWith("CONSULTANT", "FINANCE"));
    expect(signals.approvals).toBeDefined();
  });

  it("counts only HOURS items still pending in the approvals queue", async () => {
    // Mock queue has 3 PENDING HOURS items (ap-1, ap-2, ap-3); EXPENSE pending
    // and any decided HOURS must NOT be counted.
    const signals = await getNathaliaSignals(userWith("ADMIN"));
    expect(signals.approvals!.pending).toBe(3);
  });
});

describe("getNathaliaSignals — projects block", () => {
  it("always derives a projects block with a numeric late count", async () => {
    const signals = await getNathaliaSignals(userWith("CONSULTANT"));
    expect(signals.projects).toBeDefined();
    expect(typeof signals.projects!.lateActivities).toBe("number");
    expect(signals.projects!.lateActivities).toBeGreaterThanOrEqual(0);
  });
});

describe("getNathaliaSignals — never invents data (reports omitted)", () => {
  it("omits the reports block for a finance-capable role (no real source yet)", async () => {
    const signals = await getNathaliaSignals(userWith("FINANCE"));
    expect(signals.reports).toBeUndefined();
  });

  it("omits the reports block for a CONSULTANT too", async () => {
    const signals = await getNathaliaSignals(userWith("CONSULTANT"));
    expect(signals.reports).toBeUndefined();
  });
});

describe("getNathaliaSignals — overall payload shape", () => {
  it("a consultant payload has hours + projects but not approvals/reports", async () => {
    const signals = await getNathaliaSignals(userWith("CONSULTANT"));
    expect(Object.keys(signals).sort()).toEqual(["hours", "projects"]);
  });

  it("an admin payload adds approvals on top", async () => {
    const signals = await getNathaliaSignals(userWith("ADMIN"));
    expect(Object.keys(signals).sort()).toEqual([
      "approvals",
      "hours",
      "projects",
    ]);
  });
});
