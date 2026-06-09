import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const PERIOD_START = new Date("2026-06-01T00:00:00Z");
const PERIOD_END = new Date("2026-06-08T00:00:00Z");
const NOW = new Date("2026-06-09T09:00:00Z");

type EmailLog = {
  status: string;
  recipient: string;
  meta?: Record<string, unknown>;
} | null;

type AllocationRow = {
  projectId: string;
  project: { name: string };
  consultantId: string;
  consultant: {
    name: string;
    email: string;
    area: string | null;
    seniority: string;
  };
};

type EntryRow = { consultantId: string; projectId: string; status: string };

/** One allocated consultant on a project, with no time entry by default. */
function alloc(
  consultantId: string,
  projectId: string,
  over: Partial<AllocationRow["consultant"]> = {},
): AllocationRow {
  return {
    projectId,
    project: { name: projectId },
    consultantId,
    consultant: {
      name: consultantId,
      email: `${consultantId}@x.com`,
      area: "Data",
      seniority: "SENIOR",
      ...over,
    },
  };
}

const h = vi.hoisted(() => {
  const store: {
    emailLog: EmailLog;
    allocations: AllocationRow[];
    entries: EntryRow[];
    reportRecipientEmail: string | null;
    failSend: boolean;
    forceClaimConflict: boolean;
    sent: EmailMessageCapture[];
  } = {
    emailLog: null,
    allocations: [],
    entries: [],
    reportRecipientEmail: "admin@jumplabel.com.br",
    failSend: false,
    forceClaimConflict: false,
    sent: [],
  };

  type EmailMessageCapture = {
    to: string[];
    subject: string;
    attachments?: Array<{ filename: string; content: string }>;
  };

  const prismaMock = {
    automationConfig: {
      upsert: async () => ({
        autoApprovalEnabled: true,
        requiredDailyMinutes: 480,
        approvalDelayMinutes: 5,
        reportRecipientEmail: store.reportRecipientEmail,
      }),
    },
    automationEmailLog: {
      findUnique: async () => store.emailLog,
      create: async ({
        data,
      }: {
        data: {
          status: string;
          recipient: string;
          meta?: Record<string, unknown>;
        };
      }) => {
        if (store.forceClaimConflict || store.emailLog) {
          throw Object.assign(new Error("unique"), { code: "P2002" });
        }
        store.emailLog = {
          status: data.status,
          recipient: data.recipient,
          meta: data.meta,
        };
        return store.emailLog;
      },
      update: async ({
        data,
      }: {
        data: {
          status: string;
          recipient: string;
          meta?: Record<string, unknown>;
        };
      }) => {
        store.emailLog = {
          status: data.status,
          recipient: data.recipient,
          meta: data.meta,
        };
        return store.emailLog;
      },
    },
    allocation: { findMany: async () => store.allocations },
    timeEntry: { findMany: async () => store.entries },
  };
  return { store, prismaMock };
});

vi.mock("@jumpflow/database", () => ({
  prisma: h.prismaMock,
  Prisma: { JsonNull: "__JsonNull__" },
}));

vi.mock("@/lib/automation/email-transport", () => ({
  getEmailTransport: () => ({
    send: async (message: {
      to: string[];
      subject: string;
      attachments?: Array<{ filename: string; content: string }>;
    }) => {
      h.store.sent.push(message);
      if (h.store.failSend) throw new Error("smtp down");
      return { id: "msg-1", provider: "test" };
    },
  }),
}));

import {
  previousWeekRange,
  runMissingTimesheetReport,
} from "@/lib/automation/missing-timesheets";

function run() {
  return runMissingTimesheetReport({
    periodStart: PERIOD_START,
    periodEnd: PERIOD_END,
    now: NOW,
  });
}

beforeEach(() => {
  vi.stubEnv("DATABASE_URL", "postgresql://u:p@localhost:5432/db");
  vi.stubEnv("AUTOMATION_REPORT_EMAIL", "");
  h.store.emailLog = null;
  h.store.reportRecipientEmail = "admin@jumplabel.com.br";
  // Default: one consultant allocated to project A with no entries -> 1 row.
  h.store.allocations = [alloc("c1", "A")];
  h.store.entries = [];
  h.store.failSend = false;
  h.store.forceClaimConflict = false;
  h.store.sent = [];
});

afterEach(() => vi.unstubAllEnvs());

