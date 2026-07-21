/**
 * FASE A+B Nathal.IA — Wave 3 (tests).
 *
 * Unit coverage for `ProactiveEngine.evaluateSignals` — the proactive nudge
 * decision function that turns real operational signals into a single, gentle,
 * de-duplicated nudge for the current screen.
 *
 * Imported through the package barrel (`@jumpflow/character-nathalia`) so these
 * run under `npm run test` in `@jumpflow/web` (the package has no own runner).
 *
 * Focus: real risk + negative cases — wrong nudge, missing data, dedup, guards,
 * and the finance RBAC gate on the productivity insight.
 */
import { beforeEach, describe, expect, it } from "vitest";
import {
  ProactiveEngine,
  type NathaliaSignals,
  type NathaliaUser,
  type ProactiveSignal,
} from "@jumpflow/character-nathalia";

const CONSULTANT: NathaliaUser = { id: "c", name: "C", roles: ["CONSULTANT"] };
const ADMIN: NathaliaUser = { id: "a", name: "A", roles: ["ADMIN"] };
const FINANCE: NathaliaUser = { id: "f", name: "F", roles: ["FINANCE"] };
const AREA_MANAGER: NathaliaUser = { id: "am", name: "AM", roles: ["AREA_MANAGER"] };
const PROJECT_MANAGER: NathaliaUser = {
  id: "pm",
  name: "PM",
  roles: ["PROJECT_MANAGER"],
};

/** Build a ProactiveSignal with sane defaults, override per test. */
function signalFor(
  context: ProactiveSignal["context"],
  overrides: Partial<ProactiveSignal> = {},
): ProactiveSignal {
  return {
    trigger: "signal",
    context,
    user: CONSULTANT,
    isOpen: false,
    ...overrides,
  };
}

describe("ProactiveEngine.evaluateSignals — hours", () => {
  let engine: ProactiveEngine;
  beforeEach(() => {
    engine = new ProactiveEngine();
  });

  it("fires the hours nudge with interpolated logged/missing values + CTAs", () => {
    const signals: NathaliaSignals = {
      hours: { loggedToday: 6, expectedToday: 8 },
    };
    const nudge = engine.evaluateSignals(signals, signalFor("hours"));

    expect(nudge).not.toBeNull();
    expect(nudge!.id).toBe("signal:hours");
    expect(nudge!.trigger).toBe("signal");
    expect(nudge!.state).toBe("warning");
    expect(nudge!.priority).toBe("gentle");
    // Interpolation: logged = 6, missing = 8 - 6 = 2.
    expect(nudge!.message).toContain("6h");
    expect(nudge!.message).toContain("Faltam 2h");
    // CTAs: primary navigation + dismiss.
    expect(nudge!.ctas).toHaveLength(2);
    expect(nudge!.ctas![0]).toMatchObject({
      kind: "primary",
      action: "navigateToHours",
    });
    expect(nudge!.ctas![1].kind).toBe("dismiss");
    expect(nudge!.ctas![1].action).toBeUndefined();
  });

  it("does not fire when logged hours already meet the expected (equal)", () => {
    const signals: NathaliaSignals = {
      hours: { loggedToday: 8, expectedToday: 8 },
    };
    expect(engine.evaluateSignals(signals, signalFor("hours"))).toBeNull();
  });

  it("does not fire when logged hours exceed the expected", () => {
    const signals: NathaliaSignals = {
      hours: { loggedToday: 10, expectedToday: 8 },
    };
    expect(engine.evaluateSignals(signals, signalFor("hours"))).toBeNull();
  });

  it("returns null when the hours block is absent for an hours context", () => {
    expect(engine.evaluateSignals({}, signalFor("hours"))).toBeNull();
  });
});

