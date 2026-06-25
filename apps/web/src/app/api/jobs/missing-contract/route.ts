import { NextResponse } from "next/server";
import { isCronAuthorized } from "@/lib/automation/job-auth";
import { runMissingContractSweep } from "@/lib/automation/missing-contract";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * Cron-triggered missing-commercial-contract sweep. Protected by `CRON_SECRET`.
 * Emits COMMERCIAL_CONTRACT_MISSING for ACTIVE projects without a contract ref.
 */
export async function POST(request: Request) {
  if (!isCronAuthorized(request)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  try {
    const appUrl = process.env.NEXT_PUBLIC_APP_URL
      ? `${process.env.NEXT_PUBLIC_APP_URL}/app/comercial`
      : undefined;
    const result = await runMissingContractSweep({ now: new Date(), appUrl });
    return NextResponse.json({ ok: true, result });
  } catch (error) {
    console.error("[job:missing-contract] failed", error);
    return NextResponse.json(
      { ok: false, error: "internal_error" },
      { status: 500 },
    );
  }
}

export const GET = POST;
