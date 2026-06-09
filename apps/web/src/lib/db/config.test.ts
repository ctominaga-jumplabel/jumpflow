import { afterEach, describe, expect, it, vi } from "vitest";
import { isDatabaseConfigured } from "@/lib/db/config";

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("isDatabaseConfigured", () => {
  it("is false when DATABASE_URL is empty", () => {
    vi.stubEnv("DATABASE_URL", "");
    expect(isDatabaseConfigured()).toBe(false);
  });

  it("is false when DATABASE_URL is only whitespace", () => {
    vi.stubEnv("DATABASE_URL", "   ");
    expect(isDatabaseConfigured()).toBe(false);
  });

  it("is true when DATABASE_URL is a connection string", () => {
    vi.stubEnv("DATABASE_URL", "postgresql://user:pass@host:5432/db");
    expect(isDatabaseConfigured()).toBe(true);
  });
});
