/**
 * Pure auto-approval rule engine for time entries.
 *
 * No I/O, no Prisma, no Next — only deterministic functions so the rules are
 * trivially unit-testable and migrate intact to a future worker. The DB layer
 * (apps/web/src/lib/automation) is responsible for loading context (daily
 * totals, duplicates, exception flags) and applying the decisions.
 *
 * Internal unit is MINUTES. `TimeEntry.hours` is a Decimal of HOURS, so the
 * caller converts with `hoursToMinutes` at the boundary.
 */

/** Tunables, loaded from AutomationConfig (with code defaults). */
export interface AutoApprovalSettings {
  /** Minimum minutes that must elapse after submission before approving. */
  approvalDelayMinutes: number;
  /** Required total minutes per consultant per day for the default rule. */
  requiredDailyMinutes: number;
  /** Sanity cap: a single entry above this many hours is never auto-approved. */
  maxEntryHours: number;
}

export const DEFAULT_AUTO_APPROVAL_SETTINGS: AutoApprovalSettings = {
  approvalDelayMinutes: 5,
  requiredDailyMinutes: 480,
  maxEntryHours: 24,
};

/** Exception flags for the (consultant, project) of the entry being evaluated. */
export interface AutoApprovalFlags {
  /** ANY_HOURS exception: skip the daily 8h total check. */
  allowAnyHours: boolean;
  /** WEEKEND exception: allow Saturday/Sunday entries. */
  allowWeekend: boolean;
}

/** Everything the evaluator needs about a single entry, pre-computed by the job. */
export interface AutoApprovalEntryContext {
  /** Current TimeEntry status; only SUBMITTED is eligible. */
  status: string;
  /** Entry hours (Decimal value converted to number). */
  hours: number;
  /** Work date of the entry. */
  date: Date;
  /** Submission anchor for the delay check (null when never submitted). */
  submittedAt: Date | null;
  /**
   * Total minutes for this consultant on this date, summed over entries with
   * status SUBMITTED or APPROVED (so re-runs still reach 480 once part of the
   * day was already approved).
   */
  dailyTotalMinutes: number;
  /** Whether this entry belongs to a duplicate group (same key, count > 1). */
  hasDuplicate: boolean;
}

export type AutoApprovalReason =
  | "ENTRY_NOT_SUBMITTED"
  | "NOT_SUBMITTED_YET"
  | "INVALID_HOURS"
  | "DELAY_NOT_ELAPSED"
  | "DUPLICATE"
  | "WEEKEND_NOT_ALLOWED"
  | "DAILY_TOTAL_MISMATCH"
  /**
   * The entry already had a MANUAL approval decision (an Approval with
   * isAutomatic = false). It was reopened/changed by a human, so the engine
   * must never auto-approve it again — it stays for manual handling. Detected
   * by the DB layer and injected via {@link withManualDecisionHistory}, because
   * the pure evaluator has no access to approval history.
   */
  | "MANUAL_DECISION_HISTORY";

/** Canonical order so a reasons array is deterministic for equality tests. */
const REASON_ORDER: AutoApprovalReason[] = [
  "ENTRY_NOT_SUBMITTED",
  "NOT_SUBMITTED_YET",
  "INVALID_HOURS",
  "DELAY_NOT_ELAPSED",
  "DUPLICATE",
  "WEEKEND_NOT_ALLOWED",
  "DAILY_TOTAL_MISMATCH",
  "MANUAL_DECISION_HISTORY",
];

export interface AutoApprovalDecision {
  outcome: "APPROVE" | "PENDING";
  /** Why it stayed pending (empty when APPROVE), in canonical order. */
  reasons: AutoApprovalReason[];
  /** Rules that shaped the decision, e.g. ["DEFAULT"] or ["EXCEPTION_ANY_HOURS","EXCEPTION_WEEKEND"]. */
  appliedRules: string[];
  /** Stable join of appliedRules for audit/reporting. */
  ruleKey: string;
}

export function hoursToMinutes(hours: number): number {
  return Math.round(hours * 60);
}

const MS_PER_MINUTE = 60_000;

/** Saturday (6) or Sunday (0) in the entry's own day-of-week. */
export function isWeekend(date: Date): boolean {
  const day = date.getUTCDay();
  return day === 0 || day === 6;
}

/**
 * Evaluate one time entry against the auto-approval rules. Accumulates ALL
 * failing reasons (never early-returns) so the audit trail explains exactly why
 * an entry stayed pending. Fail-closed: any reason ⇒ PENDING (manual approval).
 */
