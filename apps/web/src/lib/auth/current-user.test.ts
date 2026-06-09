import { afterEach, describe, expect, it, vi } from "vitest";

const cookiesMock = vi.fn();
const authMock = vi.fn();

// Mock server-only deps so the test never loads the real Auth.js instance.
vi.mock("next/headers", () => ({ cookies: () => cookiesMock() }));
vi.mock("@/auth", () => ({ auth: () => authMock() }));

import { getCurrentUser } from "@/lib/auth/current-user";
import { DEV_USER } from "@/lib/auth/dev";

afterEach(() => {
  vi.unstubAllEnvs();
  vi.clearAllMocks();
});

describe("getCurrentUser — dev mode", () => {
  it("returns the dev user when dev mode is enabled", async () => {
    vi.stubEnv("AUTH_DEV_MODE", "true");
    vi.stubEnv("NODE_ENV", "development");
    cookiesMock.mockResolvedValue({ get: () => undefined });

    await expect(getCurrentUser()).resolves.toEqual(DEV_USER);
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

describe("getCurrentUser — real session", () => {
  it("maps a session to AppUser and drops unknown roles", async () => {
    vi.stubEnv("AUTH_DEV_MODE", "false");
    vi.stubEnv("NODE_ENV", "test");
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
  });

  it("returns null when there is no session", async () => {
    vi.stubEnv("AUTH_DEV_MODE", "false");
    vi.stubEnv("NODE_ENV", "test");
    authMock.mockResolvedValue(null);

    await expect(getCurrentUser()).resolves.toBeNull();
  });
});
