import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Server-action tests with a stateful in-memory Prisma mock (same pattern as
 * auto-approval-run.test.ts). The mock honors only the where-shapes the
 * actions actually issue; cases follow docs/horas-persistencia.md section 8.
 */

interface UserRec {
  id: string;
  name: string;
  email: string;
}
interface ConsultantRec {
  id: string;
  userId: string | null;
  email: string;
  name: string;
}
interface ProjectRec {
  id: string;
  status: string;
  managerUserId: string | null;
}
interface AllocationRec {
  id: string;
  consultantId: string;
  projectId: string;
  status: string;
  startDate: Date;
  endDate: Date | null;
}
interface PeriodRec {
  id: string;
  consultantId: string;
  startDate: Date;
  endDate: Date;
  status: string;
  submittedAt: Date | null;
}
interface EntryRec {
  id: string;
  periodId: string;
  consultantId: string;
  projectId: string;
  allocationId: string | null;
  date: Date;
  hours: number;
  activityType: string;
  description: string | null;
  billable: boolean;
  status: string;
  submittedAt: Date | null;
}

// The in-memory mock interprets dynamic where-shapes; `any` would be flagged,
// so use a loose-but-lintable record type.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Where = Record<string, any>;

const h = vi.hoisted(() => {
  const store = {
    users: [] as UserRec[],
    consultants: [] as ConsultantRec[],
    projects: [] as ProjectRec[],
    allocations: [] as AllocationRec[],
    periods: [] as PeriodRec[],
    entries: [] as EntryRec[],
    approvals: [] as Record<string, unknown>[],
    audits: [] as Record<string, unknown>[],
    currentUser: {
      id: "dev-user",
      name: "Ana Martins",
      email: "ana@jumplabel.com.br",
      roles: ["ADMIN"] as string[],
    },
    seq: 0,
  };

  const nextId = (prefix: string) => `${prefix}-${++store.seq}`;

  function matchEntry(e: EntryRec, where: Where): boolean {
    if (where.id !== undefined) {
      if (typeof where.id === "string") {
        if (e.id !== where.id) return false;
      } else {
        if (where.id.in && !where.id.in.includes(e.id)) return false;
        if (where.id.not && e.id === where.id.not) return false;
      }
    }
    if (where.consultantId && e.consultantId !== where.consultantId) return false;
    if (where.projectId && e.projectId !== where.projectId) return false;
    if (where.periodId && e.periodId !== where.periodId) return false;
    if (where.activityType && e.activityType !== where.activityType) return false;
    if (where.status) {
      if (typeof where.status === "string") {
        if (e.status !== where.status) return false;
      } else if (where.status.in && !where.status.in.includes(e.status)) {
        return false;
      }
    }
    if (where.date instanceof Date) {
      if (e.date.getTime() !== where.date.getTime()) return false;
    } else if (where.date) {
      if (where.date.gte && e.date.getTime() < where.date.gte.getTime()) return false;
      if (where.date.lte && e.date.getTime() > where.date.lte.getTime()) return false;
    }
    if (where.project?.managerUserId) {
      const project = store.projects.find((p) => p.id === e.projectId);
      if (!project || project.managerUserId !== where.project.managerUserId) {
        return false;
      }
    }
    return true;
  }

  function entryWithInclude(e: EntryRec, include?: Where) {
    const out: Record<string, unknown> = { ...e };
    if (include?.project) {
      out.project = { ...store.projects.find((p) => p.id === e.projectId)! };
    }
    if (include?.period) {
      out.period = { ...store.periods.find((p) => p.id === e.periodId)! };
    }
    if (include?.consultant) {
      const consultant = store.consultants.find((c) => c.id === e.consultantId);
      out.consultant = consultant
        ? { userId: consultant.userId, email: consultant.email }
        : { userId: null, email: "" };
    }
    return out;
  }

  const prismaMock = {
    user: {
      findUnique: async ({ where }: { where: Where }) => {
        const user = where.id
          ? store.users.find((u) => u.id === where.id)
          : store.users.find((u) => u.email === where.email);
        return user ? { ...user } : null;
      },
    },
    consultant: {
      findUnique: async ({ where }: { where: Where }) => {
        const consultant =
          where.userId !== undefined
            ? store.consultants.find((c) => c.userId === where.userId)
            : store.consultants.find((c) => c.email === where.email);
        return consultant ? { ...consultant } : null;
      },
    },
    project: {
      findUnique: async ({ where }: { where: Where }) => {
        const project = store.projects.find((p) => p.id === where.id);
        return project ? { ...project } : null;
      },
    },
    allocation: {
      findFirst: async ({ where }: { where: Where }) => {
        const date: Date = where.startDate.lte;
        const found = store.allocations.find(
          (a) =>
            a.consultantId === where.consultantId &&
            a.projectId === where.projectId &&
            a.status === where.status &&
            a.startDate.getTime() <= date.getTime() &&
            (a.endDate === null || a.endDate.getTime() >= date.getTime()),
        );
        return found ? { ...found } : null;
      },
    },
    timesheetPeriod: {
      findUnique: async ({ where, include }: { where: Where; include?: Where }) => {
        let period: PeriodRec | undefined;
        if (where.id) {
          period = store.periods.find((p) => p.id === where.id);
        } else {
          const key = where.consultantId_startDate_endDate;
          period = store.periods.find(
            (p) =>
              p.consultantId === key.consultantId &&
              p.startDate.getTime() === key.startDate.getTime() &&
              p.endDate.getTime() === key.endDate.getTime(),
          );
        }
        if (!period) return null;
        const out: Record<string, unknown> = { ...period };
        if (include?.entries) {
          out.entries = store.entries
            .filter((e) => e.periodId === period!.id)
            .map((e) => ({ status: e.status }));
        }
        return out;
      },
      upsert: async ({ where, create }: { where: Where; create: Where }) => {
        const key = where.consultantId_startDate_endDate;
        const existing = store.periods.find(
          (p) =>
            p.consultantId === key.consultantId &&
            p.startDate.getTime() === key.startDate.getTime() &&
            p.endDate.getTime() === key.endDate.getTime(),
        );
        if (existing) return { ...existing };
        const period: PeriodRec = {
          id: nextId("period"),
          consultantId: create.consultantId,
          startDate: create.startDate,
          endDate: create.endDate,
          status: create.status ?? "DRAFT",
          submittedAt: null,
        };
        store.periods.push(period);
        return { ...period };
      },
      update: async ({ where, data }: { where: Where; data: Where }) => {
        const period = store.periods.find((p) => p.id === where.id)!;
        Object.assign(period, data);
        return { ...period };
      },
    },
    timeEntry: {
      findUnique: async ({ where, include }: { where: Where; include?: Where }) => {
        const entry = store.entries.find((e) => e.id === where.id);
        return entry ? entryWithInclude(entry, include) : null;
      },
      findFirst: async ({ where }: { where: Where }) => {
        const entry = store.entries.find((e) => matchEntry(e, where));
        return entry ? { ...entry } : null;
      },
      findMany: async ({ where, include }: { where: Where; include?: Where }) =>
        store.entries
          .filter((e) => matchEntry(e, where))
          .map((e) => entryWithInclude(e, include)),
      create: async ({ data }: { data: Where }) => {
        const entry: EntryRec = {
          id: nextId("entry"),
          periodId: data.periodId,
          consultantId: data.consultantId,
          projectId: data.projectId,
          allocationId: data.allocationId ?? null,
          date: data.date,
          hours: Number(data.hours),
          activityType: data.activityType,
          description: data.description ?? null,
          billable: data.billable,
          status: data.status,
          submittedAt: data.submittedAt ?? null,
        };
        store.entries.push(entry);
        return { ...entry };
      },
      update: async ({ where, data }: { where: Where; data: Where }) => {
        const entry = store.entries.find((e) => e.id === where.id)!;
        Object.assign(entry, data, data.hours ? { hours: Number(data.hours) } : {});
        return { ...entry };
      },
      updateMany: async ({ where, data }: { where: Where; data: Where }) => {
        const matched = store.entries.filter((e) => matchEntry(e, where));
        for (const entry of matched) Object.assign(entry, data);
        return { count: matched.length };
      },
      delete: async ({ where }: { where: Where }) => {
        const index = store.entries.findIndex((e) => e.id === where.id);
        const [removed] = store.entries.splice(index, 1);
        return removed;
      },
    },
    approval: {
      create: async ({ data }: { data: Record<string, unknown> }) => {
        store.approvals.push(data);
        return data;
      },
    },
    auditEvent: {
      create: async ({ data }: { data: Record<string, unknown> }) => {
        store.audits.push(data);
        return data;
      },
    },
    $transaction: async (fn: (tx: unknown) => Promise<unknown>) => fn(prismaMock),
  };

  return { store, prismaMock };
});

