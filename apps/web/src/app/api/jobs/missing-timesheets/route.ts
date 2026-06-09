import { NextResponse } from "next/server";
import { z } from "zod";
import {
  previousWeekRange,
  runMissingTimesheetReport,
} from "@/lib/automation/missing-timesheets";
import { isCronAuthorized } from "@/lib/automation/job-auth";

export const dynamic = "force-dynamic";

const bodySchema = z
  .object({
    periodStart: z.coerce.date(),
    periodEnd: z.coerce.date(),
  })
  .refine((b) => b.periodStart < b.periodEnd, {
    message: "periodStart must be before periodEnd",
  });

/**
 * Cron-triggered "missing timesheet" report job. Protected by `CRON_SECRET`.
 * Optional JSON body `{ periodStart, periodEnd }` (ISO dates); defaults to the
 * previous full week. Idempotent per period via AutomationEmailLog.
 */
export async function POST(request: Request) {
  if (!isCronAuthorized(request)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  let periodStart: Date;
  let periodEnd: Date;

  const raw = await request.text();
  if (raw.trim().length === 0) {
    const range = previousWeekRange(new Date());
    periodStart = range.start;
    periodEnd = range.end;
  } else {
    let json: unknown;
    try {
      json = JSON.parse(raw);
    } catch {
      return NextResponse.json({ error: "invalid_body" }, { status: 400 });
    }
    const parsed = bodySchema.safeParse(json);
    if (!parsed.success) {
      return NextResponse.json({ error: "invalid_period" }, { status: 400 });
    }
    periodStart = parsed.data.periodStart;
    periodEnd = parsed.data.periodEnd;
  }

  try {
    const result = await runMissingTimesheetReport({ periodStart, periodEnd });
    return NextResponse.json({ ok: true, result });
  } catch (error) {
    console.error("[job:missing-timesheets] failed", error);
    return NextResponse.json(
      { ok: false, error: "internal_error" },
      { status: 500 },
    );
  }
}
