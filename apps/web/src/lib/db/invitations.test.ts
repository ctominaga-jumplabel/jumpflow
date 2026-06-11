import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Domain tests for the invitations + access-management layer.
 *
 * Prisma is mocked; `$transaction(fn)` runs the callback against the SAME mock
 * (so reads/writes inside a transaction hit the same spies). `node:crypto` is
 * real — we assert that the stored value is a sha256 digest, NOT the plaintext
 * token. `hashPassword` is mocked to keep scrypt out of the hot path.
 */

const m = vi.hoisted(() => {
  const userFindUnique = vi.fn();
  const userUpsert = vi.fn();
  const userUpdate = vi.fn();
  const userCount = vi.fn();
  const userFindMany = vi.fn();
  const invFindUnique = vi.fn();
  const invFindFirst = vi.fn();
  const invFindMany = vi.fn();
  const invCreate = vi.fn();
  const invUpdateMany = vi.fn();
  const roleFindMany = vi.fn();
  const userRoleUpsert = vi.fn();
  const userRoleDeleteMany = vi.fn();
  const auditCreate = vi.fn();
  const hashPasswordMock = vi.fn(async (p: string) => `hashed:${p}`);

  const prismaMock: Record<string, unknown> = {
    user: {
      findUnique: (...a: unknown[]) => userFindUnique(...a),
      upsert: (...a: unknown[]) => userUpsert(...a),
      update: (...a: unknown[]) => userUpdate(...a),
      count: (...a: unknown[]) => userCount(...a),
      findMany: (...a: unknown[]) => userFindMany(...a),
    },
    userInvitation: {
      findUnique: (...a: unknown[]) => invFindUnique(...a),
      findFirst: (...a: unknown[]) => invFindFirst(...a),
      findMany: (...a: unknown[]) => invFindMany(...a),
      create: (...a: unknown[]) => invCreate(...a),
      updateMany: (...a: unknown[]) => invUpdateMany(...a),
    },
    role: { findMany: (...a: unknown[]) => roleFindMany(...a) },
    userRole: {
      upsert: (...a: unknown[]) => userRoleUpsert(...a),
      deleteMany: (...a: unknown[]) => userRoleDeleteMany(...a),
    },
    auditEvent: { create: (...a: unknown[]) => auditCreate(...a) },
    $transaction: (fn: (tx: unknown) => unknown) => fn(prismaMock),
  };

  return {
    prismaMock,
    userFindUnique,
    userUpsert,
    userUpdate,
    userCount,
    userFindMany,
    invFindUnique,
    invFindFirst,
    invFindMany,
    invCreate,
    invUpdateMany,
    roleFindMany,
    userRoleUpsert,
    userRoleDeleteMany,
    auditCreate,
    hashPasswordMock,
  };
});

const {
  userFindUnique,
  userUpsert,
  userUpdate,
  userCount,
  invFindUnique,
  invFindMany,
  invCreate,
  invUpdateMany,
  roleFindMany,
  userRoleUpsert,
  userRoleDeleteMany,
  auditCreate,
  hashPasswordMock,
} = m;

vi.mock("@jumpflow/database", () => ({
  prisma: m.prismaMock,
  Prisma: { JsonNull: "__JsonNull__" },
}));

vi.mock("@/lib/auth/password", () => ({
  hashPassword: (p: string) => m.hashPasswordMock(p),
}));

import { createHash } from "node:crypto";
import {
  InvitationError,
  acceptInvitation,
  createInvitation,
  findValidInvitationByToken,
  setUserRoles,
  setUserStatus,
} from "@/lib/db/invitations";