vi.mock("@jumpflow/database", () => ({
  prisma: h.prismaMock,
  Prisma: { JsonNull: "__JsonNull__" },
}));

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

vi.mock("@/lib/auth/guards", () => ({
  requireUser: vi.fn(async () => h.store.currentUser),
  requireRole: vi.fn(async () => h.store.currentUser),
}));

import {
  copyPreviousWeek,
  createTimeEntry,
  createWeeklyTimeEntries,
  decideHours,
  deleteTimeEntry,
  submitWeek,
  updateTimeEntry,
} from "./actions";

const MONDAY = new Date("2026-06-08T00:00:00.000Z");
const SUNDAY = new Date("2026-06-14T00:00:00.000Z");
const PREV_MONDAY = new Date("2026-06-01T00:00:00.000Z");
const PREV_SUNDAY = new Date("2026-06-07T00:00:00.000Z");

function seedEntry(over: Partial<EntryRec> = {}): EntryRec {
  const entry: EntryRec = {
    id: `seeded-${++h.store.seq}`,
    periodId: "period-current",
    consultantId: "con-1",
    projectId: "proj-1",
    allocationId: "alloc-1",
    date: new Date("2026-06-10T00:00:00.000Z"),
    hours: 8,
    activityType: "WORKDAY",
    description: null,
    billable: true,
    status: "DRAFT",
    submittedAt: null,
    ...over,
  };
  h.store.entries.push(entry);
  return entry;
}

function seedCurrentPeriod(status = "DRAFT"): PeriodRec {
  const period: PeriodRec = {
    id: "period-current",
    consultantId: "con-1",
    startDate: MONDAY,
    endDate: SUNDAY,
    status,
    submittedAt: null,
  };
  h.store.periods.push(period);
  return period;
}