describe("ProactiveEngine.evaluateSignals — approvals", () => {
  let engine: ProactiveEngine;
  beforeEach(() => {
    engine = new ProactiveEngine();
  });

  it("fires the approvals nudge with the pending count + CTAs", () => {
    const signals: NathaliaSignals = { approvals: { pending: 4 } };
    const nudge = engine.evaluateSignals(
      signals,
      signalFor("approvals", { user: ADMIN }),
    );

    expect(nudge).not.toBeNull();
    expect(nudge!.id).toBe("signal:approvals");
    expect(nudge!.state).toBe("pointing");
    expect(nudge!.message).toContain("4 lançamentos");
    expect(nudge!.ctas![0]).toMatchObject({
      kind: "primary",
      action: "navigateToApprovals",
    });
    expect(nudge!.ctas![1].kind).toBe("dismiss");
  });

  it("does not fire when there are zero pending approvals", () => {
    const signals: NathaliaSignals = { approvals: { pending: 0 } };
    expect(
      engine.evaluateSignals(signals, signalFor("approvals", { user: ADMIN })),
    ).toBeNull();
  });

  it("returns null when the approvals block is absent for an approvals context", () => {
    expect(
      engine.evaluateSignals({}, signalFor("approvals", { user: ADMIN })),
    ).toBeNull();
  });
});

describe("ProactiveEngine.evaluateSignals — projects", () => {
  let engine: ProactiveEngine;
  beforeEach(() => {
    engine = new ProactiveEngine();
  });

  it("fires the projects nudge with the late-activities count + CTAs", () => {
    const signals: NathaliaSignals = { projects: { lateActivities: 3 } };
    const nudge = engine.evaluateSignals(signals, signalFor("projects"));

    expect(nudge).not.toBeNull();
    expect(nudge!.id).toBe("signal:projects");
    expect(nudge!.state).toBe("explaining");
    expect(nudge!.message).toContain("3 atividades atrasadas");
    expect(nudge!.ctas![0]).toMatchObject({
      kind: "primary",
      action: "navigateToProjects",
    });
    expect(nudge!.ctas![1].kind).toBe("dismiss");
  });

  it("does not fire when there are zero late activities", () => {
    const signals: NathaliaSignals = { projects: { lateActivities: 0 } };
    expect(engine.evaluateSignals(signals, signalFor("projects"))).toBeNull();
  });

  it("returns null when the projects block is absent", () => {
    expect(engine.evaluateSignals({}, signalFor("projects"))).toBeNull();
  });
});

describe("ProactiveEngine.evaluateSignals — reports/finance RBAC", () => {
  let engine: ProactiveEngine;
  beforeEach(() => {
    engine = new ProactiveEngine();
  });

  it("fires a positive productivity nudge for a finance-capable user (happy)", () => {
    const signals: NathaliaSignals = {
      reports: { productivityDeltaPct: 12 },
    };
    const nudge = engine.evaluateSignals(
      signals,
      signalFor("reports", { user: FINANCE }),
    );

    expect(nudge).not.toBeNull();
    expect(nudge!.id).toBe("signal:reports");
    expect(nudge!.state).toBe("happy");
    expect(nudge!.message).toContain("+12%");
    expect(nudge!.ctas![0]).toMatchObject({
      kind: "primary",
      action: "navigateToReports",
    });
  });

  it("fires a negative productivity nudge with sign + abs value (explaining)", () => {
    const signals: NathaliaSignals = {
      reports: { productivityDeltaPct: -7 },
    };
    const nudge = engine.evaluateSignals(
      signals,
      signalFor("finance", { user: ADMIN }),
    );

    expect(nudge).not.toBeNull();
    expect(nudge!.state).toBe("explaining");
    expect(nudge!.message).toContain("-7%");
    expect(nudge!.message).not.toContain("--7");
  });

  it("AREA_MANAGER (finance-capable) gets the productivity nudge", () => {
    const signals: NathaliaSignals = { reports: { productivityDeltaPct: 5 } };
    expect(
      engine.evaluateSignals(
        signals,
        signalFor("reports", { user: AREA_MANAGER }),
      ),
    ).not.toBeNull();
  });

  it("blocks the productivity nudge for a CONSULTANT (no finance permission)", () => {
    const signals: NathaliaSignals = { reports: { productivityDeltaPct: 12 } };
    expect(
      engine.evaluateSignals(
        signals,
        signalFor("reports", { user: CONSULTANT }),
      ),
    ).toBeNull();
  });

  it("blocks the productivity nudge for a PROJECT_MANAGER (not finance-capable)", () => {
    const signals: NathaliaSignals = { reports: { productivityDeltaPct: 12 } };
    expect(
      engine.evaluateSignals(
        signals,
        signalFor("reports", { user: PROJECT_MANAGER }),
      ),
    ).toBeNull();
  });

  it("does not fire when the delta is exactly zero (even for finance)", () => {
    const signals: NathaliaSignals = { reports: { productivityDeltaPct: 0 } };
    expect(
      engine.evaluateSignals(signals, signalFor("reports", { user: FINANCE })),
    ).toBeNull();
  });

  it("does not fire when the delta is undefined", () => {
    const signals: NathaliaSignals = { reports: {} };
    expect(
      engine.evaluateSignals(signals, signalFor("reports", { user: FINANCE })),
    ).toBeNull();
  });
});

