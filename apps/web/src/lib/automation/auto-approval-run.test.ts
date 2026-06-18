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
type Rule = {
  consultantId?: string;
  projectId: string;
  weekendEnabled: boolean;
  hoursRangeEnabled: boolean;
  minMinutes: number;
  maxMinutes: number;
};

const h = vi.hoisted(() => {
  const store: {
    entries: Entry[];
    approvals: Record<string, unknown>[];
    audits: Record<string, unknown>[];
    projectRules: Rule[];
    consultantRules: Rule[];
    forceUpdateZero: boolean;
  } = {
    entries: [],
    approvals: [],
    audits: [],
    projectRules: [],
    consultantRules: [],
    forceUpdateZero: false,
  };

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
    projectAutoApprovalRule: {
      findMany: async ({ where }: { where: { projectId: { in: string[] } } }) =>
        store.projectRules
          .filter((r) => where.projectId.in.includes(r.projectId))
          .map((r) => ({ ...r })),
    },
    consultantAutoApprovalRule: {
      findMany: async ({ where }: { where: { projectId: { in: string[] } } }) =>
        store.consultantRules
          .filter((r) => where.projectId.in.includes(r.projectId))
          .map((r) => ({ ...r })),
    },
    approval: {
      // Honors the manual-history query: entityType TIME_ENTRY, entityId in [..],
      // isAutomatic: false. Reads from the same `approvals` store, so manual
      // decisions seeded by a test are visible to the engine.
      findMany: async ({
        where,
      }: {
        where: {
          entityType?: string;
          entityId?: { in: string[] };
          isAutomatic?: boolean;
        };
      }) => {
        return store.approvals
          .filter((a) => {
            if (where.entityType && a.entityType !== where.entityType) {
              return false;
            }
            if (
              where.entityId &&
              !where.entityId.in.includes(a.entityId as string)
            ) {
              return false;
            }
            if (
              where.isAutomatic !== undefined &&
              a.isAutomatic !== where.isAutomatic
            ) {
              return false;
            }
            return true;
          })
          .map((a) => ({ entityId: a.entityId }));
      },
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

import {
  collectAutoApprovalDecisions,
  runAutoApproval,
} from "@/lib/automation/auto-approval";

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
  h.store.projectRules = [];
  h.store.consultantRules = [];
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

describe("collectAutoApprovalDecisions — read-only contract", () => {
  // "ok" (8h, delay elapsed) on its own day APPROVEs; "early" (delay not yet
  // elapsed) stays PENDING. They sit on DIFFERENT days so their hours never sum
  // into the same daily total.
  const OTHER_DAY = new Date("2026-06-11T00:00:00Z"); // Thursday

  it("evaluates every SUBMITTED entry WITHOUT writing anything", async () => {
    h.store.entries = [
      entry({ id: "ok", hours: 8, submittedAt: TEN_MIN_AGO }), // would APPROVE
      entry({
        id: "early",
        hours: 8,
        submittedAt: TWO_MIN_AGO,
        projectId: "pB",
        date: OTHER_DAY,
      }), // PENDING (delay)
    ];

    const collection = await collectAutoApprovalDecisions(NOW);
    expect(collection.skipped).toBe(false);
    expect(collection.evaluations).toHaveLength(2);

    // The read-only observability path NEVER mutates: no status change, no
    // Approval and no AuditEvent are written.
    expect(h.store.entries.every((e) => e.status === "SUBMITTED")).toBe(true);
    expect(h.store.approvals).toHaveLength(0);
    expect(h.store.audits).toHaveLength(0);
  });

  it("produces the SAME decisions that runAutoApproval then applies", async () => {
    h.store.entries = [
      entry({ id: "ok", hours: 8, submittedAt: TEN_MIN_AGO }),
      entry({
        id: "early",
        hours: 8,
        submittedAt: TWO_MIN_AGO,
        projectId: "pB",
        date: OTHER_DAY,
      }),
    ];

    // Snapshot the decisions BEFORE any write happens.
    const before = await collectAutoApprovalDecisions(NOW);
    const outcomeById = new Map(
      before.evaluations.map((e) => [e.id, e.decision.outcome]),
    );
    expect(outcomeById.get("ok")).toBe("APPROVE");
    expect(outcomeById.get("early")).toBe("PENDING");

    // The write path applies exactly the APPROVE decisions and leaves the rest.
    const result = await runAutoApproval(NOW);
    expect(result.processed).toBe(2);
    expect(result.approved).toBe(1);
    expect(result.pending).toBe(1);
    expect(h.store.entries.find((e) => e.id === "ok")?.status).toBe("APPROVED");
    expect(h.store.entries.find((e) => e.id === "early")?.status).toBe(
      "SUBMITTED",
    );
  });

  it("short-circuits as skipped when no database is configured (no read, no write)", async () => {
    vi.stubEnv("DATABASE_URL", "");
    const collection = await collectAutoApprovalDecisions(NOW);
    expect(collection).toEqual({
      skipped: true,
      reason: "no-database",
      evaluations: [],
    });
    expect(h.store.approvals).toHaveLength(0);
    expect(h.store.audits).toHaveLength(0);
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

describe("runAutoApproval — manual decision history guard", () => {
  it("keeps a SUBMITTED entry PENDING when it already had a MANUAL decision, even if the default rule is satisfied", async () => {
    // A standard 8h weekday entry, delay elapsed: would APPROVE on its own.
    h.store.entries = [entry({ id: "reopened" })];
    // But it was decided manually once (e.g. approved then reopened to SUBMITTED).
    h.store.approvals = [
      {
        entityType: "TIME_ENTRY",
        entityId: "reopened",
        status: "APPROVED",
        isAutomatic: false,
        ruleKey: null,
      },
    ];

    // Read-only path surfaces the reason for the admin view.
    const collection = await collectAutoApprovalDecisions(NOW);
    const decision = collection.evaluations.find((e) => e.id === "reopened")
      ?.decision;
    expect(decision?.outcome).toBe("PENDING");
    expect(decision?.reasons).toContain("MANUAL_DECISION_HISTORY");

    // Write path does not auto-approve and writes no new Approval/audit.
    const result = await runAutoApproval(NOW);
    expect(result.approved).toBe(0);
    expect(result.pending).toBe(1);
    expect(h.store.entries.find((e) => e.id === "reopened")?.status).toBe(
      "SUBMITTED",
    );
    expect(h.store.approvals).toHaveLength(1); // only the pre-existing manual one
    expect(h.store.audits).toHaveLength(0);
  });

  it("still auto-approves a SUBMITTED entry that has NO manual history (normal flow unchanged)", async () => {
    h.store.entries = [entry({ id: "fresh" })];
    h.store.approvals = []; // no prior decisions

    const result = await runAutoApproval(NOW);
    expect(result.approved).toBe(1);
    expect(h.store.entries.find((e) => e.id === "fresh")?.status).toBe(
      "APPROVED",
    );

    // Idempotency: the auto Approval it just created (isAutomatic: true) must
    // NOT be mistaken for manual history on a re-run.
    const second = await runAutoApproval(NOW);
    expect(second.approved).toBe(0);
    expect(second.processed).toBe(0);
  });
});

describe("runAutoApproval — project/consultant rule hierarchy", () => {
  const rule = (over: Partial<Rule>): Rule => ({
    projectId: "p1",
    weekendEnabled: false,
    hoursRangeEnabled: false,
    minMinutes: 1,
    maxMinutes: 1439,
    ...over,
  });

  it("project rule (range) approves an in-range entry regardless of the 8h total", () => {
    // 6h entry would fail the 8h fallback, but the project range covers it.
    h.store.entries = [entry({ hours: 6 })];
    h.store.projectRules = [
      rule({ hoursRangeEnabled: true, minMinutes: 1, maxMinutes: 540 }),
    ];
    return runAutoApproval(NOW).then((result) => {
      expect(result.approved).toBe(1);
      expect(result.ruleCounts).toEqual({ RULE_RANGE: 1 });
      expect(h.store.entries[0].status).toBe("APPROVED");
    });
  });

  it("project rule leaves an out-of-range entry pending", async () => {
    h.store.entries = [entry({ hours: 10 })];
    h.store.projectRules = [
      rule({ hoursRangeEnabled: true, minMinutes: 1, maxMinutes: 540 }),
    ];
    const result = await runAutoApproval(NOW);
    expect(result.approved).toBe(0);
    expect(result.pending).toBe(1);
  });

  it("exclusive mode: a consultant rule in the project suspends the project rule for unlinked consultants", async () => {
    // Two consultants on p1; only c1 is linked. c2 (8h, would pass the fallback)
    // gets NO auto-approval because the project is now in per-consultant mode.
    h.store.entries = [
      entry({ id: "linked", consultantId: "c1", hours: 6 }),
      entry({ id: "unlinked", consultantId: "c2", hours: 8 }),
    ];
    h.store.consultantRules = [
      rule({
        consultantId: "c1",
        hoursRangeEnabled: true,
        minMinutes: 1,
        maxMinutes: 540,
      }),
    ];
    const result = await runAutoApproval(NOW);
    expect(result.approved).toBe(1);
    expect(h.store.entries.find((e) => e.id === "linked")?.status).toBe(
      "APPROVED",
    );
    expect(h.store.entries.find((e) => e.id === "unlinked")?.status).toBe(
      "SUBMITTED",
    );
  });

  it("falls back to the 8h rule only when the project has no configuration", async () => {
    h.store.entries = [entry({ hours: 8 })]; // 480 min total, no rules
    const result = await runAutoApproval(NOW);
    expect(result.approved).toBe(1);
    expect(result.ruleCounts).toEqual({ DEFAULT: 1 });
  });
});

describe("runAutoApproval — a rejected entry never re-enters the engine", () => {
  it("ignores a REJECTED entry entirely (only SUBMITTED is eligible)", async () => {
    // Even a standard 8h weekday entry with the delay elapsed must stay out of
    // the engine once a human rejected it.
    h.store.entries = [entry({ id: "rejected", status: "REJECTED" })];
    h.store.approvals = [
      {
        entityType: "TIME_ENTRY",
        entityId: "rejected",
        status: "REJECTED",
        isAutomatic: false,
        ruleKey: null,
      },
    ];

    const collection = await collectAutoApprovalDecisions(NOW);
    expect(collection.evaluations).toHaveLength(0); // never even loaded

    const result = await runAutoApproval(NOW);
    expect(result.processed).toBe(0);
    expect(result.approved).toBe(0);
    expect(h.store.entries.find((e) => e.id === "rejected")?.status).toBe(
      "REJECTED",
    );
  });

  it("keeps a rejected-then-resubmitted entry PENDING (manual REJECTED history blocks it)", async () => {
    // Consultant fixed and resubmitted a rejected entry: status is SUBMITTED
    // again, but the prior MANUAL REJECTED Approval keeps it off auto-approval.
    h.store.entries = [entry({ id: "resubmitted" })];
    h.store.approvals = [
      {
        entityType: "TIME_ENTRY",
        entityId: "resubmitted",
        status: "REJECTED",
        isAutomatic: false,
        ruleKey: null,
      },
    ];

    const collection = await collectAutoApprovalDecisions(NOW);
    const decision = collection.evaluations.find((e) => e.id === "resubmitted")
      ?.decision;
    expect(decision?.outcome).toBe("PENDING");
    expect(decision?.reasons).toContain("MANUAL_DECISION_HISTORY");

    const result = await runAutoApproval(NOW);
    expect(result.approved).toBe(0);
    expect(result.pending).toBe(1);
    expect(h.store.entries.find((e) => e.id === "resubmitted")?.status).toBe(
      "SUBMITTED",
    );
  });
});