beforeEach(() => {
  vi.stubEnv("DATABASE_URL", "postgresql://u:p@localhost:5432/db");
  // The email fallback for the synthetic session id only applies under dev
  // auth (production requires Consultant.userId), so the harness opts in.
  vi.stubEnv("AUTH_DEV_MODE", "true");
  h.store.seq = 0;
  // The session user id ("dev-user") deliberately does NOT match the db user
  // id ("user-1") to exercise the email fallback (dev-mode constraint).
  h.store.currentUser = {
    id: "dev-user",
    name: "Ana Martins",
    email: "ana@jumplabel.com.br",
    roles: ["ADMIN"],
  };
  h.store.users = [
    { id: "user-1", name: "Ana Martins", email: "ana@jumplabel.com.br" },
    { id: "user-2", name: "Bruno Costa", email: "bruno@jumplabel.com.br" },
  ];
  h.store.consultants = [
    {
      id: "con-1",
      userId: "user-1",
      email: "ana@jumplabel.com.br",
      name: "Ana Martins",
    },
    // A SECOND consultant whose hours the current user may decide (segregation
    // of duties: the user can never approve con-1, their own linked consultant).
    {
      id: "con-2",
      userId: "user-2",
      email: "bruno@jumplabel.com.br",
      name: "Bruno Costa",
    },
  ];
  h.store.projects = [
    { id: "proj-1", status: "ACTIVE", managerUserId: "user-1" },
    { id: "proj-other", status: "ACTIVE", managerUserId: "someone-else" },
    { id: "proj-closed", status: "CLOSED", managerUserId: "user-1" },
  ];
  h.store.allocations = [
    {
      id: "alloc-1",
      consultantId: "con-1",
      projectId: "proj-1",
      status: "ACTIVE",
      startDate: new Date("2026-01-05T00:00:00.000Z"),
      endDate: null,
    },
    {
      id: "alloc-planned",
      consultantId: "con-1",
      projectId: "proj-other",
      status: "PLANNED",
      startDate: new Date("2026-01-05T00:00:00.000Z"),
      endDate: null,
    },
  ];
  h.store.periods = [];
  h.store.entries = [];
  h.store.approvals = [];
  h.store.audits = [];
});

afterEach(() => vi.unstubAllEnvs());

const baseInput = {
  projectId: "proj-1",
  activityType: "WORKDAY" as const,
  date: "2026-06-10",
  hours: 8,
  description: "",
  billable: true,
};

describe("createTimeEntry — allocation rule", () => {
  it("rejects a project without any allocation", async () => {
    h.store.allocations = [];
    const result = await createTimeEntry(baseInput);
    expect(result).toMatchObject({ ok: false, error: "NO_ACTIVE_ALLOCATION" });
  });

  it("rejects a PLANNED allocation", async () => {
    const result = await createTimeEntry({ ...baseInput, projectId: "proj-other" });
    expect(result).toMatchObject({ ok: false, error: "NO_ACTIVE_ALLOCATION" });
  });

  it("rejects an expired allocation", async () => {
    h.store.allocations[0].endDate = new Date("2026-06-09T00:00:00.000Z");
    const result = await createTimeEntry(baseInput);
    expect(result).toMatchObject({ ok: false, error: "NO_ACTIVE_ALLOCATION" });
  });

  it("rejects a CLOSED project before checking allocation", async () => {
    const result = await createTimeEntry({ ...baseInput, projectId: "proj-closed" });
    expect(result).toMatchObject({ ok: false, error: "PROJECT_CLOSED" });
  });
});

describe("createTimeEntry — persistence", () => {
  it("creates a SUBMITTED entry at midnight UTC, upserts the period and audits the save", async () => {
    const result = await createTimeEntry(baseInput);
    expect(result.ok).toBe(true);
    expect(h.store.entries).toHaveLength(1);
    const entry = h.store.entries[0];
    // Rodada 4.3: a complete entry enters approval as soon as it is saved.
    expect(entry.status).toBe("SUBMITTED");
    expect(entry.submittedAt).toBeInstanceOf(Date);
    expect(entry.allocationId).toBe("alloc-1");
    expect(entry.date.toISOString()).toBe("2026-06-10T00:00:00.000Z");
    expect(h.store.periods).toHaveLength(1);
    expect(h.store.periods[0].startDate.toISOString()).toBe(
      "2026-06-08T00:00:00.000Z",
    );
    expect(h.store.periods[0].endDate.toISOString()).toBe(
      "2026-06-14T00:00:00.000Z",
    );
    // The save is audited with the REAL db user id (session id is "dev-user").
    expect(h.store.audits).toHaveLength(1);
    expect(h.store.audits[0]).toMatchObject({
      action: "TIME_ENTRY_SUBMITTED_ON_SAVE",
      entityType: "TimeEntry",
      actorUserId: "user-1",
      after: { entryId: entry.id, hours: 8, merged: false },
    });
  });

  it("blocks a duplicate over a SUBMITTED entry", async () => {
    seedCurrentPeriod("SUBMITTED");
    seedEntry({ status: "SUBMITTED", submittedAt: new Date() });
    const result = await createTimeEntry(baseInput);
    expect(result).toMatchObject({ ok: false, error: "DUPLICATE_ENTRY" });
  });

  it("merges into an existing DRAFT for the same key and resubmits it", async () => {
    seedCurrentPeriod();
    const existing = seedEntry({ hours: 4 });
    const result = await createTimeEntry({ ...baseInput, hours: 6 });
    expect(result.ok).toBe(true);
    expect(h.store.entries).toHaveLength(1);
    expect(h.store.entries[0].id).toBe(existing.id);
    expect(h.store.entries[0].hours).toBe(6);
    // Rodada 4.3: the merged entry is resubmitted for approval.
    expect(h.store.entries[0].status).toBe("SUBMITTED");
    expect(h.store.entries[0].submittedAt).toBeInstanceOf(Date);
    expect(h.store.audits[0]).toMatchObject({
      action: "TIME_ENTRY_SUBMITTED_ON_SAVE",
      after: { entryId: existing.id, merged: true },
    });
  });

  it("blocks a CLOSED period", async () => {
    seedCurrentPeriod("CLOSED");
    const result = await createTimeEntry(baseInput);
    expect(result).toMatchObject({ ok: false, error: "PERIOD_CLOSED" });
  });
});

