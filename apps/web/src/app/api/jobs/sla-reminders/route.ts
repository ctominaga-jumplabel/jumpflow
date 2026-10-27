import { NextResponse } from "next/server";
import { isCronAuthorized } from "@/lib/automation/job-auth";
import { runSlaReminders } from "@/lib/automation/sla-reminders";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * Lembretes diarios de SLA do fluxo de horas (SLA_DEADLINE_APPROACHING /
 * SLA_OVERDUE). Protegido por `CRON_SECRET` (Authorization: Bearer). Sem body.
 * Idempotente por dia/etapa/competencia/destinatario — pode ser chamado mais de
 * uma vez. Agendamento sugerido: 1x por dia util as 08:00 BRT (11:00 UTC) via
 * cron service no Railway (ver docs/sla-fluxo-horas.md).
 */
export async function POST(request: Request) {
  if (!isCronAuthorized(request)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  try {
    const result = await runSlaReminders({
      now: new Date(),
      appUrl: process.env.NEXT_PUBLIC_APP_URL || undefined,
    });
    return NextResponse.json({ ok: true, result });
  } catch (error) {
    console.error("[job:sla-reminders] failed", error);
    return NextResponse.json({ ok: false, error: "internal_error" }, { status: 500 });
  }
}

export const GET = POST;