function sha256(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

beforeEach(() => {
  vi.clearAllMocks();
  // Sensible defaults — individual tests override as needed.
  userFindUnique.mockResolvedValue(null);
  invFindMany.mockResolvedValue([]);
  invCreate.mockImplementation(
    (arg: { data: { email: string; name: string; roles: string[]; expiresAt: Date } }) => ({
      id: "inv-new",
      email: arg.data.email,
      name: arg.data.name,
      roles: arg.data.roles,
      expiresAt: arg.data.expiresAt,
    }),
  );
  auditCreate.mockResolvedValue({});
  invUpdateMany.mockResolvedValue({ count: 1 });
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("createInvitation", () => {
  it("generates a token and stores only its sha256 digest (never plaintext)", async () => {
    const result = await createInvitation({
      email: "  New.Person@Jump.com ",
      name: " New Person ",
      roles: ["CONSULTANT"],
      invitedByDbUserId: "admin-1",
    });

    expect(result.token).toBeTypeOf("string");
    expect(result.token.length).toBeGreaterThan(20);

    const createArg = invCreate.mock.calls[0][0] as { data: Record<string, unknown> };
    // Email normalized, only the digest stored, plaintext absent.
    expect(createArg.data.email).toBe("new.person@jump.com");
    expect(createArg.data.tokenHash).toBe(sha256(result.token));
    expect(createArg.data.tokenHash).not.toBe(result.token);
    expect(JSON.stringify(createArg.data)).not.toContain(result.token);
    expect(createArg.data.status).toBe("PENDING");

    // INVITATION_CREATED audited.
    const actions = auditCreate.mock.calls.map(
      (c) => (c[0] as { data: { action: string } }).data.action,
    );
    expect(actions).toContain("INVITATION_CREATED");
  });

  it("revokes a prior PENDING invitation for the same email (dedup)", async () => {
    invFindMany.mockResolvedValue([{ id: "old-1" }]);

    await createInvitation({
      email: "dup@jump.com",
      name: "Dup",
      roles: ["CONSULTANT"],
      invitedByDbUserId: "admin-1",
    });

    expect(invUpdateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: { in: ["old-1"] } },
        data: { status: "REVOKED" },
      }),
    );
    const actions = auditCreate.mock.calls.map(
      (c) => (c[0] as { data: { action: string } }).data.action,
    );
    expect(actions).toContain("INVITATION_REVOKED");
    expect(actions).toContain("INVITATION_CREATED");
  });

  it("blocks inviting an email that already has an ACTIVE user", async () => {
    userFindUnique.mockResolvedValue({ status: "ACTIVE" });

    await expect(
      createInvitation({
        email: "active@jump.com",
        name: "Active",
        roles: ["CONSULTANT"],
        invitedByDbUserId: "admin-1",
      }),
    ).rejects.toMatchObject({ code: "ALREADY_HAS_ACCESS" });
    expect(invCreate).not.toHaveBeenCalled();
  });

  it("rejects an empty role set", async () => {
    await expect(
      createInvitation({
        email: "x@jump.com",
        name: "X",
        roles: [],
        invitedByDbUserId: "admin-1",
      }),
    ).rejects.toBeInstanceOf(InvitationError);
  });
});

