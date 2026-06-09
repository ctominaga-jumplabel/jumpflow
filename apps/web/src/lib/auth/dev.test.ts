import { afterEach, describe, expect, it, vi } from "vitest";
import { DEV_USER, isDevAuthEnabled } from "@/lib/auth/dev";
import { ROLE_NAMES } from "@/lib/auth/roles";

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("isDevAuthEnabled", () => {
  it("is true only when the flag is set and not in production", () => {
    vi.stubEnv("AUTH_DEV_MODE", "true");
    vi.stubEnv("NODE_ENV", "development");
    expect(isDevAuthEnabled()).toBe(true);
  });

  it("is false in production even with the flag set", () => {
    vi.stubEnv("AUTH_DEV_MODE", "true");
    vi.stubEnv("NODE_ENV", "production");
    expect(isDevAuthEnabled()).toBe(false);
  });

  it("is false when the flag is not set", () => {
    vi.stubEnv("AUTH_DEV_MODE", "");
    vi.stubEnv("NODE_ENV", "development");
    expect(isDevAuthEnabled()).toBe(false);
  });
});

describe("DEV_USER", () => {
  it("holds every role so all screens are reachable in dev mode", () => {
    expect(DEV_USER.roles).toEqual([...ROLE_NAMES]);
  });
});
