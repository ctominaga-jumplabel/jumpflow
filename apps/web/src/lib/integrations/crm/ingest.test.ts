import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { CrmProjectPayload } from "./contract";

/**
 * Ingestion handler (the "coracao" of FASE 1). The `@jumpflow/database` module
 * is mocked following the repo pattern (see db/payments.test.ts,
 * db/audit.test.ts):
 *
 * - a single set of delegate mocks is shared by `prisma` and by the `tx` handed
 *   to `$transaction` (the handler only needs the delegate methods on `tx`);
 * - `Prisma.PrismaClientKnownRequestError` is a real class so the handler's
 *   `instanceof` + `.code === "P2002"` idempotency branch works;
 * - `Prisma.Decimal` is a tiny stand-in and `Prisma.JsonNull` the sentinel used
 *   by `buildAuditEventData`.
 *
 * "No side effects" is asserted by checking the write mocks were NOT called.
 */
const h = vi.hoisted(() => {
  class PrismaClientKnownRequestError extends Error {
    code: string;
    constructor(message: string, opts: { code: string }) {
      super(message);
      this.code = opts.code;
    }
  }
  class Decimal {
    private readonly v: string;
    constructor(value: unknown) {
      this.v = String(value);
    }
    toString() {
      return this.v;
    }
  }

  const integrationEvent = {
    create: vi.fn(),
    findUnique: vi.fn(),
    updateMany: vi.fn(),
    update: vi.fn(),
    findMany: vi.fn(),
  };
  const project = {
    findFirst: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
    deleteMany: vi.fn(),
  };
  const client = { findFirst: vi.fn(), create: vi.fn() };
  const user = { findUnique: vi.fn() };
  const billingType = { findUnique: vi.fn() };
  const timeEntry = { count: vi.fn() };
  const projectSaleRate = { deleteMany: vi.fn(), create: vi.fn() };
  const projectPlannedProfile = { deleteMany: vi.fn(), create: vi.fn() };
  const auditEvent = { create: vi.fn() };

  const delegates = {
    integrationEvent,
    project,
    client,
    user,
    billingType,
    timeEntry,
    projectSaleRate,
    projectPlannedProfile,
    auditEvent,
  };

  const $transaction = vi.fn(async (cb: (tx: unknown) => unknown) =>
    cb(delegates),
  );

  const prisma = { ...delegates, $transaction };

  return { prisma, delegates, $transaction, PrismaClientKnownRequestError, Decimal };
});

vi.mock("@jumpflow/database", () => ({
  prisma: h.prisma,
  Prisma: {
    JsonNull: "__JsonNull__",
    PrismaClientKnownRequestError: h.PrismaClientKnownRequestError,
    Decimal: h.Decimal,
  },
}));

import { ingestCrmProject } from "./ingest";

const d = h.delegates;

function p2002(): Error {
  return new h.PrismaClientKnownRequestError("unique failed", {
    code: "P2002",
  });
}

function basePayload(
  overrides: Partial<CrmProjectPayload> = {},
): CrmProjectPayload {
  return {
    schemaVersion: "1.0",
    eventType: "project.won",
    idempotencyKey: "crm-proposal-PROP-2026-0142-r1",
    occurredAt: "2026-07-14T13:00:00Z",
    revision: 1,
    correlation: {
      crmProposalReferenceId: "PROP-2026-0142",
      crmProposalId: 142,
      commercialContractRef: "PROP-2026-0142",
    },
    project: {
      title: "Plataforma de Cobrança — Fase 1",
      opportunityType: "PROJECT",
      timesheetMode: "TIMESHEET",
      contractStart: "2026-08-01T00:00:00Z",
      contractEnd: "2026-12-31T00:00:00Z",
      budgetHoursTotal: 1200,
      totalContractValue: 480000,
      currency: "BRL",
      billing: { crmBillingModel: "FIXED" },
    },
    client: {
      crmClientId: 88,
      document: "12345678000199",
      name: "Acme S.A.",
    },
    accountExecutive: {
      crmUserId: 12,
      email: "exec@jumplabel.com.br",
      name: "Fulano de Tal",
    },
    plannedProfiles: [
      {
        crmLineId: 5011,
        jobRoleName: "Desenvolvedor",
        seniority: "SENIOR",
        quantity: 2,
        budgetHours: 640,
        saleUnitValue: 150,
        saleLineValue: 96000,
      },
    ],
    ...overrides,
  } as CrmProjectPayload;
}

