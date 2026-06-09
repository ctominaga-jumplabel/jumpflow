import { prisma } from "@jumpflow/database";
import {
  buildMissingTimesheetCsv,
  buildMissingTimesheetRows,
  missingTimesheetReferenceKey,
  type AllocationInput,
  type TimeEntryInput,
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
  recipients: string[];
  rowCount: number;
  emailed: boolean;
  status?: "SENT" | "FAILED";
  messageId?: string | null;
  provider?: string | null;
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
 * Build and email the weekly "absence of time entry per allocated project"
 * report. One row per non-compliant (consultant, project): a project with no
 * effective submission (SUBMITTED/APPROVED/CLOSED) in the period is reported,
 * classified as a missing draft or a total absence.
 *
 * Idempotent per period via the unique (type, referenceKey) on
 * {@link AutomationEmailLog}: a SENT log short-circuits re-sends; a FAILED log
 * is retried on the next run (upsert promotes FAILED → SENT).
 *
 * When there are no non-compliant rows, no email is sent but the period is
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
      recipients: [],
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
      recipients: [],
      rowCount: 0,
      emailed: false,
    };
  }

  // Read the effective recipient list ONCE and reuse it throughout the run.
  const config = await loadAutomationConfig();
  const recipients = config.reportRecipients;
  if (recipients.length === 0) {
    return {
      skipped: true,
      reason: "no-recipient",
      referenceKey,
      recipients: [],
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
          recipient: recipients.join(","),
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
          recipients,
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

  // Allocations active within the period: ACTIVE/PLANNED allocation that starts
  // before the window ends and is still open or ends within/after it, for an
  // ACTIVE consultant on an ACTIVE/PAUSED project.
  const allocations = await prisma.allocation.findMany({
    where: {
      status: { in: ["ACTIVE", "PLANNED"] },
      startDate: { lt: periodEnd },
      OR: [{ endDate: null }, { endDate: { gte: periodStart } }],
      consultant: { status: "ACTIVE" },
      project: { status: { in: ["ACTIVE", "PAUSED"] } },
    },
    select: {
      projectId: true,
      project: { select: { name: true } },
      consultantId: true,
      consultant: {
        select: { name: true, email: true, area: true, seniority: true },
      },
    },
  });

  const involvedConsultantIds = [
    ...new Set(allocations.map((a) => a.consultantId)),
  ];

  // Period boundaries are UTC midnight. This matches the automation domain
  // convention that TimeEntry.date is stored as a date-only value normalized to
  // UTC midnight (see docs/aprovacao-automatica.md §10 — same basis the
  // auto-approval engine uses for dailyTotalKey/isWeekend), so the week window
  // compares cleanly without timezone drift.
  const entries =
    involvedConsultantIds.length === 0
      ? []
      : await prisma.timeEntry.findMany({
          where: {
            consultantId: { in: involvedConsultantIds },
            date: { gte: periodStart, lt: periodEnd },
          },
          select: { consultantId: true, projectId: true, status: true },
        });

  const allocationInputs: AllocationInput[] = allocations.map((a) => ({
    consultantId: a.consultantId,
    consultantName: a.consultant.name,
    consultantEmail: a.consultant.email,
    area: a.consultant.area,
    seniority: String(a.consultant.seniority),
    projectId: a.projectId,
    projectName: a.project.name,
  }));

  const entryInputs: TimeEntryInput[] = entries.map((e) => ({
    consultantId: e.consultantId,
    projectId: e.projectId,
    status: String(e.status),
  }));

  const rows = buildMissingTimesheetRows(allocationInputs, entryInputs);

  // No non-compliant rows: mark the period processed (no email). But never mask
  // a prior real failure — a pre-existing FAILED stays FAILED for inspection.
  if (rows.length === 0) {
    if (existing?.status === "FAILED") {
      return {
        skipped: true,
        reason: "kept-failed",
        referenceKey,
        recipients,
        rowCount: 0,
        emailed: false,
        status: "FAILED",
      };
    }
    await prisma.automationEmailLog.update({
      where: whereKey,
      data: {
        recipient: recipients.join(","),
        status: "SENT",
        error: null,
        meta: { rowCount: 0, emailed: false },
      },
    });
    return {
      skipped: false,
      referenceKey,
      recipients,
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
  let provider: string | null = null;

  try {
    const sent = await getEmailTransport().send({
      to: recipients,
      subject: `JumpFlow — Ausência de lançamento por projeto (${referenceKey})`,
      text:
        `Relatório semanal de ausência de lançamento por projeto ` +
        `(${referenceKey}). Linhas: ${rows.length}. CSV em anexo.`,
      attachments: [
        {
          filename: `ausencia-lancamento-${referenceKey}.csv`,
          content: csv,
          contentType: "text/csv; charset=utf-8",
        },
      ],
    });
    messageId = sent.id;
    provider = sent.provider;
  } catch (e) {
    status = "FAILED";
    error = e instanceof Error ? e.message : String(e);
  }

  await prisma.automationEmailLog.update({
    where: whereKey,
    data: {
      recipient: recipients.join(","),
      status,
      error,
      meta: {
        rowCount: rows.length,
        emailed: status === "SENT",
        messageId,
        provider,
        recipients,
      },
    },
  });

  return {
    skipped: false,
    referenceKey,
    recipients,
    rowCount: rows.length,
    emailed: status === "SENT",
    status,
    messageId,
    provider,
  };
}
