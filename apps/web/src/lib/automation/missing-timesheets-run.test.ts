import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const PERIOD_START = new Date("2026-06-01T00:00:00Z");
const PERIOD_END = new Date("2026-06-08T00:00:00Z");
const NOW = new Date("2026-06-09T09:00:00Z");

type EmailLog = {
  status: string;
  recipient: string;
  meta?: Record<string, unknown>;
} | null;

const h = vi.hoisted(() => {
  const store: {
    emailLog: EmailLog;
    consultants: Array<Record<string, unknown>>;
    recipient: string | null;
    failSend: boolean;
    forceClaimConflict: boolean;
  } = {
    emailLog: null,
    consultants: [],
    recipient: "admin@jumplabel.com.br",
    failSend: false,
    forceClaimConflict: false,
  };

  const prismaMock = {
    automationConfig: {
      upsert: async () => ({
        autoApprovalEnabled: true,
        requiredDailyMinutes: 480,
        approvalDelayMinutes: 5,
        reportRecipientEmail: store.recipient,
      }),
    },
    automationEmailLog: {
      findUnique: async () => store.emailLog,
      create: async ({
        data,
      }: {
        data: { status: string; recipient: string; meta?: Record<string, unknown> };
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
        data: { status: string; recipient: string; meta?: Record<string, unknown> };
      }) => {
        store.emailLog = {
          status: data.status,
          recipient: data.recipient,
          meta: data.meta,
        };
        return store.emailLog;
      },
    },
    consultant: { findMany: async () => store.consultants },
  };
  return { store, prismaMock };
});

vi.mock("@jumpflow/database", () => ({
  prisma: h.prismaMock,
  Prisma: { JsonNull: "__JsonNull__" },
}));

vi.mock("@/lib/automation/email-transport", () => ({
  getEmailTransport: () => ({
    send: async () => {
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
  h.store.recipient = "admin@jumplabel.com.br";
  h.store.consultants = [
    { id: "c1", name: "Bob", email: "bob@x.com", area: "Data", seniority: "SENIOR" },
  ];
  h.store.failSend = false;
  h.store.forceClaimConflict = false;
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
  it("sends once, then skips a re-run for the same period", async () => {
    const first = await run();
    expect(first.skipped).toBe(false);
    expect(first.emailed).toBe(true);
    expect(first.rowCount).toBe(1);
    expect(h.store.emailLog?.status).toBe("SENT");

    const second = await run();
    expect(second.skipped).toBe(true);
    expect(second.reason).toBe("already-sent");
  });

  it("marks the period processed without emailing when no one is missing", async () => {
    h.store.consultants = [];
    const result = await run();
    expect(result.skipped).toBe(false);
    expect(result.emailed).toBe(false);
    expect(result.rowCount).toBe(0);
    expect(h.store.emailLog?.status).toBe("SENT");
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
    expect(h.store.emailLog?.status).toBe("SENT");
  });

  it("skips when there is no configured recipient", async () => {
    h.store.recipient = null;
    const result = await run();
    expect(result.skipped).toBe(true);
    expect(result.reason).toBe("no-recipient");
    expect(h.store.emailLog).toBeNull(); // nothing reserved/sent
  });

  it("backs off when another run already claimed the period (concurrency)", async () => {
    h.store.forceClaimConflict = true; // findUnique saw null, create collides
    const result = await run();
    expect(result.skipped).toBe(true);
    expect(result.reason).toBe("already-claimed");
  });
});