export function evaluateAutoApproval(
  entry: AutoApprovalEntryContext,
  flags: AutoApprovalFlags,
  settings: AutoApprovalSettings,
  now: Date,
): AutoApprovalDecision {
  const reasons = new Set<AutoApprovalReason>();
  const minutes = hoursToMinutes(entry.hours);
  const weekend = isWeekend(entry.date);

  // Scope / sanity (never auto-approve out-of-scope data).
  if (entry.status !== "SUBMITTED") reasons.add("ENTRY_NOT_SUBMITTED");
  if (entry.submittedAt === null) reasons.add("NOT_SUBMITTED_YET");
  if (minutes <= 0 || entry.hours > settings.maxEntryHours) {
    reasons.add("INVALID_HOURS");
  }

  // Delay: at least approvalDelayMinutes since submission.
  if (entry.submittedAt !== null) {
    const minutesSince =
      (now.getTime() - entry.submittedAt.getTime()) / MS_PER_MINUTE;
    if (minutesSince < settings.approvalDelayMinutes) {
      reasons.add("DELAY_NOT_ELAPSED");
    }
  }

  // Duplicate group ⇒ none of the duplicates is auto-approved.
  if (entry.hasDuplicate) reasons.add("DUPLICATE");

  // Weekend only allowed with the WEEKEND exception.
  if (weekend && !flags.allowWeekend) reasons.add("WEEKEND_NOT_ALLOWED");

  // Daily total: required unless the entry is an ANY_HOURS exception or a
  // permitted weekend entry. Intentionally an EXACT match (not >=): the default
  // rule is "a standard 8h day". Tolerance is a documented future option.
  const skipDailyTotal = flags.allowAnyHours || (weekend && flags.allowWeekend);
  if (
    !skipDailyTotal &&
    entry.dailyTotalMinutes !== settings.requiredDailyMinutes
  ) {
    reasons.add("DAILY_TOTAL_MISMATCH");
  }

  const appliedRules: string[] = [];
  if (flags.allowAnyHours) appliedRules.push("EXCEPTION_ANY_HOURS");
  if (weekend && flags.allowWeekend) appliedRules.push("EXCEPTION_WEEKEND");
  if (appliedRules.length === 0) appliedRules.push("DEFAULT");

  const ordered = REASON_ORDER.filter((r) => reasons.has(r));

  return {
    outcome: ordered.length === 0 ? "APPROVE" : "PENDING",
    reasons: ordered,
    appliedRules,
    ruleKey: appliedRules.join("+"),
  };
}

/**
 * Force a decision to PENDING because the entry already had a MANUAL approval
 * decision in its history (reopened/changed by a human). The original applied
 * rules are preserved and the MANUAL_DECISION_HISTORY reason is merged in
 * (deduplicated, canonical order) so the admin read-only view explains exactly
 * why the engine declined. Idempotent: re-applying does not duplicate the
 * reason. The DB layer calls this after detecting non-automatic Approvals; the
 * pure evaluator has no access to approval history.
 */
export function withManualDecisionHistory(
  decision: AutoApprovalDecision,
): AutoApprovalDecision {
  const reasons = new Set<AutoApprovalReason>(decision.reasons);
  reasons.add("MANUAL_DECISION_HISTORY");
  return {
    ...decision,
    outcome: "PENDING",
    reasons: REASON_ORDER.filter((r) => reasons.has(r)),
  };
}

/** Stable string key used to detect duplicate entries. */
export interface DuplicateKeyParts {
  consultantId: string;
  projectId: string;
  /** Work date; only the calendar day matters. */
  date: Date;
  activityType: string;
}

export function duplicateKey(parts: DuplicateKeyParts): string {
  const day = parts.date.toISOString().slice(0, 10);
  return `${parts.consultantId}|${parts.projectId}|${day}|${parts.activityType}`;
}

/**
 * Return the set of entry ids that belong to a duplicate group (same
 * duplicateKey appearing more than once). All members of a group are flagged —
 * deduplication needs human judgement, so none is auto-approved.
 */
export function findDuplicateEntryIds(
  entries: ReadonlyArray<{ id: string } & DuplicateKeyParts>,
): Set<string> {
  const byKey = new Map<string, string[]>();
  for (const e of entries) {
    const key = duplicateKey(e);
    const list = byKey.get(key);
    if (list) list.push(e.id);
    else byKey.set(key, [e.id]);
  }
  const dups = new Set<string>();
  for (const ids of byKey.values()) {
    if (ids.length > 1) for (const id of ids) dups.add(id);
  }
  return dups;
}

/** Key used to sum daily totals per consultant per calendar day. */
export function dailyTotalKey(consultantId: string, date: Date): string {
  return `${consultantId}|${date.toISOString().slice(0, 10)}`;
}
