import { describe, expect, it } from "vitest";
import {
  DEFAULT_AUTO_APPROVAL_SETTINGS,
  evaluateAutoApproval,
  evaluateRuleAutoApproval,
  findDuplicateEntryIds,
  type AutoApprovalEntryContext,
  type AutoApprovalFlags,
  type AutoApprovalRule,
} from "@jumpflow/shared";

const WEEKDAY = new Date("2026-06-10T00:00:00Z"); // Wednesday
const SATURDAY = new Date("2026-06-13T00:00:00Z"); // Saturday
const NOW = new Date("2026-06-10T12:00:00Z");
const TEN_MIN_AGO = new Date(NOW.getTime() - 10 * 60_000);
const TWO_MIN_AGO = new Date(NOW.getTime() - 2 * 60_000);
const FIVE_MIN_AGO = new Date(NOW.getTime() - 5 * 60_000);

const NO_FLAGS: AutoApprovalFlags = { allowAnyHours: false, allowWeekend: false };

function ctx(
  over: Partial<AutoApprovalEntryContext> = {},
): AutoApprovalEntryContext {
  return {
    status: "SUBMITTED",
    hours: 8,
    date: WEEKDAY,
    submittedAt: TEN_MIN_AGO,
    dailyTotalMinutes: 480,
    hasDuplicate: false,
    ...over,
  };
}

function evalDefault(over?: Partial<AutoApprovalEntryContext>, flags = NO_FLAGS) {
  return evaluateAutoApproval(ctx(over), flags, DEFAULT_AUTO_APPROVAL_SETTINGS, NOW);
}

describe("evaluateAutoApproval — default rule", () => {
  it("approves a clean weekday entry totaling 8h after the delay", () => {
    const d = evalDefault();
    expect(d.outcome).toBe("APPROVE");
    expect(d.reasons).toEqual([]);
    expect(d.appliedRules).toEqual(["DEFAULT"]);
    expect(d.ruleKey).toBe("DEFAULT");
  });

  it("approves exactly at the 5-minute boundary", () => {
    const d = evalDefault({ submittedAt: FIVE_MIN_AGO });
    expect(d.outcome).toBe("APPROVE");
  });

  it("stays pending when the 5-minute delay has not elapsed", () => {
    const d = evalDefault({ submittedAt: TWO_MIN_AGO });
    expect(d.outcome).toBe("PENDING");
    expect(d.reasons).toEqual(["DELAY_NOT_ELAPSED"]);
  });

  it("stays pending when the daily total is not exactly 480", () => {
    const d = evalDefault({ hours: 7, dailyTotalMinutes: 420 });
    expect(d.outcome).toBe("PENDING");
    expect(d.reasons).toEqual(["DAILY_TOTAL_MISMATCH"]);
  });

  it("stays pending on a duplicate", () => {
    const d = evalDefault({ hasDuplicate: true });
    expect(d.reasons).toEqual(["DUPLICATE"]);
  });

  it("stays pending on a weekend without the WEEKEND exception", () => {
    const d = evalDefault({ date: SATURDAY });
    expect(d.outcome).toBe("PENDING");
    expect(d.reasons).toContain("WEEKEND_NOT_ALLOWED");
  });

  it("accumulates multiple reasons in canonical order", () => {
    const d = evalDefault({
      date: SATURDAY,
      submittedAt: TWO_MIN_AGO,
      dailyTotalMinutes: 420,
    });
    expect(d.reasons).toEqual([
      "DELAY_NOT_ELAPSED",
      "WEEKEND_NOT_ALLOWED",
      "DAILY_TOTAL_MISMATCH",
    ]);
  });
});

describe("evaluateAutoApproval — scope guards", () => {
  it("rejects a non-submitted entry", () => {
    const d = evalDefault({ status: "DRAFT" });
    expect(d.reasons).toContain("ENTRY_NOT_SUBMITTED");
  });

  it("rejects an entry that was never submitted", () => {
    const d = evalDefault({ submittedAt: null });
    expect(d.reasons).toContain("NOT_SUBMITTED_YET");
  });

  it("rejects invalid hours (zero and above the sanity cap)", () => {
    expect(evalDefault({ hours: 0, dailyTotalMinutes: 0 }).reasons).toContain(
      "INVALID_HOURS",
    );
    expect(
      evalDefault(
        { hours: 30, dailyTotalMinutes: 30 * 60 },
        { allowAnyHours: true, allowWeekend: false },
      ).reasons,
    ).toContain("INVALID_HOURS");
  });
});

describe("evaluateAutoApproval — ANY_HOURS exception", () => {
  const flags: AutoApprovalFlags = { allowAnyHours: true, allowWeekend: false };

  it("approves any hours on a weekday (skips the 8h total)", () => {
    const d = evalDefault({ hours: 10, dailyTotalMinutes: 600 }, flags);
    expect(d.outcome).toBe("APPROVE");
    expect(d.appliedRules).toEqual(["EXCEPTION_ANY_HOURS"]);
  });

  it("does NOT bypass duplicate or delay checks", () => {
    expect(
      evalDefault({ hours: 10, dailyTotalMinutes: 600, hasDuplicate: true }, flags)
        .outcome,
    ).toBe("PENDING");
    expect(
      evalDefault(
        { hours: 10, dailyTotalMinutes: 600, submittedAt: TWO_MIN_AGO },
        flags,
      ).reasons,
    ).toContain("DELAY_NOT_ELAPSED");
  });
});

