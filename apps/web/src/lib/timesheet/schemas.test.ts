import { describe, expect, it } from "vitest";
import {
  COMMENT_REQUIRED_MESSAGE,
  decideHoursSchema,
  timeEntryInputSchema,
  updateTimeEntryInputSchema,
  weekActionInputSchema,
  weeklyTimeEntryInputSchema,
} from "./schemas";

const validEntry = {
  projectId: "seed-project-portal",
  activityType: "WORKDAY" as const,
  date: "2026-06-10",
  hours: 8,
  description: "Trabalho no portal",
  billable: true,
};

describe("timeEntryInputSchema", () => {
  it("accepts a valid entry (including non-cuid seeded ids)", () => {
    expect(timeEntryInputSchema.safeParse(validEntry).success).toBe(true);
  });

  it("accepts up to 2 decimal places and omitted description", () => {
    const rest = { ...validEntry, description: undefined };
    expect(
      timeEntryInputSchema.safeParse({ ...rest, hours: 7.25 }).success,
    ).toBe(true);
  });

  it("rejects zero, negative and > 24 hours", () => {
    expect(timeEntryInputSchema.safeParse({ ...validEntry, hours: 0 }).success).toBe(false);
    expect(timeEntryInputSchema.safeParse({ ...validEntry, hours: -1 }).success).toBe(false);
    expect(timeEntryInputSchema.safeParse({ ...validEntry, hours: 24.5 }).success).toBe(false);
  });

  it("rejects more than 2 decimal places", () => {
    expect(
      timeEntryInputSchema.safeParse({ ...validEntry, hours: 8.333 }).success,
    ).toBe(false);
  });

  it("rejects invalid dates and unknown activities", () => {
    expect(
      timeEntryInputSchema.safeParse({ ...validEntry, date: "2026-02-30" }).success,
    ).toBe(false);
    expect(
      timeEntryInputSchema.safeParse({ ...validEntry, date: "10/06/2026" }).success,
    ).toBe(false);
    expect(
      timeEntryInputSchema.safeParse({ ...validEntry, activityType: "OTHER" }).success,
    ).toBe(false);
  });

  it("rejects descriptions longer than 500 characters", () => {
    expect(
      timeEntryInputSchema.safeParse({
        ...validEntry,
        description: "x".repeat(501),
      }).success,
    ).toBe(false);
  });
});

describe("updateTimeEntryInputSchema", () => {
  it("accepts an update without a date change", () => {
    expect(
      updateTimeEntryInputSchema.safeParse({
        id: "entry-1",
        hours: 6,
        billable: false,
      }).success,
    ).toBe(true);
  });

  it("rejects an empty id", () => {
    expect(
      updateTimeEntryInputSchema.safeParse({ id: " ", hours: 6, billable: true })
        .success,
    ).toBe(false);
  });
});

describe("weekActionInputSchema", () => {
  it("requires a valid ISO date", () => {
    expect(weekActionInputSchema.safeParse({ weekStart: "2026-06-08" }).success).toBe(true);
    expect(weekActionInputSchema.safeParse({ weekStart: "semana-24" }).success).toBe(false);
  });
});

describe("weeklyTimeEntryInputSchema", () => {
  it("accepts a valid weekly entry", () => {
    expect(
      weeklyTimeEntryInputSchema.safeParse({
        projectId: "seed-project-portal",
        activityType: "WORKDAY",
        weekStart: "2026-06-08",
        hoursPerDay: 8,
        weekdays: [1, 2, 3, 4, 5],
        description: "",
        billable: true,
      }).success,
    ).toBe(true);
  });

  it("requires at least one weekday and valid daily hours", () => {
    expect(
      weeklyTimeEntryInputSchema.safeParse({
        projectId: "seed-project-portal",
        activityType: "WORKDAY",
        weekStart: "2026-06-08",
        hoursPerDay: 25,
        weekdays: [],
        description: "",
        billable: true,
      }).success,
    ).toBe(false);
  });
});

describe("decideHoursSchema", () => {
  it("requires at least one entry id", () => {
    expect(
      decideHoursSchema.safeParse({
        entryIds: [],
        decision: "APPROVED",
        comment: "",
      }).success,
    ).toBe(false);
  });

  it("allows approval without a comment", () => {
    expect(
      decideHoursSchema.safeParse({
        entryIds: ["entry-1"],
        decision: "APPROVED",
        comment: "",
      }).success,
    ).toBe(true);
  });

  it("requires a non-empty comment to reject", () => {
    const result = decideHoursSchema.safeParse({
      entryIds: ["entry-1"],
      decision: "REJECTED",
      comment: "   ",
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      const issue = result.error.issues[0];
      expect(issue.path).toEqual(["comment"]);
      expect(issue.message).toBe(COMMENT_REQUIRED_MESSAGE);
    }
  });

  it("accepts a justified rejection", () => {
    expect(
      decideHoursSchema.safeParse({
        entryIds: ["entry-1"],
        decision: "REJECTED",
        comment: "Sem descrição da atividade.",
      }).success,
    ).toBe(true);
  });
});
