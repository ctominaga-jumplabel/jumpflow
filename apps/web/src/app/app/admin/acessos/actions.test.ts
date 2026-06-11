import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Tests for the admin access server actions. The invitations domain layer is
 * mocked — here we verify ONLY the action layer: ADMIN-only RBAC, the
 * no-database guard, domain-error mapping, and the email-vs-link decision for
 * invites (link returned to the UI only when no real provider is configured).
 */

const h = vi.hoisted(() => ({
  currentUser: {
    id: "admin-1",
    name: "Adm",
    email: "adm@x.com",
    roles: ["ADMIN"] as string[],
  },
}));

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("next/headers", () => ({
  headers: async () => ({
    get: (k: string) => (k === "host" ? "app.jump.test" : null),
  }),
}));

vi.mock("@/lib/auth/guards", () => ({
  requireRole: vi.fn(async (roles: string | string[]) => {
    const required = Array.isArray(roles) ? roles : [roles];
    const allowed = required.some((r) => h.currentUser.roles.includes(r));
    if (!allowed) {
      const err = new Error("NEXT_REDIRECT");
      Object.assign(err, { digest: "NEXT_REDIRECT;replace;/access-denied;307;" });
      throw err;
    }
    return h.currentUser;
  }),
}));

vi.mock("@/lib/db/users", () => ({
  resolveDbUser: vi.fn(async () => ({
    id: "admin-1",
    name: "Adm",
    email: "adm@x.com",
  })),
}));

const createInvitation = vi.fn();
const revokeInvitation = vi.fn();
const regenerateInvitation = vi.fn();
const setUserRoles = vi.fn();
const setUserStatus = vi.fn();

// The real module exports InvitationError; reuse it so `instanceof` works.
vi.mock("@/lib/db/invitations", async () => {
  const actual = await vi.importActual<typeof import("@/lib/db/invitations")>(
    "@/lib/db/invitations",
  );
  return {
    InvitationError: actual.InvitationError,
    createInvitation: (...a: unknown[]) => createInvitation(...a),
    revokeInvitation: (...a: unknown[]) => revokeInvitation(...a),
    regenerateInvitation: (...a: unknown[]) => regenerateInvitation(...a),
    setUserRoles: (...a: unknown[]) => setUserRoles(...a),
    setUserStatus: (...a: unknown[]) => setUserStatus(...a),
  };
});

const sendEmail = vi.fn();
vi.mock("@/lib/automation/email-transport", () => ({
  getEmailTransport: () => ({ send: (...a: unknown[]) => sendEmail(...a) }),
}));

import { InvitationError } from "@/lib/db/invitations";
import {
  changeUserRoles,
  changeUserStatus,
  inviteUser,
  revokeInvite,
} from "@/app/app/admin/acessos/actions";

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv("DATABASE_URL", "postgresql://u:p@localhost:5432/db");
  vi.stubEnv("EMAIL_PROVIDER", "console");
  vi.stubEnv("NEXT_PUBLIC_APP_URL", "");
  vi.stubEnv("AUTH_URL", "");
  h.currentUser.roles = ["ADMIN"];
  createInvitation.mockResolvedValue({
    invitation: {
      id: "inv-1",
      email: "new@x.com",
      name: "New",
      roles: ["CONSULTANT"],
      expiresAt: new Date(),
    },
    token: "plain-token-xyz",
  });
});

afterEach(() => vi.unstubAllEnvs());

