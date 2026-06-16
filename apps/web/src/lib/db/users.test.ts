import { afterEach, describe, expect, it, vi } from "vitest";

const upsert = vi.fn();
const findUnique = vi.fn();
const consultantFindUnique = vi.fn();
const consultantUpdate = vi.fn();
const consultantCreate = vi.fn();

// Mock the database package so no real Prisma client / connection is needed.
vi.mock("@jumpflow/database", () => ({
  prisma: {
    user: {
      upsert: (...args: unknown[]) => upsert(...args),
      findUnique: (...args: unknown[]) => findUnique(...args),
    },
    consultant: {
      findUnique: (...args: unknown[]) => consultantFindUnique(...args),
      update: (...args: unknown[]) => consultantUpdate(...args),
      create: (...args: unknown[]) => consultantCreate(...args),
    },
  },
}));

import {
  DEFAULT_CONSULTANT_SENIORITY,
  ensureConsultantForUser,
  loadUserRoles,
  mapPersistedRoles,
  syncUserFromAuth,
} from "@/lib/db/users";

// Cast to the Prisma client shape expected by ensureConsultantForUser; the
// mocked surface is all the function touches.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db: any = {
  consultant: {
    findUnique: (...args: unknown[]) => consultantFindUnique(...args),
    update: (...args: unknown[]) => consultantUpdate(...args),
    create: (...args: unknown[]) => consultantCreate(...args),
  },
};

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
      consultant: { id: "c1" },
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
      consultant: { id: "c2" },
    });

    await syncUserFromAuth({ email: "user@x.com", name: "  " });

    const arg = upsert.mock.calls[0][0] as { create: { name: string } };
    expect(arg.create.name).toBe("user@x.com");
  });

  it("creates a consultant for a brand-new user with no consultant", async () => {
    upsert.mockResolvedValue({
      id: "u3",
      name: "New User",
      email: "new@x.com",
      roles: [],
      consultant: null,
    });
    consultantFindUnique.mockResolvedValue(null);
    consultantCreate.mockResolvedValue({ id: "c3" });

    const result = await syncUserFromAuth({
      email: "new@x.com",
      name: "New User",
    });

    expect(result.id).toBe("u3");
    expect(consultantCreate).toHaveBeenCalledWith({
      data: {
        userId: "u3",
        name: "New User",
        email: "new@x.com",
        status: "ACTIVE",
        seniority: DEFAULT_CONSULTANT_SENIORITY,
      },
    });
    expect(consultantUpdate).not.toHaveBeenCalled();
  });

  it("does not break login when consultant provisioning fails", async () => {
    upsert.mockResolvedValue({
      id: "u4",
      name: "Flaky User",
      email: "flaky@x.com",
      roles: [{ role: { name: "ADMIN" } }],
      consultant: null,
    });
    consultantFindUnique.mockRejectedValue(new Error("db down"));
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    const result = await syncUserFromAuth({
      email: "flaky@x.com",
      name: "Flaky User",
    });

    expect(result).toEqual({
      id: "u4",
      name: "Flaky User",
      email: "flaky@x.com",
      roles: ["ADMIN"],
    });
    expect(errorSpy).toHaveBeenCalled();
    errorSpy.mockRestore();
  });
});

describe("ensureConsultantForUser", () => {
  const user = { userId: "u1", email: "user@x.com", name: "Real User" };

  it("is a no-op when the user already has a linked consultant", async () => {
    await ensureConsultantForUser(db, user, true);

    expect(consultantFindUnique).not.toHaveBeenCalled();
    expect(consultantUpdate).not.toHaveBeenCalled();
    expect(consultantCreate).not.toHaveBeenCalled();
  });

  it("creates an ACTIVE consultant with the default seniority when none exists", async () => {
    consultantFindUnique.mockResolvedValue(null);
    consultantCreate.mockResolvedValue({ id: "c1" });

    await ensureConsultantForUser(db, user, false);

    expect(consultantCreate).toHaveBeenCalledWith({
      data: {
        userId: "u1",
        name: "Real User",
        email: "user@x.com",
        status: "ACTIVE",
        seniority: DEFAULT_CONSULTANT_SENIORITY,
      },
    });
    expect(consultantUpdate).not.toHaveBeenCalled();
  });

  it("links an unlinked consultant for the same email instead of duplicating", async () => {
    consultantFindUnique.mockResolvedValue({ id: "c9", userId: null });
    consultantUpdate.mockResolvedValue({ id: "c9" });

    await ensureConsultantForUser(db, user, false);

    expect(consultantUpdate).toHaveBeenCalledWith({
      where: { id: "c9" },
      data: { userId: "u1" },
    });
    expect(consultantCreate).not.toHaveBeenCalled();
  });

  it("leaves a consultant linked to another user untouched", async () => {
    consultantFindUnique.mockResolvedValue({ id: "c9", userId: "other-user" });
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

    await ensureConsultantForUser(db, user, false);

    expect(consultantUpdate).not.toHaveBeenCalled();
    expect(consultantCreate).not.toHaveBeenCalled();
    expect(warnSpy).toHaveBeenCalled();
    warnSpy.mockRestore();
  });

  it("is a no-op when the consultant is already linked to this same user", async () => {
    consultantFindUnique.mockResolvedValue({ id: "c1", userId: "u1" });

    await ensureConsultantForUser(db, user, false);

    expect(consultantUpdate).not.toHaveBeenCalled();
    expect(consultantCreate).not.toHaveBeenCalled();
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
