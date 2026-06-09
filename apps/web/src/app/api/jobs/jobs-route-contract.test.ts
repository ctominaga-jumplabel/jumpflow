import { describe, expect, it } from "vitest";
import * as autoApproval from "@/app/api/jobs/auto-approval/route";
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
});
