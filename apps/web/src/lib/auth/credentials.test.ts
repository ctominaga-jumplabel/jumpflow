import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const findUnique = vi.fn();
const update = vi.fn();
const verifyPasswordMock = vi.fn();
const isDatabaseConfiguredMock = vi.fn();

vi.mock("@jumpflow/database", () => ({
  prisma: {
    user: {
      findUnique: (...a: unknown[]) => findUnique(...a),
      update: (...a: unknown[]) => update(...a),
    },
  },
}));
vi.mock("./password", () => ({
  verifyPassword: (...a: unknown[]) => verifyPasswordMock(...a),
  // Used by the timing-equalization dummy hash on the failure path.
  hashPassword: async () => "scrypt$16384$8$1$dummysalt$dummyhash",
}));
vi.mock("@/lib/db/config", () => ({
  isDatabaseConfigured: () => isDatabaseConfiguredMock(),
}));

import { authorizeCredentials } from "./credentials";

const ACTIVE_USER = {
  id: "cuid-123",
  name: "Ana Martins",
  email: "ana.martins@jumplabel.com.br",
  passwordHash: "scrypt$16384$8$1$salt$hash",
  status: "ACTIVE" as const,
};

beforeEach(() => {
  isDatabaseConfiguredMock.mockReturnValue(true);
  verifyPasswordMock.mockResolvedValue(true);
  update.mockResolvedValue({});
});

afterEach(() => {
  vi.clearAllMocks();
});

describe("authorizeCredentials — success", () => {
  it("returns the db identity (no roles) and stamps lastLoginAt", async () => {
    findUnique.mockResolvedValue(ACTIVE_USER);

    const result = await authorizeCredentials({
      email: "  Ana.Martins@JumpLabel.com.br ",
      password: "uma-senha-bem-longa",
    });

    expect(result).toEqual({
      id: "cuid-123",
      email: "ana.martins@jumplabel.com.br",
      name: "Ana Martins",
    });
    // Email normalized before the lookup.
    expect(findUnique).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { email: "ana.martins@jumplabel.com.br" },
      }),
    );
    expect(update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "cuid-123" },
        data: expect.objectContaining({ lastLoginAt: expect.any(Date) }),
      }),
    );
  });

  it("succeeds even if the lastLoginAt write fails (best-effort)", async () => {
    findUnique.mockResolvedValue(ACTIVE_USER);
    update.mockRejectedValue(new Error("write failed"));
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});

    const result = await authorizeCredentials({
      email: ACTIVE_USER.email,
      password: "uma-senha-bem-longa",
    });

    expect(result?.id).toBe("cuid-123");
    spy.mockRestore();
  });
});

describe("authorizeCredentials — every failure returns a generic null", () => {
  it("returns null when no database is configured (no lookup)", async () => {
    isDatabaseConfiguredMock.mockReturnValue(false);
    await expect(
      authorizeCredentials({ email: ACTIVE_USER.email, password: "x" }),
    ).resolves.toBeNull();
    expect(findUnique).not.toHaveBeenCalled();
  });

  it("returns null for invalid input (bad email)", async () => {
    await expect(
      authorizeCredentials({ email: "not-an-email", password: "x" }),
    ).resolves.toBeNull();
    expect(findUnique).not.toHaveBeenCalled();
  });

  it("returns null for empty password", async () => {
    await expect(
      authorizeCredentials({ email: ACTIVE_USER.email, password: "" }),
    ).resolves.toBeNull();
    expect(findUnique).not.toHaveBeenCalled();
  });

  it("returns null for an unknown user", async () => {
    findUnique.mockResolvedValue(null);
    await expect(
      authorizeCredentials({ email: ACTIVE_USER.email, password: "x" }),
    ).resolves.toBeNull();
    expect(update).not.toHaveBeenCalled();
  });

  it("returns null when the user has no passwordHash (Entra-only / not accepted)", async () => {
    findUnique.mockResolvedValue({ ...ACTIVE_USER, passwordHash: null });
    verifyPasswordMock.mockResolvedValue(false);
    await expect(
      authorizeCredentials({ email: ACTIVE_USER.email, password: "x" }),
    ).resolves.toBeNull();
    expect(update).not.toHaveBeenCalled();
  });

  it("returns null for an inactive user (state must not leak)", async () => {
    findUnique.mockResolvedValue({ ...ACTIVE_USER, status: "INACTIVE" });
    // Even with a correct password, an inactive account yields the generic null.
    verifyPasswordMock.mockResolvedValue(true);
    await expect(
      authorizeCredentials({
        email: ACTIVE_USER.email,
        password: "uma-senha-bem-longa",
      }),
    ).resolves.toBeNull();
    expect(update).not.toHaveBeenCalled();
  });

  it("runs one password verification even for unknown users (anti-enumeration timing)", async () => {
    findUnique.mockResolvedValue(null);
    verifyPasswordMock.mockResolvedValue(false);
    await expect(
      authorizeCredentials({ email: ACTIVE_USER.email, password: "x" }),
    ).resolves.toBeNull();
    // scrypt runs once (against the dummy hash) so timing does not leak.
    expect(verifyPasswordMock).toHaveBeenCalledTimes(1);
    expect(update).not.toHaveBeenCalled();
  });

  it("returns null for a wrong password", async () => {
    findUnique.mockResolvedValue(ACTIVE_USER);
    verifyPasswordMock.mockResolvedValue(false);
    await expect(
      authorizeCredentials({
        email: ACTIVE_USER.email,
        password: "senha-errada",
      }),
    ).resolves.toBeNull();
    expect(update).not.toHaveBeenCalled();
  });
});
