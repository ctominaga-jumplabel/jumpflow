import { afterEach, describe, expect, it, vi } from "vitest";

const upsert = vi.fn();
const findUnique = vi.fn();

// Mock the database package so no real Prisma client / connection is needed.
vi.mock("@jumpflow/database", () => ({
  prisma: {
    user: {
      upsert: (...args: unknown[]) => upsert(...args),
      findUnique: (...args: unknown[]) => findUnique(...args),
    },
  },
}));

import {
  loadUserRoles,
  mapPersistedRoles,
  syncUserFromAuth,
} from "@/lib/db/users";

afterEach(() => {
  vi.clearAllMocks();
});

describe("mapPersistedRoles", () => {
  it("keeps known roles, drops unknown values and dedupes", () => {
    expect(
      mapPersistedRoles([
        { role: { name: "ADMIN" } },
        { role: { name: "NOT_A_ROLE" } },
        { role: { name: "ADMIN" } },
        { role: { name: "FINANCE" } },
      ]),
    ).toEqual(["ADMIN", "FINANCE"]);
  });

  it("returns [] for no rows", () => {
    expect(mapPersistedRoles([])).toEqual([]);
  });
});

describe("syncUserFromAuth", () => {
  it("upserts by normalized email and maps persisted roles", async () => {
    upsert.mockResolvedValue({
      id: "u1",
      name: "Real User",
      email: "user@x.com",
      roles: [{ role: { name: "FINANCE" } }, { role: { name: "BAD" } }],
    });

    const result = await syncUserFromAuth({
      email: "  User@X.com  ",
      name: " Real User ",
    });

    expect(result).toEqual({
      id: "u1",
      name: "Real User",
      email: "user@x.com",
      roles: ["FINANCE"],
    });

    const arg = upsert.mock.calls[0][0] as {
      where: { email: string };
      create: { email: string; name: string };
    };
    expect(arg.where).toEqual({ email: "user@x.com" });
    expect(arg.create).toEqual({ email: "user@x.com", name: "Real User" });
  });

  it("falls back to email as name when name is empty", async () => {
    upsert.mockResolvedValue({
      id: "u2",
      name: "user@x.com",
      email: "user@x.com",
      roles: [],
    });

    await syncUserFromAuth({ email: "user@x.com", name: "  " });

    const arg = upsert.mock.calls[0][0] as { create: { name: string } };
    expect(arg.create.name).toBe("user@x.com");
  });
});

describe("loadUserRoles", () => {
  it("returns [] for an unknown user", async () => {
    findUnique.mockResolvedValue(null);
    expect(await loadUserRoles("ghost@x.com")).toEqual([]);
  });

  it("maps persisted roles for a known user", async () => {
    findUnique.mockResolvedValue({ roles: [{ role: { name: "PEOPLE" } }] });
    expect(await loadUserRoles("known@x.com")).toEqual(["PEOPLE"]);
  });
});