function expectNoDomainWrites() {
  expect(d.project.create).not.toHaveBeenCalled();
  expect(d.project.update).not.toHaveBeenCalled();
  expect(d.client.create).not.toHaveBeenCalled();
  expect(d.projectSaleRate.create).not.toHaveBeenCalled();
  expect(d.projectPlannedProfile.create).not.toHaveBeenCalled();
}

beforeEach(() => {
  vi.clearAllMocks();

  // Happy-path defaults (a brand-new project).
  d.integrationEvent.create.mockResolvedValue({ id: "evt-1" });
  d.integrationEvent.update.mockResolvedValue({});
  d.integrationEvent.updateMany.mockResolvedValue({ count: 1 });
  d.integrationEvent.findUnique.mockResolvedValue(null);
  d.integrationEvent.findMany.mockResolvedValue([]);

  d.project.findFirst.mockResolvedValue(null);
  d.project.create.mockResolvedValue({ id: "proj-new" });
  d.project.update.mockImplementation(async (args: { where: { id: string } }) => ({
    id: args.where.id,
  }));

  d.client.findFirst.mockResolvedValue({ id: "client-1" });
  d.client.create.mockResolvedValue({ id: "client-new" });

  d.user.findUnique.mockResolvedValue({ id: "user-exec" });
  d.billingType.findUnique.mockResolvedValue({ id: "bt-1" });
  d.timeEntry.count.mockResolvedValue(0);

  d.projectSaleRate.deleteMany.mockResolvedValue({ count: 0 });
  d.projectSaleRate.create.mockResolvedValue({});
  d.projectPlannedProfile.deleteMany.mockResolvedValue({ count: 0 });
  d.projectPlannedProfile.create.mockResolvedValue({});
  d.auditEvent.create.mockResolvedValue({});
});

afterEach(() => {
  vi.clearAllMocks();
});

// 1) Idempotencia pos-SUCCESS -----------------------------------------------
describe("idempotency (replay of an already-SUCCESS event)", () => {
  it("returns DUPLICATE with the same targetId and NO side effects", async () => {
    d.integrationEvent.create.mockRejectedValue(p2002());
    d.integrationEvent.findUnique.mockResolvedValue({
      id: "evt-1",
      status: "SUCCESS",
      entityId: "proj-1",
      responseMeta: { result: "CREATED", targetId: "proj-1" },
    });

    const outcome = await ingestCrmProject(basePayload());

    expect(outcome.result).toBe("DUPLICATE");
    expect(outcome.targetId).toBe("proj-1");
    // No reprocessing at all.
    expect(h.$transaction).not.toHaveBeenCalled();
    expect(d.integrationEvent.updateMany).not.toHaveBeenCalled();
    expectNoDomainWrites();
  });

  it("falls back to responseMeta.targetId when entityId is null", async () => {
    d.integrationEvent.create.mockRejectedValue(p2002());
    d.integrationEvent.findUnique.mockResolvedValue({
      id: "evt-1",
      status: "SUCCESS",
      entityId: null,
      responseMeta: { result: "CREATED", targetId: "proj-meta" },
    });

    const outcome = await ingestCrmProject(basePayload());

    expect(outcome.result).toBe("DUPLICATE");
    expect(outcome.targetId).toBe("proj-meta");
  });
});

// 2) Retry pos-FAILED --------------------------------------------------------
describe("retry after a FAILED event", () => {
  it("reclaims the event and reprocesses to SUCCESS (not DUPLICATE)", async () => {
    d.integrationEvent.create.mockRejectedValue(p2002());
    d.integrationEvent.findUnique.mockResolvedValue({
      id: "evt-failed",
      status: "FAILED",
      entityId: null,
      responseMeta: null,
    });
    d.integrationEvent.updateMany.mockResolvedValue({ count: 1 });

    const outcome = await ingestCrmProject(basePayload());

    expect(outcome.result).not.toBe("DUPLICATE");
    expect(outcome.result).toBe("CREATED");
    // Event was reclaimed back to PENDING...
    expect(d.integrationEvent.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          id: "evt-failed",
          status: { in: ["FAILED", "PENDING", "RETRYING"] },
        },
        data: expect.objectContaining({ status: "PENDING", error: null }),
      }),
    );
    // ...reprocessed inside the transaction...
    expect(h.$transaction).toHaveBeenCalledTimes(1);
    expect(d.project.create).toHaveBeenCalledTimes(1);
    // ...and flipped to SUCCESS on the same event id.
    const successUpdate = d.integrationEvent.update.mock.calls.find(
      (c) => (c[0] as { data: { status?: string } }).data.status === "SUCCESS",
    );
    expect(successUpdate).toBeTruthy();
    expect((successUpdate![0] as { where: { id: string } }).where.id).toBe(
      "evt-failed",
    );
  });
});

