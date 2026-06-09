import { NextResponse } from "next/server";
import { runAutoApproval } from "@/lib/automation/auto-approval";
import { isCronAuthorized } from "@/lib/automation/job-auth";

// Jobs touch the database and must never be statically optimized.
export const dynamic = "force-dynamic";

/**
 * Cron-triggered auto-approval job. Protected by `CRON_SECRET` (Bearer).
 * Idempotent: safe to call repeatedly (status-guard transitions).
 */
export async function POST(request: Request) {
  if (!isCronAuthorized(request)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  try {
    const result = await runAutoApproval();
    return NextResponse.json({ ok: true, result });
  } catch (error) {
    console.error("[job:auto-approval] failed", error);
    return NextResponse.json(
      { ok: false, error: "internal_error" },
      { status: 500 },
    );
  }
}

// Vercel Cron triggers the endpoint with a GET. Reuse the same handler so the
// scheduled run works; the CRON_SECRET Bearer guard still applies.
export const GET = POST;