describe("evaluateAutoApproval — WEEKEND (FDS) exception", () => {
  it("approves a weekend entry for the listed pair without requiring 8h", () => {
    const d = evalDefault(
      { date: SATURDAY, hours: 4, dailyTotalMinutes: 240 },
      { allowAnyHours: false, allowWeekend: true },
    );
    expect(d.outcome).toBe("APPROVE");
    expect(d.appliedRules).toEqual(["EXCEPTION_WEEKEND"]);
  });

  it("combines both exceptions in appliedRules", () => {
    const d = evalDefault(
      { date: SATURDAY, hours: 12, dailyTotalMinutes: 720 },
      { allowAnyHours: true, allowWeekend: true },
    );
    expect(d.outcome).toBe("APPROVE");
    expect(d.appliedRules).toEqual(["EXCEPTION_ANY_HOURS", "EXCEPTION_WEEKEND"]);
    expect(d.ruleKey).toBe("EXCEPTION_ANY_HOURS+EXCEPTION_WEEKEND");
  });
});

describe("evaluateRuleAutoApproval — weekend OR range", () => {
  const rule = (over: Partial<AutoApprovalRule> = {}): AutoApprovalRule => ({
    weekendEnabled: false,
    hoursRangeEnabled: false,
    minMinutes: 1,
    maxMinutes: 1439,
    ...over,
  });
  const evalRule = (
    over: Partial<AutoApprovalEntryContext>,
    r: AutoApprovalRule,
  ) => evaluateRuleAutoApproval(ctx(over), r, DEFAULT_AUTO_APPROVAL_SETTINGS, NOW);

  it("weekend-only rule: approves a weekend entry, leaves weekdays pending", () => {
    const weekend = evalRule({ date: SATURDAY, hours: 5 }, rule({ weekendEnabled: true }));
    expect(weekend.outcome).toBe("APPROVE");
    expect(weekend.appliedRules).toEqual(["RULE_WEEKEND"]);

    const weekday = evalRule({ date: WEEKDAY, hours: 5 }, rule({ weekendEnabled: true }));
    expect(weekday.outcome).toBe("PENDING");
    expect(weekday.reasons).toEqual(["NO_RULE_MATCH"]);
  });

  it("range-only rule: approves in-range hours, rejects out-of-range", () => {
    const r = rule({ hoursRangeEnabled: true, minMinutes: 1, maxMinutes: 540 }); // up to 9h
    expect(evalRule({ hours: 8 }, r).outcome).toBe("APPROVE"); // 480 min
    expect(evalRule({ hours: 8 }, r).appliedRules).toEqual(["RULE_RANGE"]);
    const out = evalRule({ hours: 10 }, r); // 600 min > 540
    expect(out.outcome).toBe("PENDING");
    expect(out.reasons).toEqual(["NO_RULE_MATCH"]);
  });

  it("weekend toggle gates the weekend: range-only rule does NOT approve a weekend entry", () => {
    const r = rule({ hoursRangeEnabled: true, minMinutes: 1, maxMinutes: 1439 });
    const d = evalRule({ date: SATURDAY, hours: 5 }, r); // in range, but weekend off
    expect(d.outcome).toBe("PENDING");
    expect(d.reasons).toContain("WEEKEND_NOT_ALLOWED");
  });

  it("min == max requires the exact total", () => {
    const r = rule({ hoursRangeEnabled: true, minMinutes: 480, maxMinutes: 480 });
    expect(evalRule({ hours: 8 }, r).outcome).toBe("APPROVE");
    expect(evalRule({ hours: 7 }, r).outcome).toBe("PENDING");
  });

  it("OR: weekend entry out of range still approves via the weekend leg", () => {
    const r = rule({ weekendEnabled: true, hoursRangeEnabled: true, minMinutes: 1, maxMinutes: 60 });
    const d = evalRule({ date: SATURDAY, hours: 10 }, r); // out of range but weekend
    expect(d.outcome).toBe("APPROVE");
    expect(d.appliedRules).toEqual(["RULE_WEEKEND"]);
  });

  it("both legs match → both applied rules", () => {
    const r = rule({ weekendEnabled: true, hoursRangeEnabled: true, minMinutes: 1, maxMinutes: 1439 });
    const d = evalRule({ date: SATURDAY, hours: 5 }, r);
    expect(d.appliedRules).toEqual(["RULE_WEEKEND", "RULE_RANGE"]);
    expect(d.ruleKey).toBe("RULE_WEEKEND+RULE_RANGE");
  });

  it("rule with both legs off never auto-approves", () => {
    const d = evalRule({ hours: 8 }, rule());
    expect(d.outcome).toBe("PENDING");
    expect(d.reasons).toEqual(["NO_RULE_MATCH"]);
  });

  it("still enforces the common gates (delay, duplicate)", () => {
    const r = rule({ hoursRangeEnabled: true, minMinutes: 1, maxMinutes: 1439 });
    expect(evalRule({ submittedAt: TWO_MIN_AGO }, r).reasons).toContain(
      "DELAY_NOT_ELAPSED",
    );
    expect(evalRule({ hasDuplicate: true }, r).reasons).toContain("DUPLICATE");
  });
});

describe("findDuplicateEntryIds", () => {
  it("flags every member of a duplicate group, leaves singletons alone", () => {
    const ids = findDuplicateEntryIds([
      { id: "a", consultantId: "c1", projectId: "p1", date: WEEKDAY, activityType: "DEV" },
      { id: "b", consultantId: "c1", projectId: "p1", date: WEEKDAY, activityType: "DEV" },
      { id: "c", consultantId: "c1", projectId: "p1", date: WEEKDAY, activityType: "QA" },
    ]);
    expect(ids.has("a")).toBe(true);
    expect(ids.has("b")).toBe(true);
    expect(ids.has("c")).toBe(false);
  });
});
