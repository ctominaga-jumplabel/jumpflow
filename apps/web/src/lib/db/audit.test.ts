import { afterEach, describe, expect, it, vi } from "vitest";

const create = vi.fn();

// Mock the database package; `Prisma.JsonNull` is the sentinel the builder uses
// for missing JSON values.
vi.mock("@jumpflow/database", () => ({
  prisma: { auditEvent: { create: (...args: unknown[]) => create(...args) } },
  Prisma: { JsonNull: "__JsonNull__" },
}));

import { buildAuditEventData, recordAuditEvent } from "@/lib/db/audit";

afterEach(() => {
  vi.clearAllMocks();
  vi.unstubAllEnvs();
});

describe("buildAuditEventData", () => {
  it("maps all fields when provided", () => {
    expect(
      buildAuditEventData({
        actorUserId: "u1",
        entityType: "Project",
        entityId: "p1",
        action: "HOURLY_RATE_UPDATED",
        before: { rate: 100 },
        after: { rate: 120 },
      }),
    ).toEqual({
      actorUserId: "u1",
      entityType: "Project",
      entityId: "p1",
      action: "HOURLY_RATE_UPDATED",
      before: { rate: 100 },
      after: { rate: 120 },
    });
  });

  it("uses JsonNull for missing before/after and null actor", () => {
    expect(
      buildAuditEventData({
        entityType: "UserRole",
        entityId: "u1:FINANCE",
        action: "ROLE_GRANTED",
      }),
    ).toEqual({
      actorUserId: null,
      entityType: "UserRole",
      entityId: "u1:FINANCE",
      action: "ROLE_GRANTED",
      before: "__JsonNull__",
      after: "__JsonNull__",
    });
  });
});

describe("recordAuditEvent", () => {
  it("is a no-op when no database is configured", async () => {
    vi.stubEnv("DATABASE_URL", "");
    await recordAuditEvent({ entityType: "P", entityId: "1", action: "X" });
    expect(create).not.toHaveBeenCalled();
  });

  it("writes an event when a database is configured", async () => {
    vi.stubEnv("DATABASE_URL", "postgresql://x");
    create.mockResolvedValue({});

    await recordAuditEvent({
      actorUserId: "u1",
      entityType: "Project",
      entityId: "p1",
      action: "BUDGET_UPDATED",
      after: { budget: 10 },
    });

    expect(create).toHaveBeenCalledTimes(1);
    const data = (create.mock.calls[0][0] as { data: { action: string } }).data;
    expect(data.action).toBe("BUDGET_UPDATED");
  });

  it("swallows write errors so auditing never breaks the operation", async () => {
    vi.stubEnv("DATABASE_URL", "postgresql://x");
    create.mockRejectedValue(new Error("db down"));
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});

    await expect(
      recordAuditEvent({ entityType: "P", entityId: "1", action: "X" }),
    ).resolves.toBeUndefined();
    expect(spy).toHaveBeenCalled();

    spy.mockRestore();
  });
});
