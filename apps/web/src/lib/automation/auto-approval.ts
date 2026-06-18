import { prisma } from "@jumpflow/database";
import {
  dailyTotalKey,
  evaluateAutoApproval,
  evaluateRuleAutoApproval,
  findDuplicateEntryIds,
  hoursToMinutes,
  withManualDecisionHistory,
  type AutoApprovalDecision,
  type AutoApprovalRule,
} from "@jumpflow/shared";

/** Regra "tudo desligado": usada no fallback 8h e no modo exclusivo para
 * consultores nao vinculados (gera NO_RULE_MATCH ⇒ PENDING). */
const OFF_RULE: AutoApprovalRule = {
  weekendEnabled: false,
  hoursRangeEnabled: false,
  minMinutes: 1,
  maxMinutes: 1439,
};
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

/** A single SUBMITTED entry paired with its (unapplied) rule decision. */
export interface EvaluatedEntry {
  id: string;
  consultantId: string;
  projectId: string;
  date: Date;
  hours: number;
  activityType: string;
  decision: AutoApprovalDecision;
}

/** Outcome of building context and evaluating every SUBMITTED entry. */
export interface AutoApprovalCollection {
  skipped: boolean;
  reason?: "no-database" | "disabled";
  evaluations: EvaluatedEntry[];
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
 * Build the auto-approval context and evaluate every SUBMITTED time entry —
 * WITHOUT applying anything. Returns one {@link EvaluatedEntry} per SUBMITTED
 * entry with its decision (APPROVE/PENDING + reasons + ruleKey).
 *
 * This is the single place that loads the engine context (daily totals,
 * duplicate groups, exception flags), so both the write path
 * ({@link runAutoApproval}) and read-only observability (the admin screen)
 * share identical rules and can never drift.
 *
 * Caller must guard with `isDatabaseConfigured()`; when no DB or the engine is
 * disabled, returns `{ skipped: true, evaluations: [] }`.
 */
export async function collectAutoApprovalDecisions(
  now: Date = new Date(),
): Promise<AutoApprovalCollection> {
  if (!isDatabaseConfigured()) {
    return { skipped: true, reason: "no-database", evaluations: [] };
  }

  const config = await loadAutomationConfig();
  if (!config.autoApprovalEnabled) {
    return { skipped: true, reason: "disabled", evaluations: [] };
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
  if (submitted.length === 0) return { skipped: false, evaluations: [] };

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

  // Regras de aprovacao automatica por projeto e por consultor.
  const [projectRuleRows, consultantRuleRows] = await Promise.all([
    prisma.projectAutoApprovalRule.findMany({
      where: { projectId: { in: projectIds } },
    }),
    prisma.consultantAutoApprovalRule.findMany({
      where: { projectId: { in: projectIds } },
    }),
  ]);
  const ruleShape = (r: {
    weekendEnabled: boolean;
    hoursRangeEnabled: boolean;
    minMinutes: number;
    maxMinutes: number;
  }): AutoApprovalRule => ({
    weekendEnabled: r.weekendEnabled,
    hoursRangeEnabled: r.hoursRangeEnabled,
    minMinutes: r.minMinutes,
    maxMinutes: r.maxMinutes,
  });
  const projectRuleByProject = new Map(
    projectRuleRows.map((r) => [r.projectId, ruleShape(r)]),
  );
  // A existencia de QUALQUER regra por consultor no projeto ativa o modo
  // exclusivo (a regra do projeto deixa de valer).
  const consultantRuleByPair = new Map<string, AutoApprovalRule>();
  const perConsultantModeProjects = new Set<string>();
  for (const r of consultantRuleRows) {
    consultantRuleByPair.set(`${r.consultantId}|${r.projectId}`, ruleShape(r));
    perConsultantModeProjects.add(r.projectId);
  }

  // Manual-decision history: any entry that already received a MANUAL approval
  // decision (Approval with isAutomatic = false) was handled by a human. If a
  // gestor reopened it to SUBMITTED, the engine must NOT auto-approve it again —
  // it stays for manual handling. We never auto-approve over a human decision.
  const submittedIds = submitted.map((e) => e.id);
  const manualApprovals = await prisma.approval.findMany({
    where: {
      entityType: "TIME_ENTRY",
      entityId: { in: submittedIds },
      isAutomatic: false,
    },
    select: { entityId: true },
  });
  const manualDecisionIds = new Set(manualApprovals.map((a) => a.entityId));

  const evaluations: EvaluatedEntry[] = submitted.map((entry) => {
    const entryContext = {
      status: entry.status,
      hours: Number(entry.hours),
      date: entry.date,
      submittedAt: entry.submittedAt,
      dailyTotalMinutes:
        dailyTotals.get(dailyTotalKey(entry.consultantId, entry.date)) ?? 0,
      hasDuplicate: duplicateIds.has(entry.id),
    };

    // Hierarquia: (1) modo exclusivo por consultor → regra do consultor, ou
    // PENDING se nao vinculado; (2) regra do projeto; (3) fallback 8h/dia
    // quando o projeto nao tem nenhuma configuracao.
    let baseDecision: AutoApprovalDecision;
    if (perConsultantModeProjects.has(entry.projectId)) {
      const rule =
        consultantRuleByPair.get(`${entry.consultantId}|${entry.projectId}`) ??
        OFF_RULE;
      baseDecision = evaluateRuleAutoApproval(
        entryContext,
        rule,
        config.settings,
        now,
      );
    } else {
      const projectRule = projectRuleByProject.get(entry.projectId);
      baseDecision = projectRule
        ? evaluateRuleAutoApproval(entryContext, projectRule, config.settings, now)
        : evaluateAutoApproval(
            entryContext,
            { allowAnyHours: false, allowWeekend: false },
            config.settings,
            now,
          );
    }

    // A human already decided this entry once; force PENDING with a clear,
    // structured reason that surfaces in the admin read-only view.
    const decision = manualDecisionIds.has(entry.id)
      ? withManualDecisionHistory(baseDecision)
      : baseDecision;

    return {
      id: entry.id,
      consultantId: entry.consultantId,
      projectId: entry.projectId,
      date: entry.date,
      hours: Number(entry.hours),
      activityType: entry.activityType,
      decision,
    };
  });

  return { skipped: false, evaluations };
}

/**
 * Process all SUBMITTED time entries against the auto-approval rules.
 *
 * Idempotent: only SUBMITTED entries are eligible and the approval is applied
 * via a conditional `updateMany(where status=SUBMITTED)` inside a transaction,
 * so a second run (or a concurrent cron) cannot double-approve. The AuditEvent
 * is written in the SAME transaction as the status change and the Approval, so
 * the audit trail can never silently diverge from the approval.
 *
 * Context-building and rule evaluation are delegated to
 * {@link collectAutoApprovalDecisions} (shared with the read-only admin view);
 * this function only APPLIES the resulting APPROVE decisions.
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

  const collection = await collectAutoApprovalDecisions(now);
  if (collection.skipped) {
    return { ...base, skipped: true, reason: collection.reason };
  }

  const result = { ...base };
  for (const item of collection.evaluations) {
    result.processed += 1;

    if (item.decision.outcome !== "APPROVE") {
      result.pending += 1;
      continue;
    }

    const applied = await approveEntry(item.id, item.decision);
    if (applied) {
      result.approved += 1;
      result.ruleCounts[item.decision.ruleKey] =
        (result.ruleCounts[item.decision.ruleKey] ?? 0) + 1;
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