describe("createWeeklyTimeEntries", () => {
  it("creates selected weekdays, skips duplicates and dates outside allocation", async () => {
    seedCurrentPeriod();
    seedEntry({
      date: new Date("2026-06-09T00:00:00.000Z"),
      status: "SUBMITTED",
      submittedAt: new Date(),
    });
    h.store.allocations[0].endDate = new Date("2026-06-10T00:00:00.000Z");

    const result = await createWeeklyTimeEntries({
      projectId: "proj-1",
      activityType: "WORKDAY",
      weekStart: "2026-06-08",
      hoursPerDay: 6,
      weekdays: [1, 2, 3, 4, 5],
      description: "Rotina semanal",
      billable: true,
    });

    expect(result).toMatchObject({
      ok: true,
      data: {
        created: 2,
        skippedExisting: 1,
        skippedOutOfAllocation: 2,
      },
    });
    const created = h.store.entries.filter((entry) => entry.hours === 6);
    expect(created.map((entry) => entry.date.toISOString().slice(0, 10))).toEqual([
      "2026-06-08",
      "2026-06-10",
    ]);
    expect(created.every((entry) => entry.status === "SUBMITTED")).toBe(true);
    expect(
      h.store.audits.filter((audit) => audit.action === "TIME_ENTRY_WEEKLY_CREATED"),
    ).toHaveLength(2);
  });

  it("does not create an empty period when every selected day is outside allocation", async () => {
    h.store.allocations[0].endDate = new Date("2026-06-07T00:00:00.000Z");

    const result = await createWeeklyTimeEntries({
      projectId: "proj-1",
      activityType: "WORKDAY",
      weekStart: "2026-06-08",
      hoursPerDay: 6,
      weekdays: [1],
      description: "",
      billable: true,
    });

    expect(result).toMatchObject({
      ok: true,
      data: {
        created: 0,
        skippedExisting: 0,
        skippedOutOfAllocation: 1,
      },
    });
    expect(h.store.periods).toHaveLength(0);
    expect(h.store.entries).toHaveLength(0);
  });
});

describe("updateTimeEntry / deleteTimeEntry — editability", () => {
  it.each(["APPROVED", "CLOSED"])(
    "refuses to edit a %s entry",
    async (status) => {
      // Period stays open so the entry status (not PERIOD_CLOSED) is the blocker.
      seedCurrentPeriod();
      const entry = seedEntry({ status });
      const result = await updateTimeEntry({
        id: entry.id,
        hours: 5,
        billable: true,
      });
      expect(result).toMatchObject({ ok: false, error: "NOT_EDITABLE" });
    },
  );

  it("re-submits a SUBMITTED entry on edit, auditing the reopened status", async () => {
    // A still-pending (SUBMITTED) entry stays editable; the save re-submits it
    // with a fresh submittedAt and records the previous status in the audit.
    seedCurrentPeriod("SUBMITTED");
    const submittedAt = new Date("2026-06-08T10:00:00Z");
    const entry = seedEntry({ status: "SUBMITTED", submittedAt });
    const result = await updateTimeEntry({ id: entry.id, hours: 6, billable: true });
    expect(result.ok).toBe(true);
    expect(h.store.entries[0].status).toBe("SUBMITTED");
    expect(h.store.entries[0].hours).toBe(6);
    // submittedAt is refreshed so the auto-approval delay restarts.
    expect(h.store.entries[0].submittedAt).toBeInstanceOf(Date);
    expect(h.store.entries[0].submittedAt?.getTime()).toBeGreaterThan(
      submittedAt.getTime(),
    );
    expect(h.store.audits[0]).toMatchObject({
      action: "TIME_ENTRY_SUBMITTED_ON_SAVE",
      actorUserId: "user-1",
      before: { status: "SUBMITTED" },
      after: { entryId: entry.id, resubmit: true },
    });
  });

  it("resubmits a REJECTED entry for approval on edit", async () => {
    seedCurrentPeriod("REJECTED");
    const entry = seedEntry({ status: "REJECTED", submittedAt: new Date() });
    const result = await updateTimeEntry({ id: entry.id, hours: 5, billable: true });
    expect(result.ok).toBe(true);
    // Rodada 4.3: editing a REJECTED entry resubmits it (REJECTED -> SUBMITTED).
    expect(h.store.entries[0].status).toBe("SUBMITTED");
    expect(h.store.entries[0].submittedAt).toBeInstanceOf(Date);
    // Period recomputed: no REJECTED/DRAFT entries left.
    expect(h.store.periods[0].status).toBe("SUBMITTED");
    expect(h.store.audits[0]).toMatchObject({
      action: "TIME_ENTRY_SUBMITTED_ON_SAVE",
      actorUserId: "user-1",
      before: { status: "REJECTED" },
      after: { entryId: entry.id, resubmit: true },
    });
  });

  it("rejects a date change outside the period week", async () => {
    seedCurrentPeriod();
    const entry = seedEntry();
    const result = await updateTimeEntry({
      id: entry.id,
      hours: 5,
      billable: true,
      date: "2026-06-15",
    });
    expect(result).toMatchObject({ ok: false, error: "INVALID_INPUT" });
  });

  it("blocks edits from another consultant (ownership)", async () => {
    seedCurrentPeriod();
    const entry = seedEntry({ consultantId: "con-2" });
    const result = await updateTimeEntry({ id: entry.id, hours: 5, billable: true });
    expect(result).toMatchObject({ ok: false, error: "FORBIDDEN" });
  });

  it("deletes only DRAFT/REJECTED entries", async () => {
    seedCurrentPeriod();
    const draft = seedEntry();
    const submitted = seedEntry({
      status: "SUBMITTED",
      activityType: "MEETING",
      submittedAt: new Date(),
    });

    expect(await deleteTimeEntry({ id: submitted.id })).toMatchObject({
      ok: false,
      error: "NOT_EDITABLE",
    });
    expect(await deleteTimeEntry({ id: draft.id })).toMatchObject({ ok: true });
    expect(h.store.entries.map((e) => e.id)).toEqual([submitted.id]);
  });
});

