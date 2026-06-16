import { prisma } from "@jumpflow/database";
import type { AutoApprovalReason } from "@jumpflow/shared";
import { collectAutoApprovalDecisions } from "@/lib/automation/auto-approval";
import { loadAutomationConfig } from "@/lib/automation/config";
import { activityLabelOf } from "@/lib/timesheet/types";

/**
 * Read-only query layer for the auto-approval admin screen
 * (`/app/automacoes/aprovacao-automatica`). Assumes a database is configured —
 * callers must guard with `isDatabaseConfigured()` first.
 *
 * NOTE: this NEVER mutates. The estimated reasons for SUBMITTED entries reuse
 * the SAME pure evaluator + context builder as the job
 * (`collectAutoApprovalDecisions`), so the observability view and the actual
 * run can never drift. When the engine is disabled the builder short-circuits
 * (skipped) and there are simply no estimated reasons.
 */

/** pt-BR labels for the pending reasons surfaced to administrators. */
export const reasonLabels: Record<AutoApprovalReason, string> = {
  ENTRY_NOT_SUBMITTED: "Lançamento não está enviado",
  NOT_SUBMITTED_YET: "Sem data de envio",
  INVALID_HOURS: "Horas inválidas",
  DELAY_NOT_ELAPSED: "Aguardando intervalo mínimo após o envio",
  DUPLICATE: "Lançamento duplicado",
  WEEKEND_NOT_ALLOWED: "Fim de semana não liberado",
  DAILY_TOTAL_MISMATCH: "Total diário diferente do esperado",
  MANUAL_DECISION_HISTORY: "Já teve decisão manual (aprovação reservada ao gestor)",
};

/** Readable pt-BR label for a reason code (falls back to the raw code). */
export function reasonLabelOf(reason: string): string {
  return (reasonLabels as Record<string, string>)[reason] ?? reason;
}

const exceptionTypeLabels: Record<string, string> = {
  ANY_HOURS: "Qualquer carga horária",
  WEEKEND: "Fim de semana",
};

/** Readable pt-BR label for an exception type (falls back to the raw value). */
export function exceptionTypeLabelOf(type: string): string {
  return exceptionTypeLabels[type] ?? type;
}

export interface AutoApprovalConfigView {
  autoApprovalEnabled: boolean;
  requiredDailyMinutes: number;
  approvalDelayMinutes: number;
}

export interface AutoApprovalExceptionView {
  id: string;
  consultantName: string;
  projectName: string;
  type: string;
  active: boolean;
}

export interface RecentAutoApprovalView {
  entityId: string;
  ruleKey: string | null;
  createdAt: Date;
  consultantName: string | null;
  projectName: string | null;
}

export interface PendingEntryView {
  entryId: string;
  consultantName: string;
  projectName: string;
  date: Date;
  hours: number;
  activity: string;
  reasons: string[];
}

export interface ExceptionConsultantOption {
  id: string;
  name: string;
}

export interface ExceptionProjectOption {
  id: string;
  name: string;
  clientName: string;
}

export interface AutoApprovalOverview {
  config: AutoApprovalConfigView;
  activeExceptionsCount: number;
  exceptions: AutoApprovalExceptionView[];
  recentAutoApprovals: RecentAutoApprovalView[];
  pending: PendingEntryView[];
  /** Options for the "Nova exceção" form. */
  consultantOptions: ExceptionConsultantOption[];
  projectOptions: ExceptionProjectOption[];
}

const RECENT_LIMIT = 20;

/**
 * Aggregate everything the admin screen shows: effective config, active
 * exceptions, the latest automatic approvals and the SUBMITTED entries that are
 * still pending (with the engine's estimated reasons).
 */
