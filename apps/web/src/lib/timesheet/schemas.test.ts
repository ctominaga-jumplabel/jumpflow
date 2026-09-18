import { describe, expect, it } from "vitest";
import {
  BATCH_MAX_CONSULTANTS,
  BATCH_MAX_RANGE_DAYS,
  batchTimeEntryInputSchema,
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
  startTime: "09:00",
  breakStart: "12:00",
  breakEnd: "13:00",
  endTime: "18:00",
  description: "Trabalho no portal",
  billable: true,
};

describe("timeEntryInputSchema", () => {
  it("accepts a valid entry (including non-cuid seeded ids)", () => {
    expect(timeEntryInputSchema.safeParse(validEntry).success).toBe(true);
  });

  it("accepts an entry without a break (Pausa/Retorno removidos)", () => {
    const noBreak = {
      ...validEntry,
      breakStart: null,
      breakEnd: null,
    };
    expect(timeEntryInputSchema.safeParse(noBreak).success).toBe(true);
  });

  it("rejects an inverted or zero-length interval", () => {
    expect(
      timeEntryInputSchema.safeParse({
        ...validEntry,
        startTime: "18:00",
        endTime: "09:00",
      }).success,
    ).toBe(false);
    expect(
      timeEntryInputSchema.safeParse({
        ...validEntry,
        startTime: "09:00",
        endTime: "09:00",
      }).success,
    ).toBe(false);
  });

  it("rejects a break outside the worked interval", () => {
    expect(
      timeEntryInputSchema.safeParse({
        ...validEntry,
        breakStart: "08:00",
        breakEnd: "08:30",
      }).success,
    ).toBe(false);
  });

  it("rejects only one of Pausa/Retorno", () => {
    expect(
      timeEntryInputSchema.safeParse({
        ...validEntry,
        breakStart: "12:00",
        breakEnd: null,
      }).success,
    ).toBe(false);
  });

  it("requires a non-empty description", () => {
    expect(
      timeEntryInputSchema.safeParse({ ...validEntry, description: "  " }).success,
    ).toBe(false);
    expect(
      timeEntryInputSchema.safeParse({ ...validEntry, description: undefined })
        .success,
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
        startTime: "09:00",
        endTime: "15:00",
        breakStart: null,
        breakEnd: null,
        description: "Ajuste",
        billable: false,
      }).success,
    ).toBe(true);
  });

  it("rejects an empty id", () => {
    expect(
      updateTimeEntryInputSchema.safeParse({
        id: " ",
        startTime: "09:00",
        endTime: "15:00",
        description: "Ajuste",
        billable: true,
      }).success,
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
        startTime: "09:00",
        breakStart: "12:00",
        breakEnd: "13:00",
        endTime: "18:00",
        weekdays: [1, 2, 3, 4, 5],
        description: "Rotina semanal",
        billable: true,
      }).success,
    ).toBe(true);
  });

  it("requires at least one weekday and valid clock times", () => {
    expect(
      weeklyTimeEntryInputSchema.safeParse({
        projectId: "seed-project-portal",
        activityType: "WORKDAY",
        weekStart: "2026-06-08",
        startTime: "18:00",
        endTime: "09:00",
        breakStart: null,
        breakEnd: null,
        weekdays: [],
        description: "Rotina semanal",
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

const validBatch = {
  projectId: "seed-project-portal",
  consultantIds: ["seed-consultant-ana", "seed-consultant-bruno"],
  activityType: "WORKDAY" as const,
  startDate: "2026-06-01",
  endDate: "2026-06-30",
  startTime: "09:00",
  breakStart: "12:00",
  breakEnd: "13:00",
  endTime: "18:00",
  description: "Sustentação do portal",
  billable: true,
};

describe("batchTimeEntryInputSchema (lançamento em lote do gestor)", () => {
  it("accepts a valid range over several consultants", () => {
    const result = batchTimeEntryInputSchema.safeParse(validBatch);
    expect(result.success).toBe(true);
    // A flag de fim de semana é DESLIGADA por padrão: sábado e domingo só
    // entram quando o gestor pede explicitamente.
    if (result.success) expect(result.data.includeWeekends).toBe(false);
  });

  it("keeps an explicit includeWeekends", () => {
    const result = batchTimeEntryInputSchema.safeParse({
      ...validBatch,
      includeWeekends: true,
    });
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.includeWeekends).toBe(true);
  });

  it("accepts a single-day range (De = Até)", () => {
    expect(
      batchTimeEntryInputSchema.safeParse({
        ...validBatch,
        startDate: "2026-06-10",
        endDate: "2026-06-10",
      }).success,
    ).toBe(true);
  });

  it("rejects an inverted range (Até antes de De)", () => {
    const result = batchTimeEntryInputSchema.safeParse({
      ...validBatch,
      startDate: "2026-06-30",
      endDate: "2026-06-01",
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0]?.path).toEqual(["endDate"]);
    }
  });

  it("rejects a range longer than the cap", () => {
    // 2026-01-01 + BATCH_MAX_RANGE_DAYS dias = um dia além do teto.
    const end = new Date(
      Date.UTC(2026, 0, 1) + BATCH_MAX_RANGE_DAYS * 86_400_000,
    )
      .toISOString()
      .slice(0, 10);
    const result = batchTimeEntryInputSchema.safeParse({
      ...validBatch,
      startDate: "2026-01-01",
      endDate: end,
    });
    expect(result.success).toBe(false);
  });

  it("requires at least one consultant and caps the selection", () => {
    expect(
      batchTimeEntryInputSchema.safeParse({ ...validBatch, consultantIds: [] })
        .success,
    ).toBe(false);
    expect(
      batchTimeEntryInputSchema.safeParse({
        ...validBatch,
        consultantIds: Array.from(
          { length: BATCH_MAX_CONSULTANTS + 1 },
          (_, index) => `consultant-${index}`,
        ),
      }).success,
    ).toBe(false);
  });

  it("still validates the clock (Saída antes da Início)", () => {
    expect(
      batchTimeEntryInputSchema.safeParse({
        ...validBatch,
        startTime: "18:00",
        endTime: "09:00",
      }).success,
    ).toBe(false);
  });

  it("requires a description", () => {
    expect(
      batchTimeEntryInputSchema.safeParse({ ...validBatch, description: "  " })
        .success,
    ).toBe(false);
  });
});