describe("submitWeek", () => {
  it("returns NOTHING_TO_SUBMIT without a period or drafts", async () => {
    expect(await submitWeek({ weekStart: "2026-06-08" })).toMatchObject({
      ok: false,
      error: "NOTHING_TO_SUBMIT",
    });

    seedCurrentPeriod("SUBMITTED");
    seedEntry({ status: "SUBMITTED", submittedAt: new Date() });
    expect(await submitWeek({ weekStart: "2026-06-08" })).toMatchObject({
      ok: false,
      error: "NOTHING_TO_SUBMIT",
    });
  });

  it("returns PERIOD_CLOSED for a closed week even with drafts", async () => {
    seedCurrentPeriod("CLOSED");
    const draft = seedEntry();

    expect(await submitWeek({ weekStart: "2026-06-08" })).toMatchObject({
      ok: false,
      error: "PERIOD_CLOSED",
    });
    // Nothing was mutated: the draft stays untouched and unaudited.
    expect(h.store.entries[0]).toMatchObject({
      id: draft.id,
      status: "DRAFT",
      submittedAt: null,
    });
    expect(h.store.audits).toHaveLength(0);
  });

  it("submits drafts, sets submittedAt and audits with the REAL db user id", async () => {
    seedCurrentPeriod();
    seedEntry();
    seedEntry({ activityType: "MEETING", hours: 2 });

    const result = await submitWeek({ weekStart: "2026-06-08" });
    expect(result).toMatchObject({ ok: true, data: { submitted: 2 } });

    for (const entry of h.store.entries) {
      expect(entry.status).toBe("SUBMITTED");
      // Without submittedAt the auto-approval cron never approves anything.
      expect(entry.submittedAt).toBeInstanceOf(Date);
    }
    expect(h.store.periods[0].status).toBe("SUBMITTED");
    expect(h.store.periods[0].submittedAt).toBeInstanceOf(Date);

    expect(h.store.audits).toHaveLength(1);
    expect(h.store.audits[0]).toMatchObject({
      action: "TIMESHEET_PERIOD_SUBMITTED",
      entityType: "TimesheetPeriod",
      // Session id is "dev-user"; the FK must use the resolved db user.
      actorUserId: "user-1",
    });
  });
});

