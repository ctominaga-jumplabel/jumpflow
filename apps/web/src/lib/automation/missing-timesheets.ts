import { prisma } from "@jumpflow/database";
import {
  buildMissingTimesheetCsv,
  missingTimesheetReferenceKey,
  type MissingTimesheetRow,
} from "@jumpflow/shared";
import { isDatabaseConfigured } from "@/lib/db/config";
import { loadAutomationConfig } from "./config";
import { getEmailTransport } from "./email-transport";

export interface MissingTimesheetResult {
  skipped: boolean;
  reason?:
    | "no-database"
    | "already-sent"
    | "already-claimed"
    | "no-recipient"
    | "kept-failed";
  referenceKey: string;
  recipient: string | null;
  rowCount: number;
  emailed: boolean;
  status?: "SENT" | "FAILED";
}

/** Prisma unique-constraint violation, detected without importing the class. */
function isUniqueViolation(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    (error as { code?: string }).code === "P2002"
  );
}

/**
 * Compute the previous full week [Mon 00:00, next Mon 00:00) in UTC relative to
 * `now`. Used as the default report window.
 */
export function previousWeekRange(now: Date): { start: Date; end: Date } {
  const d = new Date(now);
  d.setUTCHours(0, 0, 0, 0);
  // 0=Sun..6=Sat -> days since Monday
  const dow = (d.getUTCDay() + 6) % 7;
  const thisMonday = new Date(d);
  thisMonday.setUTCDate(d.getUTCDate() - dow);
  const start = new Date(thisMonday);
  start.setUTCDate(thisMonday.getUTCDate() - 7);
  return { start, end: thisMonday };
}

/**
 * Build and email the "active consultants without any time entry in the period"
 * report. Idempotent per period via the unique (type, referenceKey) on
 * {@link AutomationEmailLog}: a SENT log short-circuits re-sends; a FAILED log
 * is retried on the next run (upsert promotes FAILED → SENT).
 *
 * When there are no missing consultants, no email is sent but the period is
 * still logged as processed (rowCount 0) so it is not recomputed/spammed.
 */
export async function runMissingTimesheetReport(params: {
  periodStart: Date;
  periodEnd: Date;
  now?: Date;
}): Promise<MissingTimesheetResult> {
  const now = params.now ?? new Date();
  const { periodStart, periodEnd } = params;
  const referenceKey = missingTimesheetReferenceKey(periodStart, periodEnd);

  if (!isDatabaseConfigured()) {
    return {
      skipped: true,
      reason: "no-database",
      referenceKey,
      recipient: null,
      rowCount: 0,
      emailed: false,
    };
  }

  // Snapshot of the log BEFORE any reservation this run makes. The branches
  // below rely on `existing` reflecting the pre-reservation state (do not
  // reassign it after the reserving create).
  const existing = await prisma.automationEmailLog.findUnique({
    where: {
      type_referenceKey: {
        type: "MISSING_TIMESHEET_REPORT",
        referenceKey,
      },
    },
  });
  if (existing?.status === "SENT") {
    return {
      skipped: true,
      reason: "already-sent",
      referenceKey,
      recipient: existing.recipient,
      rowCount: 0,
      emailed: false,
    };
  }

  const config = await loadAutomationConfig();
  const recipient = config.reportRecipientEmail;
  if (!recipient) {
    return {
      skipped: true,
      reason: "no-recipient",
      referenceKey,
      recipient: null,
      rowCount: 0,
      emailed: false,
    };
  }

  // Reserve the period BEFORE sending so two concurrent runs cannot both email.
  // A brand-new period is claimed with a unique-guarded create (status FAILED =
  // "reserved / not yet sent"); the loser of the race backs off. A pre-existing
  // FAILED row is our own reservation being retried, so we keep going.
  if (!existing) {
    try {
      await prisma.automationEmailLog.create({
        data: {
          type: "MISSING_TIMESHEET_REPORT",
          referenceKey,
          recipient,
          status: "FAILED",
          meta: { reserved: true },
        },
      });
    } catch (error) {
      if (isUniqueViolation(error)) {
        return {
          skipped: true,
          reason: "already-claimed",
          referenceKey,
          recipient,
          rowCount: 0,
          emailed: false,
        };
      }
      throw error;
    }
  }

  const whereKey = {
    type_referenceKey: {
      type: "MISSING_TIMESHEET_REPORT" as const,
      referenceKey,
    },
  };

  const missing = await prisma.consultant.findMany({
    where: {
      status: "ACTIVE",
      timeEntries: { none: { date: { gte: periodStart, lt: periodEnd } } },
    },
    select: { id: true, name: true, email: true, area: true, seniority: true },
    orderBy: { name: "asc" },
  });

  const rows: MissingTimesheetRow[] = missing.map((c) => ({
    consultantId: c.id,
    consultantName: c.name,
    consultantEmail: c.email,
    area: c.area,
    seniority: c.seniority,
  }));

  // No missing consultants: mark the period processed (no email). But never mask
  // a prior real failure — a pre-existing FAILED stays FAILED for inspection.
  if (rows.length === 0) {
    if (existing?.status === "FAILED") {
      return {
        skipped: true,
        reason: "kept-failed",
        referenceKey,
        recipient,
        rowCount: 0,
        emailed: false,
        status: "FAILED",
      };
    }
    await prisma.automationEmailLog.update({
      where: whereKey,
      data: {
        recipient,
        status: "SENT",
        error: null,
        meta: { rowCount: 0, emailed: false },
      },
    });
    return {
      skipped: false,
      referenceKey,
      recipient,
      rowCount: 0,
      emailed: false,
      status: "SENT",
    };
  }

  const csv = buildMissingTimesheetCsv(rows, {
    start: periodStart,
    end: periodEnd,
    generatedAt: now,
  });

  let status: "SENT" | "FAILED" = "SENT";
  let error: string | null = null;
  let messageId: string | null = null;

  try {
    const sent = await getEmailTransport().send({
      to: recipient,
      subject: `JumpFlow — Consultores sem lançamento (${referenceKey})`,
      text:
        `Relatório de consultores ativos sem lançamento de horas no período ` +
        `${referenceKey}. Total: ${rows.length}. CSV em anexo.`,
      attachments: [
        {
          filename: `consultores-sem-lancamento-${referenceKey}.csv`,
          content: csv,
          contentType: "text/csv; charset=utf-8",
        },
      ],
    });
    messageId = sent.id;
  } catch (e) {
    status = "FAILED";
    error = e instanceof Error ? e.message : String(e);
  }

  await prisma.automationEmailLog.update({
    where: whereKey,
    data: {
      recipient,
      status,
      error,
      meta: { rowCount: rows.length, emailed: status === "SENT", messageId },
    },
  });

  return {
    skipped: false,
    referenceKey,
    recipient,
    rowCount: rows.length,
    emailed: status === "SENT",
    status,
  };
}
