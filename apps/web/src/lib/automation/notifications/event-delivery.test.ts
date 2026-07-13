import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/db/config", () => ({ isDatabaseConfigured: () => true }));

const findFirst = vi.fn();
vi.mock("@jumpflow/database", () => ({
  prisma: {
    notificationRule: { findFirst: (...a: unknown[]) => findFirst(...a) },
    user: { findMany: vi.fn().mockResolvedValue([]) },
  },
}));

import { resolveEventDelivery } from "./event-delivery";

beforeEach(() => findFirst.mockReset());

describe("resolveEventDelivery", () => {
  it("no rule → falls back to the natural target(s)", async () => {
    findFirst.mockResolvedValue(null);
    const d = await resolveEventDelivery("ACCESS_INVITE", {
      targets: [{ email: "a@x.com" }, { email: "a@x.com" }, { email: "b@x.com" }],
    });
    expect(d.skip).toBe(false);
    expect(d.emails).toEqual(["a@x.com", "b@x.com"]); // deduped
  });

  it("inactive rule → skip (admin turned it off)", async () => {
    findFirst.mockResolvedValue({ active: false, recipients: [] });
    const d = await resolveEventDelivery("NFSE_ISSUED", {
      targets: [{ email: "client@x.com" }],
    });
    expect(d.skip).toBe(true);
    expect(d.emails).toEqual([]);
  });

  it("active EVENT_TARGET rule → resolves to the provided targets", async () => {
    findFirst.mockResolvedValue({
      active: true,
      recipients: [
        { type: "EVENT_TARGET", channel: "EMAIL", address: null, name: null },
      ],
    });
    const d = await resolveEventDelivery("PAYMENT_FORECAST", {
      targets: [{ email: "consultant@x.com", name: "Ana" }],
    });
    expect(d.skip).toBe(false);
    expect(d.emails).toEqual(["consultant@x.com"]);
  });

  it("active STATIC rule → uses the fixed address, not the target", async () => {
    findFirst.mockResolvedValue({
      active: true,
      recipients: [
        { type: "STATIC", channel: "EMAIL", address: "ops@x.com", name: null },
      ],
    });
    const d = await resolveEventDelivery("MISSING_TIMESHEET_REPORT", {
      targets: [{ email: "fallback@x.com" }],
    });
    expect(d.emails).toEqual(["ops@x.com"]);
  });
});