// 3) Upsert por revision -----------------------------------------------------
describe("revision guard on an existing project with history", () => {
  const existing = {
    id: "proj-x",
    status: "ACTIVE",
    billingTypeId: "bt-old",
  };

  beforeEach(() => {
    d.project.findFirst.mockResolvedValue(existing);
    d.integrationEvent.findMany.mockResolvedValue([
      { requestMeta: { revision: 3 } },
    ]);
  });

  it("IGNORES a stale revision (<= max applied) without touching the project", async () => {
    const outcome = await ingestCrmProject(basePayload({ revision: 3 }));

    expect(outcome.result).toBe("IGNORED");
    expect(outcome.targetId).toBe("proj-x");
    expect(outcome.warnings.some((w) => w.startsWith("STALE_REVISION"))).toBe(
      true,
    );
    expect(d.project.update).not.toHaveBeenCalled();
    expect(d.project.create).not.toHaveBeenCalled();
    expect(d.projectPlannedProfile.create).not.toHaveBeenCalled();
  });

  it("applies a newer revision (> max applied) as UPDATED", async () => {
    const outcome = await ingestCrmProject(basePayload({ revision: 4 }));

    expect(outcome.result).toBe("UPDATED");
    expect(outcome.targetId).toBe("proj-x");
    expect(d.project.update).toHaveBeenCalledTimes(1);
    expect(
      outcome.warnings.some((w) => w.startsWith("STALE_REVISION")),
    ).toBe(false);
  });
});

// 4) LINKED_EXISTING ---------------------------------------------------------
describe("LINKED_EXISTING (manual project with no prior CRM event)", () => {
  it("links/updates the same project id without recreating or changing status", async () => {
    d.project.findFirst.mockResolvedValue({
      id: "proj-manual",
      status: "PAUSED",
      billingTypeId: null,
    });
    d.integrationEvent.findMany.mockResolvedValue([]); // no prior CRM events

    const outcome = await ingestCrmProject(basePayload());

    expect(outcome.result).toBe("LINKED_EXISTING");
    expect(outcome.targetId).toBe("proj-manual");
    expect(d.project.create).not.toHaveBeenCalled();
    expect(d.project.update).toHaveBeenCalledTimes(1);

    const updateArgs = d.project.update.mock.calls[0]![0] as {
      where: { id: string };
      data: Record<string, unknown>;
    };
    expect(updateArgs.where.id).toBe("proj-manual");
    // Never overwrites the running status.
    expect(updateArgs.data).not.toHaveProperty("status");
  });
});

// 5) opportunityType / timesheetMode ----------------------------------------
describe("timesheetMode controls planned-profile materialization", () => {
  it("NO_TIMESHEET: creates the Project but skips profiles + emits warning", async () => {
    const outcome = await ingestCrmProject(
      basePayload({
        project: {
          ...basePayload().project,
          opportunityType: "SUPPORT",
          timesheetMode: "NO_TIMESHEET",
        },
      }),
    );

    // Type never blocks / IGNOREs.
    expect(outcome.result).toBe("CREATED");
    expect(d.project.create).toHaveBeenCalledTimes(1);
    expect(d.projectPlannedProfile.create).not.toHaveBeenCalled();
    // N3: profiles are still reconciled (deleteMany) so a project that used to be
    // TIMESHEET does not leave orphan profiles behind — it just does not recreate.
    expect(d.projectPlannedProfile.deleteMany).toHaveBeenCalledTimes(1);
    expect(outcome.warnings).toContain("NO_TIMESHEET_PROFILES_SKIPPED");
  });

  it("TIMESHEET: materializes one ProjectPlannedProfile per line", async () => {
    const outcome = await ingestCrmProject(
      basePayload({
        project: {
          ...basePayload().project,
          opportunityType: "PROJECT",
          timesheetMode: "TIMESHEET",
        },
        plannedProfiles: [
          {
            crmLineId: 1,
            jobRoleName: "Dev",
            seniority: "SENIOR",
            quantity: 1,
            budgetHours: 100,
            saleUnitValue: 150,
            saleLineValue: 15000,
          },
          {
            crmLineId: 2,
            jobRoleName: "Lead",
            seniority: "SPECIALIST",
            quantity: 1,
            budgetHours: 80,
            saleUnitValue: 220,
            saleLineValue: 17600,
          },
        ],
      }),
    );

    expect(outcome.result).toBe("CREATED");
    expect(d.projectPlannedProfile.deleteMany).toHaveBeenCalledTimes(1);
    expect(d.projectPlannedProfile.create).toHaveBeenCalledTimes(2);
    expect(outcome.warnings).not.toContain("NO_TIMESHEET_PROFILES_SKIPPED");
  });

  it("does not IGNORE just because of an unusual opportunityType (LICENSING)", async () => {
    const outcome = await ingestCrmProject(
      basePayload({
        project: {
          ...basePayload().project,
          opportunityType: "LICENSING",
          timesheetMode: "NO_TIMESHEET",
        },
      }),
    );

    expect(outcome.result).toBe("CREATED");
    expect(outcome.targetId).toBe("proj-new");
  });
});

