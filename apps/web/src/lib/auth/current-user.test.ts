import { afterEach, describe, expect, it, vi } from "vitest";

const cookiesMock = vi.fn();
const authMock = vi.fn();
const syncUserFromAuthMock = vi.fn();

// Mock server-only deps so the test never loads the real Auth.js instance.
vi.mock("next/headers", () => ({ cookies: () => cookiesMock() }));
vi.mock("@/auth", () => ({ auth: () => authMock() }));
// Mock the (lazily-imported) persistence layer so no real Prisma is loaded.
vi.mock("@/lib/db/users", () => ({
  syncUserFromAuth: (...args: unknown[]) => syncUserFromAuthMock(...args),
}));

import { getCurrentUser } from "@/lib/auth/current-user";
import { DEV_USER } from "@/lib/auth/dev";

afterEach(() => {
  vi.unstubAllEnvs();
  vi.clearAllMocks();
});

describe("getCurrentUser — dev mode", () => {
  it("returns the dev user when dev mode is enabled (no database needed)", async () => {
    vi.stubEnv("AUTH_DEV_MODE", "true");
    vi.stubEnv("NODE_ENV", "development");
    cookiesMock.mockResolvedValue({ get: () => undefined });

    await expect(getCurrentUser()).resolves.toEqual(DEV_USER);
    // Dev mode must never touch the persistence layer.
    expect(syncUserFromAuthMock).not.toHaveBeenCalled();
  });

  it("returns null in dev mode when explicitly logged out", async () => {
    vi.stubEnv("AUTH_DEV_MODE", "true");
    vi.stubEnv("NODE_ENV", "development");
    cookiesMock.mockResolvedValue({
      get: (name: string) =>
        name === "jf_dev_logout" ? { value: "1" } : undefined,
    });

    await expect(getCurrentUser()).resolves.toBeNull();
  });
});

describe("getCurrentUser — real session, no database configured", () => {
  it("maps a session to AppUser and drops unknown roles", async () => {
    vi.stubEnv("AUTH_DEV_MODE", "false");
    vi.stubEnv("NODE_ENV", "test");
    vi.stubEnv("DATABASE_URL", "");
    authMock.mockResolvedValue({
      user: {
        id: "oid-1",
        email: "user@jumplabel.com.br",
        name: "Real User",
        roles: ["FINANCE", "NOT_A_ROLE"],
      },
    });

    await expect(getCurrentUser()).resolves.toEqual({
      id: "oid-1",
      name: "Real User",
      email: "user@jumplabel.com.br",
      roles: ["FINANCE"],
    });
    // Without a database we keep session-derived roles, no persistence call.
    expect(syncUserFromAuthMock).not.toHaveBeenCalled();
  });

  it("returns null when there is no session", async () => {
    vi.stubEnv("AUTH_DEV_MODE", "false");
    vi.stubEnv("NODE_ENV", "test");
    vi.stubEnv("DATABASE_URL", "");
    authMock.mockResolvedValue(null);

    await expect(getCurrentUser()).resolves.toBeNull();
  });
});

describe("getCurrentUser — real session, database configured", () => {
  it("uses persisted roles as the authoritative source", async () => {
    vi.stubEnv("AUTH_DEV_MODE", "false");
    vi.stubEnv("NODE_ENV", "test");
    vi.stubEnv("DATABASE_URL", "postgresql://user:pass@host:5432/db");
    authMock.mockResolvedValue({
      user: {
        id: "oid-1",
        email: "user@jumplabel.com.br",
        name: "Real User",
        // Session claims something, but persisted RBAC is what counts.
        roles: ["ADMIN"],
      },
    });
    syncUserFromAuthMock.mockResolvedValue({
      id: "db-1",
      name: "Real User",
      email: "user@jumplabel.com.br",
      roles: ["FINANCE"],
    });

    await expect(getCurrentUser()).resolves.toEqual({
      id: "db-1",
      name: "Real User",
      email: "user@jumplabel.com.br",
      roles: ["FINANCE"],
    });
    expect(syncUserFromAuthMock).toHaveBeenCalledTimes(1);
  });

  it("fails closed (no roles) when the database is unreachable", async () => {
    vi.stubEnv("AUTH_DEV_MODE", "false");
    vi.stubEnv("NODE_ENV", "test");
    vi.stubEnv("DATABASE_URL", "postgresql://user:pass@host:5432/db");
    authMock.mockResolvedValue({
      user: {
        id: "oid-1",
        email: "user@jumplabel.com.br",
        name: "Real User",
        roles: ["ADMIN"],
      },
    });
    syncUserFromAuthMock.mockRejectedValue(new Error("connection refused"));
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});

    await expect(getCurrentUser()).resolves.toEqual({
      id: "oid-1",
      name: "Real User",
      email: "user@jumplabel.com.br",
      roles: [],
    });

    spy.mockRestore();
  });
});