describe("copyPreviousWeek", () => {
  function seedSourceWeek() {
    h.store.periods.push({
      id: "period-prev",
      consultantId: "con-1",
      startDate: PREV_MONDAY,
      endDate: PREV_SUNDAY,
      status: "APPROVED",
      submittedAt: new Date(),
    });
    seedEntry({
      periodId: "period-prev",
      date: new Date("2026-06-03T00:00:00.000Z"),
      status: "APPROVED",
      hours: 8,
    });
    seedEntry({
      periodId: "period-prev",
      date: new Date("2026-06-04T00:00:00.000Z"),
      status: "REJECTED",
      hours: 4,
      activityType: "MEETING",
    });
  }

  it("copies eligible entries as DRAFT and is idempotent", async () => {
    seedSourceWeek();

    const first = await copyPreviousWeek({ weekStart: "2026-06-08" });
    expect(first).toMatchObject({
      ok: true,
      data: { copied: 1, skippedExisting: 0, skippedIneligible: 0 },
    });
    const copied = h.store.entries.find(
      (e) => e.date.getTime() === new Date("2026-06-10T00:00:00.000Z").getTime(),
    );
    // Rodada 4.3: copied entries carry hours, so they enter approval directly.
    expect(copied).toMatchObject({ status: "SUBMITTED", hours: 8 });
    expect(copied?.submittedAt).toBeInstanceOf(Date);

    const second = await copyPreviousWeek({ weekStart: "2026-06-08" });
    expect(second).toMatchObject({
      ok: true,
      data: { copied: 0, skippedExisting: 1, skippedIneligible: 0 },
    });
  });

  it("skips entries without an active allocation on the destination date", async () => {
    seedSourceWeek();
    h.store.allocations[0].endDate = PREV_SUNDAY; // valid at source, not at dest
    const result = await copyPreviousWeek({ weekStart: "2026-06-08" });
    expect(result).toMatchObject({
      ok: true,
      data: { copied: 0, skippedExisting: 0, skippedIneligible: 1 },
    });
  });

  it("skips entries of a CLOSED project, counting skippedIneligible", async () => {
    seedSourceWeek();
    // Eligible at source (APPROVED, hours > 0) but the project is now CLOSED.
    seedEntry({
      periodId: "period-prev",
      projectId: "proj-closed",
      date: new Date("2026-06-03T00:00:00.000Z"),
      status: "APPROVED",
      hours: 6,
      activityType: "SUPPORT",
    });

    const result = await copyPreviousWeek({ weekStart: "2026-06-08" });
    expect(result).toMatchObject({
      ok: true,
      data: { copied: 1, skippedExisting: 0, skippedIneligible: 1 },
    });
    // Only the proj-1 entry landed in the destination week.
    const destEntries = h.store.entries.filter(
      (e) => e.date.getTime() >= MONDAY.getTime(),
    );
    expect(destEntries).toHaveLength(1);
    expect(destEntries[0].projectId).toBe("proj-1");
  });

  it("returns PERIOD_CLOSED when the source week is empty and the destination is closed (regression: early-return skipped the dest-period check)", async () => {
    // No seedSourceWeek(): the previous week has zero eligible entries, which
    // used to short-circuit into a misleading { ok: true, copied: 0 } even
    // though the destination week was already CLOSED.
    seedCurrentPeriod("CLOSED");

    const result = await copyPreviousWeek({ weekStart: "2026-06-08" });
    expect(result).toMatchObject({ ok: false, error: "PERIOD_CLOSED" });
    // Nothing was created or mutated on the closed destination week.
    expect(h.store.entries).toHaveLength(0);
    expect(h.store.periods).toHaveLength(1);
    expect(h.store.periods[0].status).toBe("CLOSED");
    expect(h.store.audits).toHaveLength(0);
  });

  it("returns PERIOD_CLOSED when the destination week is closed", async () => {
    seedSourceWeek();
    seedCurrentPeriod("CLOSED");

    const result = await copyPreviousWeek({ weekStart: "2026-06-08" });
    expect(result).toMatchObject({ ok: false, error: "PERIOD_CLOSED" });
    // Transaction aborted before any copy: destination week stays empty.
    expect(
      h.store.entries.filter((e) => e.date.getTime() >= MONDAY.getTime()),
    ).toHaveLength(0);
  });
});

