import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const WEEKDAY = new Date("2026-06-10T00:00:00Z"); // Wednesday
const NOW = new Date("2026-06-10T12:00:00Z");
const TEN_MIN_AGO = new Date(NOW.getTime() - 10 * 60_000);
const TWO_MIN_AGO = new Date(NOW.getTime() - 2 * 60_000);

type Entry = {
  id: string;
  consultantId: string;
  projectId: string;
  activityType: string;
  date: Date;
  hours: number;
  status: string;
  submittedAt: Date | null;
};

// Stateful in-memory Prisma mock. The findMany honors the status filter (string
// or { in } and the SUBMITTED/APPROVED distinction) so cross-status cases are
// exercised for real, not faked.
const h = vi.hoisted(() => {
  const store: {
    entries: Entry[];
    approvals: Record<string, unknown>[];
    audits: Record<string, unknown>[];
    forceUpdateZero: boolean;
  } = { entries: [], approvals: [], audits: [], forceUpdateZero: false };

  const prismaMock = {
    automationConfig: {
      upsert: async () => ({
        autoApprovalEnabled: true,
        requiredDailyMinutes: 480,
        approvalDelayMinutes: 5,
        reportRecipientEmail: null,
      }),
    },
    timeEntry: {
      findMany: async ({ where }: { where: { status: unknown } }) => {
        const s = where.status as string | { in: string[] };
        const match =
          typeof s === "string"
            ? (e: Entry) => e.status === s
            : (e: Entry) => s.in.includes(e.status);
        return store.entries.filter(match).map((e) => ({ ...e }));
      },
      updateMany: async ({
        where,
        data,
      }: {
        where: { id: string; status: string };
        data: { status: string };
      }) => {
        if (store.forceUpdateZero) return { count: 0 };
        const e = store.entries.find(
          (x) => x.id === where.id && x.status === where.status,
        );
        if (!e) return { count: 0 };
        e.status = data.status;
        return { count: 1 };
      },
    },
    autoApprovalException: { findMany: async () => [] },
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
    $transaction: async (fn: (tx: unknown) => Promise<unknown>) =>
      fn(prismaMock),
  };
  return { store, prismaMock };
});

vi.mock("@jumpflow/database", () => ({
  prisma: h.prismaMock,
  Prisma: { JsonNull: "__JsonNull__" },
}));

import { runAutoApproval } from "@/lib/automation/auto-approval";

function entry(over: Partial<Entry> = {}): Entry {
  return {
    id: "e1",
    consultantId: "c1",
    projectId: "p1",
    activityType: "DEV",
    date: WEEKDAY,
    hours: 8,
    status: "SUBMITTED",
    submittedAt: TEN_MIN_AGO,
    ...over,
  };
}

beforeEach(() => {
  vi.stubEnv("DATABASE_URL", "postgresql://u:p@localhost:5432/db");
  h.store.entries = [entry()];
  h.store.approvals = [];
  h.store.audits = [];
  h.store.forceUpdateZero = false;
});

afterEach(() => vi.unstubAllEnvs());

describe("runAutoApproval — idempotency", () => {
  it("approves once, does nothing on a second run, audits the rule", async () => {
    const first = await runAutoApproval(NOW);
    expect(first.approved).toBe(1);
    expect(first.ruleCounts).toEqual({ DEFAULT: 1 });

    const second = await runAutoApproval(NOW);
    expect(second.approved).toBe(0);
    expect(second.processed).toBe(0);

    expect(h.store.approvals).toHaveLength(1);
    expect(h.store.approvals[0]).toMatchObject({
      entityType: "TIME_ENTRY",
      isAutomatic: true,
      ruleKey: "DEFAULT",
      approverUserId: null,
    });
    expect(h.store.audits).toHaveLength(1);
    expect(h.store.audits[0]).toMatchObject({
      action: "TIME_ENTRY_AUTO_APPROVED",
    });
    expect(h.store.entries[0].status).toBe("APPROVED");
  });

  it("does not approve and writes nothing when the status guard loses the race", async () => {
    h.store.forceUpdateZero = true; // simulate a concurrent run that already won
    const result = await runAutoApproval(NOW);
    expect(result.approved).toBe(0);
    expect(result.raced).toBe(1);
    expect(h.store.approvals).toHaveLength(0);
    expect(h.store.audits).toHaveLength(0);
  });
});

describe("runAutoApproval — daily total across statuses", () => {
  it("approves a SUBMITTED entry once already-APPROVED hours complete the 8h", async () => {
    h.store.entries = [
      entry({ id: "approved", status: "APPROVED", hours: 4, activityType: "DEV", projectId: "pA" }),
      entry({ id: "pending", status: "SUBMITTED", hours: 4, activityType: "QA", projectId: "pB" }),
    ];
    const result = await runAutoApproval(NOW);
    expect(result.approved).toBe(1); // only the SUBMITTED one is transitioned
    expect(h.store.entries.find((e) => e.id === "pending")?.status).toBe("APPROVED");
  });

  it("blocks a SUBMITTED entry that duplicates an APPROVED one", async () => {
    h.store.entries = [
      entry({ id: "approved", status: "APPROVED", hours: 4 }),
      entry({ id: "dup", status: "SUBMITTED", hours: 4 }), // same consultant/project/date/activity
    ];
    const result = await runAutoApproval(NOW);
    expect(result.approved).toBe(0);
    expect(result.pending).toBe(1);
    expect(h.store.entries.find((e) => e.id === "dup")?.status).toBe("SUBMITTED");
  });
});

describe("runAutoApproval — rule outcomes", () => {
  it("keeps an entry pending when the day does not total 8h", async () => {
    h.store.entries = [entry({ hours: 6 })];
    const result = await runAutoApproval(NOW);
    expect(result.approved).toBe(0);
    expect(result.pending).toBe(1);
    expect(h.store.entries[0].status).toBe("SUBMITTED");
  });

  it("keeps an entry pending when the 5-minute delay has not elapsed", async () => {
    h.store.entries = [entry({ submittedAt: TWO_MIN_AGO })];
    const result = await runAutoApproval(NOW);
    expect(result.approved).toBe(0);
    expect(result.pending).toBe(1);
  });
});
