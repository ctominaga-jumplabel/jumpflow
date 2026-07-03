import { afterEach, describe, expect, it, vi } from "vitest";

const findUnique = vi.fn();
const upsert = vi.fn();

vi.mock("@jumpflow/database", () => ({
  prisma: {
    termsAcceptance: {
      findUnique: (...args: unknown[]) => findUnique(...args),
      upsert: (...args: unknown[]) => upsert(...args),
    },
  },
}));

import { acceptCurrentTerms, hasAcceptedCurrentTerms } from "@/lib/db/terms";
import { CURRENT_TERMS_VERSION } from "@/lib/terms/terms";

afterEach(() => {
  vi.clearAllMocks();
});

describe("hasAcceptedCurrentTerms", () => {
  it("returns true when an acceptance row exists for the current version", async () => {
    findUnique.mockResolvedValue({ id: "ta1" });
    await expect(hasAcceptedCurrentTerms("u1")).resolves.toBe(true);
    expect(findUnique).toHaveBeenCalledWith({
      where: {
        userId_termsVersion: {
          userId: "u1",
          termsVersion: CURRENT_TERMS_VERSION,
        },
      },
      select: { id: true },
    });
  });

  it("returns false when there is no acceptance for the current version", async () => {
    findUnique.mockResolvedValue(null);
    await expect(hasAcceptedCurrentTerms("u1")).resolves.toBe(false);
  });

  it("fails OPEN (returns true) on a database error to avoid a global lockout", async () => {
    findUnique.mockRejectedValue(new Error("db down"));
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    await expect(hasAcceptedCurrentTerms("u1")).resolves.toBe(true);
    expect(spy).toHaveBeenCalled();
    spy.mockRestore();
  });
});

describe("acceptCurrentTerms", () => {
  it("upserts idempotently by userId + current version", async () => {
    upsert.mockResolvedValue({
      id: "ta1",
      acceptedAt: new Date("2026-07-03T00:00:00Z"),
      termsVersion: CURRENT_TERMS_VERSION,
    });

    const row = await acceptCurrentTerms("u1");

    expect(row.id).toBe("ta1");
    expect(upsert).toHaveBeenCalledWith({
      where: {
        userId_termsVersion: {
          userId: "u1",
          termsVersion: CURRENT_TERMS_VERSION,
        },
      },
      update: {},
      create: { userId: "u1", termsVersion: CURRENT_TERMS_VERSION },
      select: { id: true, acceptedAt: true, termsVersion: true },
    });
  });
});
