import { NextResponse } from "next/server";
import { z } from "zod";
import { isCronAuthorized } from "@/lib/automation/job-auth";
import { runOvertimeAlert } from "@/lib/automation/overtime-alert";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const bodySchema = z.object({
  month: z.coerce.number().int().min(1).max(12),
  year: z.coerce.number().int().min(2000).max(2100),
});

/** Previous calendar month relative to `now` (1-based month). */
function previousMonth(now: Date): { month: number; year: number } {
  const y = now.getUTCFullYear();
  const m = now.getUTCMonth(); // 0-based current month
  // Previous month: current 0-based m → if 0 (Jan) → Dec of last year.
  return m === 0 ? { month: 12, year: y - 1 } : { month: m, year: y };
}

/**
 * Cron-triggered overtime alert. Protected by `CRON_SECRET`. Optional JSON body
 * `{ month, year }` (1-based month); defaults to the previous calendar month.
 * Idempotent per competence via the notification engine.
 */
export async function POST(request: Request) {
  if (!isCronAuthorized(request)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  let month: number;
  let year: number;

  const raw = await request.text();
  if (raw.trim().length === 0) {
    ({ month, year } = previousMonth(new Date()));
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
    ({ month, year } = parsed.data);
  }

  try {
    const result = await runOvertimeAlert({ month, year });
    return NextResponse.json({ ok: true, result });
  } catch (error) {
    console.error("[job:overtime-alert] failed", error);
    return NextResponse.json(
      { ok: false, error: "internal_error" },
      { status: 500 },
    );
  }
}

// Vercel Cron triggers with a GET (no body) → previous-month default.
export const GET = POST;
