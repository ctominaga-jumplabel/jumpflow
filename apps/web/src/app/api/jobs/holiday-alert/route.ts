import { NextResponse } from "next/server";
import { z } from "zod";
import { isCronAuthorized } from "@/lib/automation/job-auth";
import {
  DEFAULT_HOLIDAY_DAYS_AHEAD,
  runHolidayAlert,
} from "@/lib/automation/holiday-alert";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const bodySchema = z.object({
  daysAhead: z.coerce.number().int().min(1).max(90).optional(),
});

/**
 * Cron-triggered holiday alert. Protected by `CRON_SECRET`. Optional JSON body
 * `{ daysAhead }` (default 7). Scans the Holiday calendar for upcoming holidays
 * and emits HOLIDAY_UPCOMING through the notification engine. Idempotent per
 * holiday date via the engine — safe to run daily.
 */
export async function POST(request: Request) {
  if (!isCronAuthorized(request)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  let daysAhead: number = DEFAULT_HOLIDAY_DAYS_AHEAD;

  const raw = await request.text();
  if (raw.trim().length > 0) {
    let json: unknown;
    try {
      json = JSON.parse(raw);
    } catch {
      return NextResponse.json({ error: "invalid_body" }, { status: 400 });
    }
    const parsed = bodySchema.safeParse(json);
    if (!parsed.success) {
      return NextResponse.json({ error: "invalid_params" }, { status: 400 });
    }
    daysAhead = parsed.data.daysAhead ?? DEFAULT_HOLIDAY_DAYS_AHEAD;
  }

  try {
    const result = await runHolidayAlert({ daysAhead });
    return NextResponse.json({ ok: true, result });
  } catch (error) {
    console.error("[job:holiday-alert] failed", error);
    return NextResponse.json(
      { ok: false, error: "internal_error" },
      { status: 500 },
    );
  }
}

// Vercel Cron triggers with a GET (no body) → default 7-day window.
export const GET = POST;