describe("previousWeekRange", () => {
  it("returns the previous full Mon–Mon week for a midweek date", () => {
    const r = previousWeekRange(new Date("2026-06-10T12:00:00Z")); // Wednesday
    expect(r.start.toISOString().slice(0, 10)).toBe("2026-06-01");
    expect(r.end.toISOString().slice(0, 10)).toBe("2026-06-08");
  });

  it("returns the prior week when today is Monday", () => {
    const r = previousWeekRange(new Date("2026-06-08T00:00:00Z")); // Monday
    expect(r.start.toISOString().slice(0, 10)).toBe("2026-06-01");
    expect(r.end.toISOString().slice(0, 10)).toBe("2026-06-08");
  });

  it("handles Sunday correctly", () => {
    const r = previousWeekRange(new Date("2026-06-07T10:00:00Z")); // Sunday
    expect(r.start.toISOString().slice(0, 10)).toBe("2026-05-25");
    expect(r.end.toISOString().slice(0, 10)).toBe("2026-06-01");
  });
});

describe("runMissingTimesheetReport — idempotency & edge cases", () => {
  it("sends once, then skips a re-run for the same period (already-sent)", async () => {
    const first = await run();
    expect(first.skipped).toBe(false);
    expect(first.emailed).toBe(true);
    expect(first.rowCount).toBe(1);
    expect(first.status).toBe("SENT");
    expect(h.store.emailLog?.status).toBe("SENT");
    expect(h.store.sent).toHaveLength(1);

    const second = await run();
    expect(second.skipped).toBe(true);
    expect(second.reason).toBe("already-sent");
    // No additional email on the re-run.
    expect(h.store.sent).toHaveLength(1);
  });

  it("marks the period processed without emailing when there are no non-compliant rows (no allocations)", async () => {
    h.store.allocations = [];
    const result = await run();
    expect(result.skipped).toBe(false);
    expect(result.emailed).toBe(false);
    expect(result.rowCount).toBe(0);
    expect(result.status).toBe("SENT");
    expect(h.store.emailLog?.status).toBe("SENT");
    expect(h.store.sent).toHaveLength(0);
  });

  it("marks processed without emailing when every allocation is compliant", async () => {
    h.store.entries = [{ consultantId: "c1", projectId: "A", status: "SUBMITTED" }];
    const result = await run();
    expect(result.skipped).toBe(false);
    expect(result.emailed).toBe(false);
    expect(result.rowCount).toBe(0);
    expect(result.status).toBe("SENT");
    expect(h.store.sent).toHaveLength(0);
  });

  it("records FAILED on send error and retries successfully on the next run", async () => {
    h.store.failSend = true;
    const first = await run();
    expect(first.status).toBe("FAILED");
    expect(first.emailed).toBe(false);
    expect(h.store.emailLog?.status).toBe("FAILED");

    h.store.failSend = false;
    const second = await run(); // existing FAILED is retried (not skipped)
    expect(second.skipped).toBe(false);
    expect(second.emailed).toBe(true);
    expect(second.status).toBe("SENT");
    expect(h.store.emailLog?.status).toBe("SENT");
    expect(h.store.sent).toHaveLength(2);
  });

  it("skips when there is no configured recipient (DB null + env empty), reserving nothing", async () => {
    h.store.reportRecipientEmail = null;
    const result = await run();
    expect(result.skipped).toBe(true);
    expect(result.reason).toBe("no-recipient");
    expect(result.recipients).toEqual([]);
    expect(h.store.emailLog).toBeNull(); // nothing reserved/sent
    expect(h.store.sent).toHaveLength(0);
  });

  it("backs off when another run already claimed the period (concurrency)", async () => {
    h.store.forceClaimConflict = true; // findUnique saw null, create collides
    const result = await run();
    expect(result.skipped).toBe(true);
    expect(result.reason).toBe("already-claimed");
    expect(h.store.sent).toHaveLength(0);
  });

  it("supports multiple recipients: result list, joined log recipient and array passed to transport", async () => {
    h.store.reportRecipientEmail = "a@x.com, b@x.com";
    const result = await run();
    expect(result.skipped).toBe(false);
    expect(result.recipients).toEqual(["a@x.com", "b@x.com"]);
    expect(h.store.emailLog?.recipient).toBe("a@x.com,b@x.com");
    expect(h.store.sent).toHaveLength(1);
    expect(h.store.sent[0].to).toEqual(["a@x.com", "b@x.com"]);
    // Attachment carries the CSV report.
    expect(h.store.sent[0].attachments?.[0].filename).toMatch(/\.csv$/);
  });
});