describe("ProactiveEngine.evaluateSignals — guards & de-duplication", () => {
  let engine: ProactiveEngine;
  beforeEach(() => {
    engine = new ProactiveEngine();
  });

  it("returns null when the panel is open (never interrupts)", () => {
    const signals: NathaliaSignals = { hours: { loggedToday: 0, expectedToday: 8 } };
    expect(
      engine.evaluateSignals(signals, signalFor("hours", { isOpen: true })),
    ).toBeNull();
  });

  it("returns null when there is no user", () => {
    const signals: NathaliaSignals = { hours: { loggedToday: 0, expectedToday: 8 } };
    expect(
      engine.evaluateSignals(signals, signalFor("hours", { user: null })),
    ).toBeNull();
  });

  it("fires a given nudge id at most once per instance (de-dup)", () => {
    const signals: NathaliaSignals = { hours: { loggedToday: 5, expectedToday: 8 } };
    const first = engine.evaluateSignals(signals, signalFor("hours"));
    const second = engine.evaluateSignals(signals, signalFor("hours"));

    expect(first).not.toBeNull();
    expect(second).toBeNull();
    expect(engine.hasFired("signal:hours")).toBe(true);
  });

  it("de-dups independently per context (hours then approvals both fire once)", () => {
    const signals: NathaliaSignals = {
      hours: { loggedToday: 5, expectedToday: 8 },
      approvals: { pending: 2 },
    };
    expect(engine.evaluateSignals(signals, signalFor("hours"))).not.toBeNull();
    expect(
      engine.evaluateSignals(signals, signalFor("approvals", { user: ADMIN })),
    ).not.toBeNull();
    // Both already fired now.
    expect(engine.evaluateSignals(signals, signalFor("hours"))).toBeNull();
    expect(
      engine.evaluateSignals(signals, signalFor("approvals", { user: ADMIN })),
    ).toBeNull();
  });

  it("reset() clears the de-dup Set so a fired nudge can fire again", () => {
    const signals: NathaliaSignals = { hours: { loggedToday: 5, expectedToday: 8 } };
    expect(engine.evaluateSignals(signals, signalFor("hours"))).not.toBeNull();
    expect(engine.evaluateSignals(signals, signalFor("hours"))).toBeNull();
    engine.reset();
    expect(engine.evaluateSignals(signals, signalFor("hours"))).not.toBeNull();
  });

  it("returns null for a context with no signal rule (e.g. dashboard)", () => {
    const signals: NathaliaSignals = { hours: { loggedToday: 0, expectedToday: 8 } };
    expect(
      engine.evaluateSignals(signals, signalFor("dashboard")),
    ).toBeNull();
  });
});
