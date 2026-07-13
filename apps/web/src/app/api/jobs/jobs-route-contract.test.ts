import { afterEach, describe, expect, it, vi } from "vitest";
import * as autoApproval from "@/app/api/jobs/auto-approval/route";
import * as holidayAlert from "@/app/api/jobs/holiday-alert/route";
import * as missingTimesheets from "@/app/api/jobs/missing-timesheets/route";

/**
 * Vercel Cron triggers scheduled paths with a GET request (it cannot send a
 * method or body). Both job routes must therefore expose a GET handler, or the
 * scheduled run hits 405 and the automation silently never runs in production.
 * These assertions lock that contract.
 */
describe("cron job route contract", () => {
  it("auto-approval exposes a GET handler aliased to POST", () => {
    expect(typeof autoApproval.GET).toBe("function");
    expect(autoApproval.GET).toBe(autoApproval.POST);
  });

  it("missing-timesheets exposes a GET handler aliased to POST", () => {
    expect(typeof missingTimesheets.GET).toBe("function");
    expect(missingTimesheets.GET).toBe(missingTimesheets.POST);
  });

  it("holiday-alert exposes a GET handler aliased to POST", () => {
    expect(typeof holidayAlert.GET).toBe("function");
    expect(holidayAlert.GET).toBe(holidayAlert.POST);
  });
});

/**
 * With a configured CRON_SECRET, an unauthenticated call (no/incorrect Bearer)
 * must be rejected with 401 before the job does any work — same guard the other
 * job routes rely on (see job-auth.test.ts).
 */
describe("cron job route auth guard", () => {
  afterEach(() => vi.unstubAllEnvs());

  function reqGet(): Request {
    return new Request("http://localhost/api/jobs/holiday-alert", {
      method: "GET",
    });
  }

  it("holiday-alert returns 401 without a valid CRON_SECRET (GET, as Vercel Cron sends)", async () => {
    vi.stubEnv("CRON_SECRET", "s3cret");
    const res = await holidayAlert.GET(reqGet());
    expect(res.status).toBe(401);
  });
});