describe("findValidInvitationByToken", () => {
  const future = new Date(Date.now() + 60_000);
  const past = new Date(Date.now() - 60_000);

  it("returns the invitation when PENDING and not expired", async () => {
    invFindUnique.mockResolvedValue({
      id: "inv-1",
      email: "p@jump.com",
      name: "P",
      roles: ["CONSULTANT"],
      status: "PENDING",
      expiresAt: future,
    });
    const result = await findValidInvitationByToken("plain-token");
    expect(result).toEqual({
      id: "inv-1",
      email: "p@jump.com",
      name: "P",
      roles: ["CONSULTANT"],
    });
    // Looked up by digest, not plaintext.
    const arg = invFindUnique.mock.calls[0][0] as { where: { tokenHash: string } };
    expect(arg.where.tokenHash).toBe(sha256("plain-token"));
  });

  it("marks an expired PENDING invitation EXPIRED and returns null", async () => {
    invFindUnique.mockResolvedValue({
      id: "inv-2",
      email: "p@jump.com",
      name: "P",
      roles: ["CONSULTANT"],
      status: "PENDING",
      expiresAt: past,
    });
    const result = await findValidInvitationByToken("tok");
    expect(result).toBeNull();
    expect(invUpdateMany).toHaveBeenCalledWith(
      expect.objectContaining({ data: { status: "EXPIRED" } }),
    );
  });

  it("returns null for a revoked invitation (no detail leak)", async () => {
    invFindUnique.mockResolvedValue({ status: "REVOKED", expiresAt: future });
    expect(await findValidInvitationByToken("tok")).toBeNull();
  });

  it("returns null for an unknown token", async () => {
    invFindUnique.mockResolvedValue(null);
    expect(await findValidInvitationByToken("ghost")).toBeNull();
  });

  it("returns null for an empty token without querying", async () => {
    expect(await findValidInvitationByToken("")).toBeNull();
    expect(invFindUnique).not.toHaveBeenCalled();
  });
});