describe("inviteUser", () => {
  it("rejects a non-admin user (redirect)", async () => {
    h.currentUser.roles = ["AREA_MANAGER"];
    await expect(
      inviteUser({ name: "New", email: "new@x.com", roles: ["CONSULTANT"] }),
    ).rejects.toMatchObject({
      digest: expect.stringContaining("/access-denied"),
    });
    expect(createInvitation).not.toHaveBeenCalled();
  });

  it("fails honestly when no database is configured", async () => {
    vi.stubEnv("DATABASE_URL", "");
    const result = await inviteUser({
      name: "New",
      email: "new@x.com",
      roles: ["CONSULTANT"],
    });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toBe("NO_DATABASE");
  });

  it("returns the one-time link (no email) when no real provider is configured", async () => {
    const result = await inviteUser({
      name: "New",
      email: "new@x.com",
      roles: ["CONSULTANT"],
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.emailed).toBe(false);
    expect(result.data.link).toContain("/convite/");
    expect(result.data.link).toContain("plain-token-xyz");
    expect(sendEmail).not.toHaveBeenCalled();
  });

  it("sends email and hides the link when a real provider is fully configured", async () => {
    vi.stubEnv("EMAIL_PROVIDER", "resend");
    vi.stubEnv("RESEND_API_KEY", "re_test");
    vi.stubEnv("RESEND_FROM_EMAIL", "JumpFlow <no-reply@x.com>");
    sendEmail.mockResolvedValue({ id: "e1", provider: "resend" });
    const result = await inviteUser({
      name: "New",
      email: "new@x.com",
      roles: ["CONSULTANT"],
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.emailed).toBe(true);
    expect(result.data.link).toBeUndefined();
    expect(sendEmail).toHaveBeenCalledTimes(1);
  });

  it("returns the link (not emailed) when resend is selected but keys are missing", async () => {
    // Misconfigured Resend silently falls back to console; the admin must still
    // get the link instead of a false "emailed" signal.
    vi.stubEnv("EMAIL_PROVIDER", "resend");
    vi.stubEnv("RESEND_API_KEY", "");
    vi.stubEnv("RESEND_FROM_EMAIL", "");
    const result = await inviteUser({
      name: "New",
      email: "new@x.com",
      roles: ["CONSULTANT"],
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.emailed).toBe(false);
    expect(result.data.link).toContain("/convite/");
    expect(sendEmail).not.toHaveBeenCalled();
  });

  it("maps ALREADY_HAS_ACCESS domain errors", async () => {
    createInvitation.mockRejectedValue(
      new InvitationError("ALREADY_HAS_ACCESS", "já tem acesso"),
    );
    const result = await inviteUser({
      name: "New",
      email: "active@x.com",
      roles: ["CONSULTANT"],
    });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toBe("ALREADY_HAS_ACCESS");
  });

  it("rejects invalid input (empty roles)", async () => {
    const result = await inviteUser({ name: "New", email: "new@x.com", roles: [] });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toBe("INVALID_INPUT");
  });
});

describe("changeUserRoles", () => {
  it("maps LAST_ADMIN domain errors", async () => {
    setUserRoles.mockRejectedValue(
      new InvitationError("LAST_ADMIN", "último admin"),
    );
    const result = await changeUserRoles({
      targetUserId: "u2",
      roles: ["CONSULTANT"],
    });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toBe("LAST_ADMIN");
  });

  it("rejects a non-admin user (redirect)", async () => {
    h.currentUser.roles = ["FINANCE"];
    await expect(
      changeUserRoles({ targetUserId: "u2", roles: ["CONSULTANT"] }),
    ).rejects.toMatchObject({ digest: expect.stringContaining("/access-denied") });
  });
});

describe("changeUserStatus", () => {
  it("maps LAST_ADMIN domain errors", async () => {
    setUserStatus.mockRejectedValue(
      new InvitationError("LAST_ADMIN", "último admin"),
    );
    const result = await changeUserStatus({
      targetUserId: "u2",
      status: "INACTIVE",
    });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toBe("LAST_ADMIN");
  });
});

describe("revokeInvite", () => {
  it("rejects a non-admin user (redirect)", async () => {
    h.currentUser.roles = ["CONSULTANT"];
    await expect(
      revokeInvite({ invitationId: "inv-1" }),
    ).rejects.toMatchObject({ digest: expect.stringContaining("/access-denied") });
  });

  it("revokes for an admin", async () => {
    revokeInvitation.mockResolvedValue({ ok: true });
    const result = await revokeInvite({ invitationId: "inv-1" });
    expect(result.ok).toBe(true);
    expect(revokeInvitation).toHaveBeenCalledWith("inv-1", "admin-1");
  });
});