describe("decideHours", () => {
  // Decided entries belong to ANOTHER consultant (con-2): the current user is
  // linked to con-1, and segregation of duties forbids deciding own hours.
  function seedSubmitted(over: Partial<EntryRec> = {}): EntryRec {
    return seedEntry({
      consultantId: "con-2",
      status: "SUBMITTED",
      submittedAt: new Date("2026-06-09T10:00:00.000Z"),
      ...over,
    });
  }

  it("requires a comment to reject", async () => {
    seedCurrentPeriod("SUBMITTED");
    const entry = seedSubmitted();
    const result = await decideHours({
      entryIds: [entry.id],
      decision: "REJECTED",
      comment: "  ",
    });
    expect(result).toMatchObject({ ok: false, error: "COMMENT_REQUIRED" });
  });

  it("approves with Approval + AuditEvent in the same transaction", async () => {
    seedCurrentPeriod("SUBMITTED");
    const entry = seedSubmitted();
    const result = await decideHours({
      entryIds: [entry.id],
      decision: "APPROVED",
      comment: "",
    });
    expect(result).toMatchObject({
      ok: true,
      data: { decided: 1, alreadyDecided: 0 },
    });
    expect(h.store.entries[0].status).toBe("APPROVED");
    expect(h.store.approvals).toHaveLength(1);
    expect(h.store.approvals[0]).toMatchObject({
      entityType: "TIME_ENTRY",
      entityId: entry.id,
      approverUserId: "user-1", // real db id, never the "dev-user" session id
      status: "APPROVED",
      isAutomatic: false,
    });
    expect(h.store.audits).toHaveLength(1);
    expect(h.store.audits[0]).toMatchObject({
      action: "TIME_ENTRY_APPROVED",
      actorUserId: "user-1",
    });
    // Period recomputed after the batch.
    expect(h.store.periods[0].status).toBe("APPROVED");
  });

  it("counts an already-decided entry without writing Approval/Audit", async () => {
    seedCurrentPeriod("APPROVED");
    const entry = seedEntry({ consultantId: "con-2", status: "APPROVED" });
    const result = await decideHours({
      entryIds: [entry.id],
      decision: "APPROVED",
      comment: "",
    });
    expect(result).toMatchObject({
      ok: true,
      data: { decided: 0, alreadyDecided: 1 },
    });
    expect(h.store.approvals).toHaveLength(0);
    expect(h.store.audits).toHaveLength(0);
  });

  it("blocks deciding the user's OWN hours (SELF_APPROVAL), even as ADMIN", async () => {
    // The current ADMIN session resolves to con-1 (same email under dev auth);
    // approving con-1's own SUBMITTED entry must be refused.
    seedCurrentPeriod("SUBMITTED");
    const entry = seedSubmitted({ consultantId: "con-1" });
    const result = await decideHours({
      entryIds: [entry.id],
      decision: "APPROVED",
      comment: "",
    });
    expect(result).toMatchObject({ ok: false, error: "SELF_APPROVAL" });
    // Nothing was mutated, approved or audited.
    expect(h.store.entries[0].status).toBe("SUBMITTED");
    expect(h.store.approvals).toHaveLength(0);
    expect(h.store.audits).toHaveLength(0);
  });

  it("blocks a batch that MIXES own hours with others' (SELF_APPROVAL)", async () => {
    seedCurrentPeriod("SUBMITTED");
    const own = seedSubmitted({ consultantId: "con-1" });
    const other = seedSubmitted({ consultantId: "con-2", activityType: "MEETING" });
    const result = await decideHours({
      entryIds: [own.id, other.id],
      decision: "APPROVED",
      comment: "",
    });
    expect(result).toMatchObject({ ok: false, error: "SELF_APPROVAL" });
    // The whole batch is refused: even the other consultant's entry is untouched.
    expect(h.store.entries.every((e) => e.status === "SUBMITTED")).toBe(true);
    expect(h.store.approvals).toHaveLength(0);
  });

  it("forbids a PROJECT_MANAGER outside the project scope", async () => {
    h.store.currentUser.roles = ["PROJECT_MANAGER"];
    seedCurrentPeriod("SUBMITTED");
    const entry = seedSubmitted({ projectId: "proj-other" });
    const result = await decideHours({
      entryIds: [entry.id],
      decision: "APPROVED",
      comment: "",
    });
    expect(result).toMatchObject({ ok: false, error: "FORBIDDEN" });
    expect(h.store.entries[0].status).toBe("SUBMITTED");
  });

  it("recomputes EVERY affected period when the batch spans weeks", async () => {
    seedCurrentPeriod("SUBMITTED");
    h.store.periods.push({
      id: "period-prev",
      consultantId: "con-1",
      startDate: PREV_MONDAY,
      endDate: PREV_SUNDAY,
      status: "SUBMITTED",
      submittedAt: new Date("2026-06-05T10:00:00.000Z"),
    });
    const current = seedSubmitted();
    const previous = seedSubmitted({
      periodId: "period-prev",
      date: new Date("2026-06-03T00:00:00.000Z"),
      activityType: "MEETING",
    });

    const result = await decideHours({
      entryIds: [current.id, previous.id],
      decision: "APPROVED",
      comment: "",
    });
    expect(result).toMatchObject({
      ok: true,
      data: { decided: 2, alreadyDecided: 0 },
    });
    // One Approval + one AuditEvent per entry.
    expect(h.store.approvals).toHaveLength(2);
    expect(h.store.audits).toHaveLength(2);
    // Both weekly periods were recomputed, not only the first one.
    const byId = new Map(h.store.periods.map((p) => [p.id, p.status]));
    expect(byId.get("period-current")).toBe("APPROVED");
    expect(byId.get("period-prev")).toBe("APPROVED");
  });

  it("allows a PROJECT_MANAGER inside the project scope", async () => {
    h.store.currentUser.roles = ["PROJECT_MANAGER"];
    seedCurrentPeriod("SUBMITTED");
    const entry = seedSubmitted({ projectId: "proj-1" });
    const result = await decideHours({
      entryIds: [entry.id],
      decision: "REJECTED",
      comment: "Sem descrição.",
    });
    expect(result).toMatchObject({
      ok: true,
      data: { decided: 1, alreadyDecided: 0 },
    });
    expect(h.store.entries[0].status).toBe("REJECTED");
    expect(h.store.periods[0].status).toBe("REJECTED");
  });

  it("reopens an APPROVED entry back to SUBMITTED with a MANUAL Approval + audit", async () => {
    seedCurrentPeriod("APPROVED");
    const entry = seedEntry({ consultantId: "con-2", status: "APPROVED" });
    const result = await decideHours({
      entryIds: [entry.id],
      decision: "SUBMITTED",
      comment: "Reabrir para revisão.",
    });
    expect(result).toMatchObject({
      ok: true,
      data: { decided: 1, alreadyDecided: 0 },
    });
    // Entry returns to the pending queue.
    expect(h.store.entries[0].status).toBe("SUBMITTED");
    // A MANUAL Approval (isAutomatic:false) is written so the auto-approval
    // engine treats the entry as already human-handled and never re-approves.
    expect(h.store.approvals).toHaveLength(1);
    expect(h.store.approvals[0]).toMatchObject({
      entityType: "TIME_ENTRY",
      entityId: entry.id,
      approverUserId: "user-1",
      isAutomatic: false,
    });
    // The reopen intent is captured in the audit (before/after status).
    expect(h.store.audits).toHaveLength(1);
    expect(h.store.audits[0]).toMatchObject({
      action: "TIME_ENTRY_REOPENED",
      actorUserId: "user-1",
      before: { status: "APPROVED" },
      after: { status: "SUBMITTED" },
    });
    // Period recomputed back to SUBMITTED.
    expect(h.store.periods[0].status).toBe("SUBMITTED");
  });

  it("reopens a REJECTED entry back to SUBMITTED", async () => {
    seedCurrentPeriod("REJECTED");
    const entry = seedEntry({ consultantId: "con-2", status: "REJECTED" });
    const result = await decideHours({
      entryIds: [entry.id],
      decision: "SUBMITTED",
      comment: "",
    });
    expect(result).toMatchObject({
      ok: true,
      data: { decided: 1, alreadyDecided: 0 },
    });
    expect(h.store.entries[0].status).toBe("SUBMITTED");
    expect(h.store.periods[0].status).toBe("SUBMITTED");
  });

  it("switches an APPROVED entry directly to REJECTED", async () => {
    seedCurrentPeriod("APPROVED");
    const entry = seedEntry({ consultantId: "con-2", status: "APPROVED" });
    const result = await decideHours({
      entryIds: [entry.id],
      decision: "REJECTED",
      comment: "Revertendo a aprovação.",
    });
    expect(result).toMatchObject({
      ok: true,
      data: { decided: 1, alreadyDecided: 0 },
    });
    expect(h.store.entries[0].status).toBe("REJECTED");
    expect(h.store.approvals[0]).toMatchObject({ status: "REJECTED" });
  });

  it("refuses a CLOSED entry (terminal), mutating nothing", async () => {
    seedCurrentPeriod("APPROVED");
    const entry = seedEntry({ consultantId: "con-2", status: "CLOSED" });
    const result = await decideHours({
      entryIds: [entry.id],
      decision: "SUBMITTED",
      comment: "",
    });
    expect(result).toMatchObject({ ok: false, error: "PERIOD_CLOSED" });
    expect(h.store.entries[0].status).toBe("CLOSED");
    expect(h.store.approvals).toHaveLength(0);
    expect(h.store.audits).toHaveLength(0);
  });

  it("refuses any entry in a CLOSED period (terminal), mutating nothing", async () => {
    seedCurrentPeriod("CLOSED");
    const entry = seedEntry({ consultantId: "con-2", status: "APPROVED" });
    const result = await decideHours({
      entryIds: [entry.id],
      decision: "SUBMITTED",
      comment: "",
    });
    expect(result).toMatchObject({ ok: false, error: "PERIOD_CLOSED" });
    expect(h.store.entries[0].status).toBe("APPROVED");
    expect(h.store.approvals).toHaveLength(0);
  });

  it("blocks reopening the user's OWN hours (SELF_APPROVAL)", async () => {
    seedCurrentPeriod("APPROVED");
    const entry = seedEntry({ consultantId: "con-1", status: "APPROVED" });
    const result = await decideHours({
      entryIds: [entry.id],
      decision: "SUBMITTED",
      comment: "",
    });
    expect(result).toMatchObject({ ok: false, error: "SELF_APPROVAL" });
    expect(h.store.entries[0].status).toBe("APPROVED");
    expect(h.store.approvals).toHaveLength(0);
  });

  it("forbids a PROJECT_MANAGER reopening outside the project scope", async () => {
    h.store.currentUser.roles = ["PROJECT_MANAGER"];
    seedCurrentPeriod("APPROVED");
    const entry = seedEntry({
      consultantId: "con-2",
      projectId: "proj-other",
      status: "APPROVED",
    });
    const result = await decideHours({
      entryIds: [entry.id],
      decision: "SUBMITTED",
      comment: "",
    });
    expect(result).toMatchObject({ ok: false, error: "FORBIDDEN" });
    expect(h.store.entries[0].status).toBe("APPROVED");
  });

  it("is idempotent: reopening a still-SUBMITTED entry counts as alreadyDecided", async () => {
    // SUBMITTED is not an allowed SOURCE for a reopen (only APPROVED/REJECTED),
    // so the status-guard updateMany matches nothing and writes no Approval.
    seedCurrentPeriod("SUBMITTED");
    const entry = seedSubmitted();
    const result = await decideHours({
      entryIds: [entry.id],
      decision: "SUBMITTED",
      comment: "",
    });
    expect(result).toMatchObject({
      ok: true,
      data: { decided: 0, alreadyDecided: 1 },
    });
    expect(h.store.entries[0].status).toBe("SUBMITTED");
    expect(h.store.approvals).toHaveLength(0);
    expect(h.store.audits).toHaveLength(0);
  });
});

