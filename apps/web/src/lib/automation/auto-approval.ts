import { prisma } from "@jumpflow/database";
import {
  dailyTotalKey,
  evaluateAutoApproval,
  findDuplicateEntryIds,
  hoursToMinutes,
  type AutoApprovalDecision,
  type AutoApprovalFlags,
} from "@jumpflow/shared";
import { buildAuditEventData } from "@/lib/db/audit";
import { isDatabaseConfigured } from "@/lib/db/config";
import { loadAutomationConfig } from "./config";

export interface AutoApprovalResult {
  /** True when nothing ran (no DB or disabled). */
  skipped: boolean;
  reason?: "no-database" | "disabled";
  processed: number;
  approved: number;
  pending: number;
  /** Approve attempts that lost the status-guard race (already processed). */
  raced: number;
  ruleCounts: Record<string, number>;
}

function startOfUtcDay(date: Date): Date {
  const d = new Date(date);
  d.setUTCHours(0, 0, 0, 0);
  return d;
}

function endOfUtcDay(date: Date): Date {
  const d = new Date(date);
  d.setUTCHours(23, 59, 59, 999);
  return d;
}

/**
 * Process all SUBMITTED time entries against the auto-approval rules.
 *
 * Idempotent: only SUBMITTED entries are eligible and the approval is applied
 * via a conditional `updateMany(where status=SUBMITTED)` inside a transaction,
 * so a second run (or a concurrent cron) cannot double-approve. The AuditEvent
 * is written in the SAME transaction as the status change and the Approval, so
 * the audit trail can never silently diverge from the approval.
 */
export async function runAutoApproval(
  now: Date = new Date(),
): Promise<AutoApprovalResult> {
  const base: AutoApprovalResult = {
    skipped: false,
    processed: 0,
    approved: 0,
    pending: 0,
    raced: 0,
    ruleCounts: {},
  };

  if (!isDatabaseConfigured()) {
    return { ...base, skipped: true, reason: "no-database" };
  }

  const config = await loadAutomationConfig();
  if (!config.autoApprovalEnabled) {
    return { ...base, skipped: true, reason: "disabled" };
  }

  const submitted = await prisma.timeEntry.findMany({
    where: { status: "SUBMITTED" },
    select: {
      id: true,
      consultantId: true,
      projectId: true,
      activityType: true,
      date: true,
      hours: true,
      status: true,
      submittedAt: true,
    },
  });
  if (submitted.length === 0) return base;

  const consultantIds = [...new Set(submitted.map((e) => e.consultantId))];
  const projectIds = [...new Set(submitted.map((e) => e.projectId))];
  const times = submitted.map((e) => e.date.getTime());
  const rangeStart = startOfUtcDay(new Date(Math.min(...times)));
  const rangeEnd = endOfUtcDay(new Date(Math.max(...times)));

  // Day context: SUBMITTED + APPROVED entries for the involved consultants/days.
  // Used for both daily totals (already-approved hours count toward the 480)
  // and duplicate detection (a new entry duplicating an approved one is blocked).
  const dayEntries = await prisma.timeEntry.findMany({
    where: {
      consultantId: { in: consultantIds },
      status: { in: ["SUBMITTED", "APPROVED"] },
      date: { gte: rangeStart, lte: rangeEnd },
    },
    select: {
      id: true,
      consultantId: true,
      projectId: true,
      activityType: true,
      date: true,
      hours: true,
    },
  });

  const dailyTotals = new Map<string, number>();
  for (const e of dayEntries) {
    const key = dailyTotalKey(e.consultantId, e.date);
    dailyTotals.set(key, (dailyTotals.get(key) ?? 0) + hoursToMinutes(Number(e.hours)));
  }
  const duplicateIds = findDuplicateEntryIds(dayEntries);

  // Active exception flags per (consultant, project).
  const exceptions = await prisma.autoApprovalException.findMany({
    where: {
      active: true,
      consultantId: { in: consultantIds },
      projectId: { in: projectIds },
    },
    select: { consultantId: true, projectId: true, type: true },
  });
  const flagsByPair = new Map<string, AutoApprovalFlags>();
  for (const ex of exceptions) {
    const key = `${ex.consultantId}|${ex.projectId}`;
    const current = flagsByPair.get(key) ?? {
      allowAnyHours: false,
      allowWeekend: false,
    };
    if (ex.type === "ANY_HOURS") current.allowAnyHours = true;
    if (ex.type === "WEEKEND") current.allowWeekend = true;
    flagsByPair.set(key, current);
  }

  const result = { ...base };
  for (const entry of submitted) {
    result.processed += 1;
    const flags =
      flagsByPair.get(`${entry.consultantId}|${entry.projectId}`) ?? {
        allowAnyHours: false,
        allowWeekend: false,
      };

    const decision = evaluateAutoApproval(
      {
        status: entry.status,
        hours: Number(entry.hours),
        date: entry.date,
        submittedAt: entry.submittedAt,
        dailyTotalMinutes:
          dailyTotals.get(dailyTotalKey(entry.consultantId, entry.date)) ?? 0,
        hasDuplicate: duplicateIds.has(entry.id),
      },
      flags,
      config.settings,
      now,
    );

    if (decision.outcome !== "APPROVE") {
      result.pending += 1;
      continue;
    }

    const applied = await approveEntry(entry.id, decision);
    if (applied) {
      result.approved += 1;
      result.ruleCounts[decision.ruleKey] =
        (result.ruleCounts[decision.ruleKey] ?? 0) + 1;
    } else {
      result.raced += 1;
    }
  }

  return result;
}

/**
 * Apply a single approval atomically. Returns false if the entry was no longer
 * SUBMITTED (already processed by another run) — the guard that makes the whole
 * job idempotent.
 */
async function approveEntry(
  entryId: string,
  decision: AutoApprovalDecision,
): Promise<boolean> {
  return prisma.$transaction(async (tx) => {
    const updated = await tx.timeEntry.updateMany({
      where: { id: entryId, status: "SUBMITTED" },
      data: { status: "APPROVED" },
    });
    if (updated.count !== 1) return false;

    await tx.approval.create({
      data: {
        entityType: "TIME_ENTRY",
        entityId: entryId,
        approverUserId: null,
        status: "APPROVED",
        isAutomatic: true,
        ruleKey: decision.ruleKey,
      },
    });

    await tx.auditEvent.create({
      data: buildAuditEventData({
        actorUserId: null,
        entityType: "TimeEntry",
        entityId: entryId,
        action: "TIME_ENTRY_AUTO_APPROVED",
        after: {
          ruleKey: decision.ruleKey,
          appliedRules: decision.appliedRules,
        },
      }),
    });

    return true;
  });
}