// 6) Reversao (project.cancelled) -------------------------------------------
describe("reversal (project.cancelled)", () => {
  it("marks an existing project CANCELLED, never deletes, and audits PROJECT_CANCELLED_BY_CRM", async () => {
    d.project.findFirst.mockResolvedValue({
      id: "proj-cancel",
      status: "ACTIVE",
      billingTypeId: "bt-1",
    });
    d.integrationEvent.findMany.mockResolvedValue([]);

    const outcome = await ingestCrmProject(
      basePayload({ eventType: "project.cancelled" }),
    );

    expect(outcome.targetId).toBe("proj-cancel");
    // Status flipped to CANCELLED via update, never delete.
    expect(d.project.update).toHaveBeenCalledTimes(1);
    const updateArgs = d.project.update.mock.calls[0]![0] as {
      data: { status?: string };
    };
    expect(updateArgs.data.status).toBe("CANCELLED");
    expect(d.project.delete).not.toHaveBeenCalled();
    expect(d.project.deleteMany).not.toHaveBeenCalled();
    expect(d.project.create).not.toHaveBeenCalled();

    const auditData = d.auditEvent.create.mock.calls[0]![0] as {
      data: { action: string };
    };
    expect(auditData.data.action).toBe("PROJECT_CANCELLED_BY_CRM");
  });

  it("IGNOREs a cancellation for a project that does not exist", async () => {
    d.project.findFirst.mockResolvedValue(null);

    const outcome = await ingestCrmProject(
      basePayload({ eventType: "project.cancelled" }),
    );

    expect(outcome.result).toBe("IGNORED");
    expect(outcome.targetId).toBeNull();
    expect(outcome.warnings).toContain("PROJECT_NOT_FOUND_FOR_CANCELLATION");
    expect(d.project.update).not.toHaveBeenCalled();
    expect(d.project.create).not.toHaveBeenCalled();
    expect(d.auditEvent.create).not.toHaveBeenCalled();
  });

  it("IGNOREs a stale/out-of-order cancellation (revision <= max applied) without re-cancelling", async () => {
    // Project already advanced to revision 5 (e.g. reactivated + updated by hand
    // after a prior CRM cycle). A late project.cancelled carrying revision 3
    // must NOT re-cancel it.
    d.project.findFirst.mockResolvedValue({
      id: "proj-reactivated",
      status: "ACTIVE",
      billingTypeId: "bt-1",
    });
    d.integrationEvent.findMany.mockResolvedValue([
      { requestMeta: { revision: 5 } },
    ]);

    const outcome = await ingestCrmProject(
      basePayload({ eventType: "project.cancelled", revision: 3 }),
    );

    expect(outcome.result).toBe("IGNORED");
    expect(outcome.targetId).toBe("proj-reactivated");
    expect(outcome.warnings.some((w) => w.startsWith("STALE_REVISION"))).toBe(
      true,
    );
    // Status untouched, no audit of a cancellation that did not happen.
    expect(d.project.update).not.toHaveBeenCalled();
    expect(d.auditEvent.create).not.toHaveBeenCalled();
  });
});
