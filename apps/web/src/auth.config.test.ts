import { afterEach, describe, expect, it, vi } from "vitest";

const isDatabaseConfiguredMock = vi.fn();
vi.mock("@/lib/db/config", () => ({
  isDatabaseConfigured: () => isDatabaseConfiguredMock(),
}));

import { isCredentialsEnabled, isEntraConfigured } from "./auth.config";

afterEach(() => {
  vi.unstubAllEnvs();
  vi.clearAllMocks();
});

describe("isCredentialsEnabled", () => {
  it("requires both the flag and a configured database", () => {
    vi.stubEnv("AUTH_CREDENTIALS_ENABLED", "true");
    isDatabaseConfiguredMock.mockReturnValue(true);
    expect(isCredentialsEnabled()).toBe(true);
  });

  it("is false when the flag is off, even with a database", () => {
    vi.stubEnv("AUTH_CREDENTIALS_ENABLED", "");
    isDatabaseConfiguredMock.mockReturnValue(true);
    expect(isCredentialsEnabled()).toBe(false);
  });

  it("is false without a database, even with the flag on", () => {
    vi.stubEnv("AUTH_CREDENTIALS_ENABLED", "true");
    isDatabaseConfiguredMock.mockReturnValue(false);
    expect(isCredentialsEnabled()).toBe(false);
  });
});

describe("isEntraConfigured", () => {
  it("is true only when all three env vars are present", () => {
    vi.stubEnv("AUTH_MICROSOFT_ENTRA_ID_ID", "id");
    vi.stubEnv("AUTH_MICROSOFT_ENTRA_ID_SECRET", "secret");
    vi.stubEnv("AUTH_MICROSOFT_ENTRA_ID_TENANT_ID", "tenant");
    expect(isEntraConfigured()).toBe(true);
  });

  it("is false when any is missing", () => {
    vi.stubEnv("AUTH_MICROSOFT_ENTRA_ID_ID", "id");
    vi.stubEnv("AUTH_MICROSOFT_ENTRA_ID_SECRET", "");
    vi.stubEnv("AUTH_MICROSOFT_ENTRA_ID_TENANT_ID", "tenant");
    expect(isEntraConfigured()).toBe(false);
  });
});
