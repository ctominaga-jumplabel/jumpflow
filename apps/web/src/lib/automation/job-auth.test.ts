import { afterEach, describe, expect, it, vi } from "vitest";
import { isCronAuthorized } from "@/lib/automation/job-auth";

afterEach(() => vi.unstubAllEnvs());

function req(authorization?: string): Request {
  return new Request("http://localhost/api/jobs/x", {
    method: "POST",
    headers: authorization ? { authorization } : {},
  });
}

describe("isCronAuthorized", () => {
  it("accepts a matching Bearer secret", () => {
    vi.stubEnv("CRON_SECRET", "s3cret");
    expect(isCronAuthorized(req("Bearer s3cret"))).toBe(true);
  });

  it("rejects a wrong or missing secret", () => {
    vi.stubEnv("CRON_SECRET", "s3cret");
    expect(isCronAuthorized(req("Bearer nope"))).toBe(false);
    expect(isCronAuthorized(req())).toBe(false);
  });

  it("allows unconfigured secret only outside production", () => {
    vi.stubEnv("CRON_SECRET", "");
    vi.stubEnv("NODE_ENV", "development");
    expect(isCronAuthorized(req())).toBe(true);

    vi.stubEnv("NODE_ENV", "production");
    expect(isCronAuthorized(req())).toBe(false);
  });
});
