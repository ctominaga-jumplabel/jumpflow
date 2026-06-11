import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Tests for the PUBLIC invite-acceptance server action (`/convite/[token]`).
 * The token is the bearer credential — there is NO auth here. The domain layer
 * (`acceptInvitation`) is mocked; we verify ONLY the action contract:
 *  - no-database guard,
 *  - Zod validation (weak password surfaced honestly, other issues neutral),
 *  - mapping of domain errors to a SINGLE neutral INVITE_INVALID with no
 *    distinction between unknown / expired / revoked / accepted (no existence
 *    or state leak), and the token never logged.
 */

const acceptInvitation = vi.fn();

// Reuse the real InvitationError so `instanceof` works inside the action.
vi.mock("@/lib/db/invitations", async () => {
  const actual = await vi.importActual<typeof import("@/lib/db/invitations")>(
    "@/lib/db/invitations",
  );
  return {
    InvitationError: actual.InvitationError,
    acceptInvitation: (...a: unknown[]) => acceptInvitation(...a),
  };
});

import { InvitationError } from "@/lib/db/invitations";
import { acceptInvite } from "./actions";

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv("DATABASE_URL", "postgresql://u:p@localhost:5432/db");
  acceptInvitation.mockResolvedValue({ ok: true });
});

afterEach(() => vi.unstubAllEnvs());

describe("acceptInvite — happy path", () => {
  it("accepts a valid token + strong password and forwards name/token/password", async () => {
    const result = await acceptInvite({
      token: "plain-token",
      password: "uma-senha-bem-longa",
      name: "Nova Pessoa",
    });
    expect(result.ok).toBe(true);
    expect(acceptInvitation).toHaveBeenCalledWith({
      token: "plain-token",
      password: "uma-senha-bem-longa",
      name: "Nova Pessoa",
    });
  });
});

describe("acceptInvite — guards & validation", () => {
  it("fails honestly when no database is configured (before any domain call)", async () => {
    vi.stubEnv("DATABASE_URL", "");
    const result = await acceptInvite({
      token: "t",
      password: "uma-senha-bem-longa",
    });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toBe("NO_DATABASE");
    expect(acceptInvitation).not.toHaveBeenCalled();
  });

  it("rejects a short password as WEAK_PASSWORD without calling the domain", async () => {
    const result = await acceptInvite({ token: "t", password: "short" });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toBe("WEAK_PASSWORD");
    expect(acceptInvitation).not.toHaveBeenCalled();
  });

  it("rejects an empty token as INVALID_INPUT (not a password leak)", async () => {
    const result = await acceptInvite({
      token: "",
      password: "uma-senha-bem-longa",
    });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toBe("INVALID_INPUT");
    expect(acceptInvitation).not.toHaveBeenCalled();
  });
});

describe("acceptInvite — neutral error for every invalid-token case", () => {
  // The action must NOT reveal whether the token was unknown, expired, revoked
  // or already accepted: the domain raises the same INVITE_INVALID for all, and
  // the action maps it to the same code + neutral message.
  it.each([
    ["unknown", "Convite inválido ou expirado."],
    ["expired", "Convite inválido ou expirado."],
    ["revoked", "Convite inválido ou expirado."],
    ["already accepted (single-use)", "Convite inválido ou expirado."],
  ])("maps the %s case to INVITE_INVALID", async (_label, message) => {
    acceptInvitation.mockRejectedValue(
      new InvitationError("INVITE_INVALID", message),
    );
    const result = await acceptInvite({
      token: "t",
      password: "uma-senha-bem-longa",
    });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toBe("INVITE_INVALID");
    expect(result.message).toBe("Convite inválido ou expirado.");
  });

  it("maps a domain WEAK_PASSWORD to WEAK_PASSWORD (defense in depth)", async () => {
    acceptInvitation.mockRejectedValue(
      new InvitationError("WEAK_PASSWORD", "A senha deve ter ao menos 10 caracteres."),
    );
    const result = await acceptInvite({
      token: "t",
      password: "uma-senha-bem-longa",
    });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toBe("WEAK_PASSWORD");
  });

  it("maps an unexpected error to UNEXPECTED without leaking the token", async () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    acceptInvitation.mockRejectedValue(new Error("db exploded: token=secret"));
    const result = await acceptInvite({
      token: "super-secret-token",
      password: "uma-senha-bem-longa",
    });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toBe("UNEXPECTED");
    // The generic message must not echo the token back to the client.
    expect(result.message).not.toContain("super-secret-token");
    spy.mockRestore();
  });
});