describe("acceptInvitation", () => {
  const future = new Date(Date.now() + 60_000);

  function pendingInvite() {
    invFindUnique.mockResolvedValue({
      id: "inv-1",
      email: "join@jump.com",
      name: "Join",
      roles: ["CONSULTANT", "SALES"],
      status: "PENDING",
      expiresAt: future,
    });
    userUpsert.mockResolvedValue({ id: "user-1" });
    roleFindMany.mockResolvedValue([
      { id: "r-con", name: "CONSULTANT" },
      { id: "r-sal", name: "SALES" },
    ]);
    userRoleUpsert.mockResolvedValue({});
    invUpdateMany.mockResolvedValue({ count: 1 });
  }

  it("creates/activates the user, grants roles, marks ACCEPTED and audits", async () => {
    pendingInvite();

    await expect(
      acceptInvitation({ token: "tok", password: "longenough10" }),
    ).resolves.toEqual({ ok: true });

    // Password hashed, user activated with the hash.
    expect(hashPasswordMock).toHaveBeenCalledWith("longenough10");
    const upsertArg = userUpsert.mock.calls[0][0] as {
      create: Record<string, unknown>;
    };
    expect(upsertArg.create.passwordHash).toBe("hashed:longenough10");
    expect(upsertArg.create.status).toBe("ACTIVE");

    // Both roles granted.
    expect(userRoleUpsert).toHaveBeenCalledTimes(2);

    // Marked ACCEPTED with the created user id.
    expect(invUpdateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "inv-1", status: "PENDING" },
        data: expect.objectContaining({ status: "ACCEPTED", createdUserId: "user-1" }),
      }),
    );

    const actions = auditCreate.mock.calls.map(
      (c) => (c[0] as { data: { action: string } }).data.action,
    );
    expect(actions).toContain("INVITATION_ACCEPTED");
    expect(actions).toContain("ROLE_GRANTED");
  });

  it("rejects a weak password before touching the database", async () => {
    await expect(
      acceptInvitation({ token: "tok", password: "short" }),
    ).rejects.toMatchObject({ code: "WEAK_PASSWORD" });
    expect(invFindUnique).not.toHaveBeenCalled();
    expect(userUpsert).not.toHaveBeenCalled();
  });

  it("fails for an unknown token (neutral INVITE_INVALID, no writes)", async () => {
    invFindUnique.mockResolvedValue(null);
    await expect(
      acceptInvitation({ token: "tok", password: "longenough10" }),
    ).rejects.toMatchObject({ code: "INVITE_INVALID" });
    expect(userUpsert).not.toHaveBeenCalled();
    expect(userRoleUpsert).not.toHaveBeenCalled();
    expect(invUpdateMany).not.toHaveBeenCalled();
  });

  it("fails neutrally for a PENDING-but-EXPIRED invitation (no account created)", async () => {
    // Same neutral error as unknown/revoked/accepted: the in-transaction guard
    // re-checks expiry so a link that lapsed after the page render still fails,
    // and never reveals that the token was once valid.
    invFindUnique.mockResolvedValue({
      id: "inv-exp",
      email: "late@jump.com",
      name: "Late",
      roles: ["CONSULTANT"],
      status: "PENDING",
      expiresAt: new Date(Date.now() - 60_000),
    });
    await expect(
      acceptInvitation({ token: "tok", password: "longenough10" }),
    ).rejects.toMatchObject({ code: "INVITE_INVALID" });
    expect(userUpsert).not.toHaveBeenCalled();
    expect(userRoleUpsert).not.toHaveBeenCalled();
    expect(invUpdateMany).not.toHaveBeenCalled();
    expect(auditCreate).not.toHaveBeenCalled();
  });

  it("fails neutrally for a REVOKED invitation (status guard, no writes)", async () => {
    invFindUnique.mockResolvedValue({
      id: "inv-rev",
      email: "revoked@jump.com",
      name: "Revoked",
      roles: ["CONSULTANT"],
      status: "REVOKED",
      expiresAt: future,
    });
    await expect(
      acceptInvitation({ token: "tok", password: "longenough10" }),
    ).rejects.toMatchObject({ code: "INVITE_INVALID" });
    expect(userUpsert).not.toHaveBeenCalled();
    expect(invUpdateMany).not.toHaveBeenCalled();
  });

  it("fails neutrally for an already-ACCEPTED invitation (single-use)", async () => {
    // Re-using a token whose invitation is already ACCEPTED must not create a
    // second user or re-grant roles; same neutral error as every other case.
    invFindUnique.mockResolvedValue({
      id: "inv-acc",
      email: "done@jump.com",
      name: "Done",
      roles: ["CONSULTANT"],
      status: "ACCEPTED",
      expiresAt: future,
    });
    await expect(
      acceptInvitation({ token: "tok", password: "longenough10" }),
    ).rejects.toMatchObject({ code: "INVITE_INVALID" });
    expect(userUpsert).not.toHaveBeenCalled();
    expect(invUpdateMany).not.toHaveBeenCalled();
  });

  it("re-hashes the token (sha256) before looking it up, never the plaintext", async () => {
    pendingInvite();
    await acceptInvitation({ token: "the-plain-token", password: "longenough10" });
    const arg = invFindUnique.mock.calls[0][0] as { where: { tokenHash: string } };
    expect(arg.where.tokenHash).toBe(sha256("the-plain-token"));
    expect(arg.where.tokenHash).not.toBe("the-plain-token");
  });

  it("hashes the password OUTSIDE the row guard (discarded on invalid token)", async () => {
    // scrypt runs before the transaction; an invalid token still must not
    // persist anything. Confirms the hash is computed but never written.
    invFindUnique.mockResolvedValue(null);
    await expect(
      acceptInvitation({ token: "tok", password: "longenough10" }),
    ).rejects.toMatchObject({ code: "INVITE_INVALID" });
    expect(hashPasswordMock).toHaveBeenCalledWith("longenough10");
    expect(userUpsert).not.toHaveBeenCalled();
  });

  it("fails when the status guard loses a race (count !== 1)", async () => {
    pendingInvite();
    invUpdateMany.mockResolvedValue({ count: 0 });
    await expect(
      acceptInvitation({ token: "tok", password: "longenough10" }),
    ).rejects.toMatchObject({ code: "INVITE_INVALID" });
  });
});