export async function getAutoApprovalOverview(
  now: Date = new Date(),
): Promise<AutoApprovalOverview> {
  const [config, activeExceptionsCount, exceptionRows, consultantRows, projectRows] =
    await Promise.all([
      loadAutomationConfig(),
      prisma.autoApprovalException.count({ where: { active: true } }),
      prisma.autoApprovalException.findMany({
        orderBy: { updatedAt: "desc" },
        take: 50,
        select: {
          id: true,
          type: true,
          active: true,
          consultant: { select: { name: true } },
          project: { select: { name: true } },
        },
      }),
      prisma.consultant.findMany({
        orderBy: { name: "asc" },
        select: { id: true, name: true },
      }),
      prisma.project.findMany({
        where: { status: { not: "CLOSED" } },
        orderBy: { name: "asc" },
        select: { id: true, name: true, client: { select: { name: true } } },
      }),
    ]);

  const exceptions: AutoApprovalExceptionView[] = exceptionRows.map((e) => ({
    id: e.id,
    consultantName: e.consultant.name,
    projectName: e.project.name,
    type: e.type,
    active: e.active,
  }));

  // Latest automatic approvals for time entries. Join back to the entry to
  // surface consultant/project for context (the Approval row only stores ids).
  const approvalRows = await prisma.approval.findMany({
    where: { entityType: "TIME_ENTRY", isAutomatic: true },
    orderBy: { createdAt: "desc" },
    take: RECENT_LIMIT,
    select: { entityId: true, ruleKey: true, createdAt: true },
  });

  const approvalEntryIds = approvalRows.map((a) => a.entityId);
  const approvedEntries = approvalEntryIds.length
    ? await prisma.timeEntry.findMany({
        where: { id: { in: approvalEntryIds } },
        select: {
          id: true,
          consultant: { select: { name: true } },
          project: { select: { name: true } },
        },
      })
    : [];
  const entryById = new Map(approvedEntries.map((e) => [e.id, e]));

  const recentAutoApprovals: RecentAutoApprovalView[] = approvalRows.map((a) => {
    const entry = entryById.get(a.entityId);
    return {
      entityId: a.entityId,
      ruleKey: a.ruleKey,
      createdAt: a.createdAt,
      consultantName: entry?.consultant.name ?? null,
      projectName: entry?.project.name ?? null,
    };
  });

  // Pending SUBMITTED entries with engine-estimated reasons (read-only: nothing
  // is applied). Reuses the SAME context builder as the job.
  const collection = await collectAutoApprovalDecisions(now);
  const pendingEvaluations = collection.evaluations.filter(
    (e) => e.decision.outcome !== "APPROVE",
  );

  const pendingIds = pendingEvaluations.map((e) => e.id);
  const pendingEntries = pendingIds.length
    ? await prisma.timeEntry.findMany({
        where: { id: { in: pendingIds } },
        select: {
          id: true,
          consultant: { select: { name: true } },
          project: { select: { name: true } },
        },
      })
    : [];
  const pendingMeta = new Map(pendingEntries.map((e) => [e.id, e]));

  const pending: PendingEntryView[] = pendingEvaluations.map((e) => {
    const meta = pendingMeta.get(e.id);
    return {
      entryId: e.id,
      consultantName: meta?.consultant.name ?? "—",
      projectName: meta?.project.name ?? "—",
      date: e.date,
      hours: e.hours,
      activity: activityLabelOf(e.activityType),
      reasons: e.decision.reasons.map(reasonLabelOf),
    };
  });

  return {
    config: {
      autoApprovalEnabled: config.autoApprovalEnabled,
      requiredDailyMinutes: config.settings.requiredDailyMinutes,
      approvalDelayMinutes: config.settings.approvalDelayMinutes,
    },
    activeExceptionsCount,
    exceptions,
    recentAutoApprovals,
    pending,
    consultantOptions: consultantRows.map((c) => ({ id: c.id, name: c.name })),
    projectOptions: projectRows.map((p) => ({
      id: p.id,
      name: p.name,
      clientName: p.client.name,
    })),
  };
}
