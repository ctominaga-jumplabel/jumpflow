import { NextResponse } from "next/server";
import { isCronAuthorized } from "@/lib/automation/job-auth";
import { runOverdueInvoicingReminder } from "@/lib/automation/overdue-invoicing";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * Cron-triggered overdue invoicing reminder. Protected by `CRON_SECRET`.
 * No body. Emits INVOICING_OVERDUE for CLOSED-but-not-invoiced closings.
 */
export async function POST(request: Request) {
  if (!isCronAuthorized(request)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  try {
    const appUrl = process.env.NEXT_PUBLIC_APP_URL
      ? `${process.env.NEXT_PUBLIC_APP_URL}/app/financeiro`
      : undefined;
    const result = await runOverdueInvoicingReminder({ now: new Date(), appUrl });
    return NextResponse.json({ ok: true, result });
  } catch (error) {
    console.error("[job:overdue-invoicing] failed", error);
    return NextResponse.json(
      { ok: false, error: "internal_error" },
      { status: 500 },
    );
  }
}

export const GET = POST;