describe("setUserRoles last-admin guard", () => {
  function targetAdmin(otherActiveAdmins: number) {
    userFindUnique.mockResolvedValue({
      id: "target",
      status: "ACTIVE",
      roles: [{ role: { id: "r-adm", name: "ADMIN" } }],
    });
    userCount.mockResolvedValue(otherActiveAdmins);
    roleFindMany.mockResolvedValue([
      { id: "r-adm", name: "ADMIN" },
      { id: "r-con", name: "CONSULTANT" },
    ]);
  }

  it("blocks removing ADMIN from the last active admin", async () => {
    targetAdmin(0);
    await expect(
      setUserRoles({ targetUserId: "target", roles: ["CONSULTANT"], actorDbUserId: "a" }),
    ).rejects.toMatchObject({ code: "LAST_ADMIN" });
    expect(userRoleDeleteMany).not.toHaveBeenCalled();
  });

  it("allows removing ADMIN when another active admin exists", async () => {
    targetAdmin(1);
    userRoleUpsert.mockResolvedValue({});
    userRoleDeleteMany.mockResolvedValue({ count: 1 });

    const result = await setUserRoles({
      targetUserId: "target",
      roles: ["CONSULTANT"],
      actorDbUserId: "a",
    });
    expect(result).toEqual({ ok: true, roles: ["CONSULTANT"] });
    expect(userRoleDeleteMany).toHaveBeenCalled();
    const actions = auditCreate.mock.calls.map(
      (c) => (c[0] as { data: { action: string } }).data.action,
    );
    expect(actions).toContain("ROLE_GRANTED");
    expect(actions).toContain("ROLE_REVOKED");
  });

  it("is a no-op (no write/audit) when the role set is unchanged", async () => {
    userFindUnique.mockResolvedValue({
      id: "target",
      status: "ACTIVE",
      roles: [{ role: { id: "r-con", name: "CONSULTANT" } }],
    });
    const result = await setUserRoles({
      targetUserId: "target",
      roles: ["CONSULTANT"],
      actorDbUserId: "a",
    });
    expect(result).toEqual({ ok: true, roles: ["CONSULTANT"] });
    expect(userRoleUpsert).not.toHaveBeenCalled();
    expect(userRoleDeleteMany).not.toHaveBeenCalled();
    expect(auditCreate).not.toHaveBeenCalled();
  });
});

describe("setUserStatus last-admin guard", () => {
  it("blocks deactivating the last active admin", async () => {
    userFindUnique.mockResolvedValue({
      id: "target",
      status: "ACTIVE",
      roles: [{ role: { name: "ADMIN" } }],
    });
    userCount.mockResolvedValue(0);

    await expect(
      setUserStatus({ targetUserId: "target", status: "INACTIVE", actorDbUserId: "a" }),
    ).rejects.toMatchObject({ code: "LAST_ADMIN" });
    expect(userUpdate).not.toHaveBeenCalled();
  });

  it("allows deactivating an admin when another active admin exists", async () => {
    userFindUnique.mockResolvedValue({
      id: "target",
      status: "ACTIVE",
      roles: [{ role: { name: "ADMIN" } }],
    });
    userCount.mockResolvedValue(2);
    userUpdate.mockResolvedValue({});

    const result = await setUserStatus({
      targetUserId: "target",
      status: "INACTIVE",
      actorDbUserId: "a",
    });
    expect(result).toEqual({ ok: true, status: "INACTIVE" });
    expect(userUpdate).toHaveBeenCalled();
    const actions = auditCreate.mock.calls.map(
      (c) => (c[0] as { data: { action: string } }).data.action,
    );
    expect(actions).toContain("USER_STATUS_CHANGED");
  });

  it("does not guard when deactivating a non-admin", async () => {
    userFindUnique.mockResolvedValue({
      id: "target",
      status: "ACTIVE",
      roles: [{ role: { name: "CONSULTANT" } }],
    });
    userUpdate.mockResolvedValue({});

    const result = await setUserStatus({
      targetUserId: "target",
      status: "INACTIVE",
      actorDbUserId: "a",
    });
    expect(result).toEqual({ ok: true, status: "INACTIVE" });
    expect(userCount).not.toHaveBeenCalled();
  });
});