describe("guards", () => {
  // EVERY action must fail closed (NO_DATABASE) when no database is
  // configured — never fall back to mock state from a server action.
  const noDbCases: ReadonlyArray<
    [string, () => Promise<{ ok: boolean }>]
  > = [
    ["createTimeEntry", () => createTimeEntry(baseInput)],
    [
      "createWeeklyTimeEntries",
      () =>
        createWeeklyTimeEntries({
          projectId: "proj-1",
          activityType: "WORKDAY",
          weekStart: "2026-06-08",
          hoursPerDay: 8,
          weekdays: [1, 2, 3, 4, 5],
          description: "",
          billable: true,
        }),
    ],
    [
      "updateTimeEntry",
      () => updateTimeEntry({ id: "entry-x", hours: 5, billable: true }),
    ],
    ["deleteTimeEntry", () => deleteTimeEntry({ id: "entry-x" })],
    ["copyPreviousWeek", () => copyPreviousWeek({ weekStart: "2026-06-08" })],
    ["submitWeek", () => submitWeek({ weekStart: "2026-06-08" })],
    [
      "decideHours",
      () =>
        decideHours({ entryIds: ["entry-x"], decision: "APPROVED", comment: "" }),
    ],
  ];

  it.each(noDbCases)(
    "%s returns NO_DATABASE when no database is configured",
    async (_name, call) => {
      vi.stubEnv("DATABASE_URL", "");
      expect(await call()).toMatchObject({ ok: false, error: "NO_DATABASE" });
    },
  );

  it("returns NO_CONSULTANT when the user has no linked consultant", async () => {
    h.store.consultants = [];
    const result = await createTimeEntry(baseInput);
    expect(result).toMatchObject({ ok: false, error: "NO_CONSULTANT" });
  });
});
