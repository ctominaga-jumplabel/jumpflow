"use server";

import { revalidatePath } from "next/cache";
import { prisma, Prisma } from "@jumpflow/database";
import type { ZodType } from "zod";
import { isDevAuthEnabled } from "@/lib/auth/dev";
import { requireRole, requireUser } from "@/lib/auth/guards";
import type { AppUser } from "@/lib/auth/types";
import { buildAuditEventData } from "@/lib/db/audit";
import { isDatabaseConfigured } from "@/lib/db/config";
import {
  findActiveAllocation,
  getConsultantForUser,
  recomputePeriodStatus,
} from "@/lib/db/timesheet";
import { resolveDbUser } from "@/lib/db/users";
import {
  COMMENT_REQUIRED_MESSAGE,
  decideHoursSchema,
  deleteTimeEntryInputSchema,
  timeEntryInputSchema,
  updateTimeEntryInputSchema,
  weekActionInputSchema,
  type DecideHoursInput,
  type DeleteTimeEntryInput,
  type TimeEntryInput,
  type UpdateTimeEntryInput,
  type WeekActionInput,
} from "@/lib/timesheet/schemas";
import type { ActionResult, ErrorCode } from "@/lib/timesheet/types";
import {
  addDays,
  parseIsoDateUtc,
  weekStartOf,
} from "@/lib/timesheet/week";

/**
 * Server actions for the Horas module (docs/horas-persistencia.md).
 *
 * Every action returns an ActionResult (never throws to the client) and
 * revalidates the affected route. Status transitions follow section 4 of the
 * spec; decisions replicate the transactional pattern of the auto-approval
 * engine (conditional updateMany + Approval + AuditEvent in one transaction).
 */

const HORAS_PATH = "/app/horas";
const APROVACOES_PATH = "/app/aprovacoes";

/** Internal typed failure; converted to ActionResult at the boundary. */
class ActionError extends Error {
  constructor(
    readonly code: ErrorCode,
    message: string,
  ) {
    super(message);
  }
}

function ensureDatabase(): void {
  if (!isDatabaseConfigured()) {
    throw new ActionError("NO_DATABASE", "Banco de dados não configurado.");
  }
}

async function requireConsultant(user: AppUser) {
  const consultant = await getConsultantForUser(user);
  if (!consultant) {
    throw new ActionError(
      "NO_CONSULTANT",
      "Seu usuário não está vinculado a um consultor. Contate um administrador.",
    );
  }
  return consultant;
}

function parseInput<T>(schema: ZodType<T>, input: unknown): T {
  const result = schema.safeParse(input);
  if (!result.success) {
    const issue = result.error.issues[0];
    const message = issue?.message ?? "Dados inválidos.";
    throw new ActionError(
      message === COMMENT_REQUIRED_MESSAGE ? "COMMENT_REQUIRED" : "INVALID_INPUT",
      message,
    );
  }
  return result.data;
}

/** Convert any thrown error into a safe ActionResult failure. */
function toFailure(error: unknown): ActionResult<never> {
  // Never swallow framework control-flow errors (redirect/notFound).
  if (
    typeof error === "object" &&
    error !== null &&
    "digest" in error &&
    typeof (error as { digest?: unknown }).digest === "string" &&
    ((error as { digest: string }).digest.startsWith("NEXT_") ||
      (error as { digest: string }).digest.startsWith("NEXT_REDIRECT"))
  ) {
    throw error;
  }
  if (error instanceof ActionError) {
    return { ok: false, error: error.code, message: error.message };
  }
  console.error("[horas] unexpected action error", error);
  return {
    ok: false,
    error: "UNEXPECTED",
    message: "Erro inesperado. Tente novamente.",
  };
}

type Db = Prisma.TransactionClient | typeof prisma;

/**
 * Upsert the weekly TimesheetPeriod for the week containing `date`.
 * A CLOSED period blocks every mutation in that week.
 */
async function upsertOpenPeriod(tx: Db, consultantId: string, date: Date) {
  const startDate = weekStartOf(date);
  const endDate = addDays(startDate, 6);
  const where = {
    consultantId_startDate_endDate: { consultantId, startDate, endDate },
  };
  const existing = await tx.timesheetPeriod.findUnique({ where });
  if (existing?.status === "CLOSED") {
    throw new ActionError(
      "PERIOD_CLOSED",
      "Esta semana já foi fechada e não aceita alterações.",
    );
  }
  if (existing) return existing;
  return tx.timesheetPeriod.upsert({
    where,
    update: {},
    create: { consultantId, startDate, endDate, status: "DRAFT" },
  });
}

async function ensureActiveAllocation(
  db: Db,
  consultantId: string,
  projectId: string,
  date: Date,
) {
  const allocation = await findActiveAllocation(db, consultantId, projectId, date);
  if (!allocation) {
    throw new ActionError(
      "NO_ACTIVE_ALLOCATION",
      "Você não possui alocação ativa neste projeto para a data informada.",
    );
  }
  return allocation;
}

export async function createTimeEntry(
  input: TimeEntryInput,
): Promise<ActionResult<{ id: string }>> {
  try {
    ensureDatabase();
    const user = await requireUser();
    const consultant = await requireConsultant(user);
    const parsed = parseInput(timeEntryInputSchema, input);
    // Schema guarantees a valid date; always midnight UTC (date-only).
    const date = parseIsoDateUtc(parsed.date)!;

    const project = await prisma.project.findUnique({
      where: { id: parsed.projectId },
    });
    if (!project) {
      throw new ActionError("NOT_FOUND", "Projeto não encontrado.");
    }
    if (project.status === "CLOSED") {
      throw new ActionError(
        "PROJECT_CLOSED",
        "Projeto encerrado não recebe lançamentos.",
      );
    }
    const allocation = await ensureActiveAllocation(
      prisma,
      consultant.id,
      project.id,
      date,
    );

    const description = parsed.description?.trim() || null;
    const entry = await prisma.$transaction(async (tx) => {
      const period = await upsertOpenPeriod(tx, consultant.id, date);
      const existing = await tx.timeEntry.findFirst({
        where: {
          consultantId: consultant.id,
          projectId: project.id,
          activityType: parsed.activityType,
          date,
        },
      });
      if (existing) {
        if (existing.status !== "DRAFT" && existing.status !== "REJECTED") {
          // SUBMITTED/APPROVED/CLOSED: a second entry with the same key would
          // be flagged as duplicate by the auto-approval engine.
          throw new ActionError(
            "DUPLICATE_ENTRY",
            "Já existe um lançamento enviado ou aprovado para este projeto, atividade e dia.",
          );
        }
        // Merge semantics (same as the demo grid): editing the cell replaces
        // hours and returns the entry to DRAFT.
        const updated = await tx.timeEntry.update({
          where: { id: existing.id },
          data: {
            hours: parsed.hours,
            description,
            billable: parsed.billable,
            status: "DRAFT",
            submittedAt: null,
            allocationId: allocation.id,
            periodId: period.id,
          },
        });
        await recomputePeriodStatus(tx, period.id);
        return updated;
      }

      const created = await tx.timeEntry.create({
        data: {
          periodId: period.id,
          consultantId: consultant.id,
          projectId: project.id,
          allocationId: allocation.id,
          date,
          hours: parsed.hours,
          activityType: parsed.activityType,
          description,
          billable: parsed.billable,
          status: "DRAFT",
          submittedAt: null,
        },
      });
      await recomputePeriodStatus(tx, period.id);
      return created;
    });

    revalidatePath(HORAS_PATH);
    return { ok: true, data: { id: entry.id } };
  } catch (error) {
    return toFailure(error);
  }
}

export async function updateTimeEntry(
  input: UpdateTimeEntryInput,
): Promise<ActionResult<{ id: string }>> {
  try {
    ensureDatabase();
    const user = await requireUser();
    const consultant = await requireConsultant(user);
    const parsed = parseInput(updateTimeEntryInputSchema, input);

    const entry = await prisma.timeEntry.findUnique({
      where: { id: parsed.id },
      include: { period: true },
    });
    if (!entry) {
      throw new ActionError("NOT_FOUND", "Lançamento não encontrado.");
    }
    if (entry.consultantId !== consultant.id) {
      throw new ActionError(
        "FORBIDDEN",
        "Você só pode alterar os seus próprios lançamentos.",
      );
    }
    if (entry.period.status === "CLOSED") {
      throw new ActionError(
        "PERIOD_CLOSED",
        "Esta semana já foi fechada e não aceita alterações.",
      );
    }
    if (entry.status !== "DRAFT" && entry.status !== "REJECTED") {
      throw new ActionError(
        "NOT_EDITABLE",
        "Lançamento enviado, aprovado ou fechado não pode ser alterado.",
      );
    }

    let date = entry.date;
    let allocationId = entry.allocationId;
    const newDate = parsed.date ? parseIsoDateUtc(parsed.date)! : null;
    if (newDate && newDate.getTime() !== entry.date.getTime()) {
      // A date change must stay inside the same weekly period.
      if (weekStartOf(newDate).getTime() !== entry.period.startDate.getTime()) {
        throw new ActionError(
          "INVALID_INPUT",
          "A nova data precisa estar na mesma semana do lançamento.",
        );
      }
      const allocation = await ensureActiveAllocation(
        prisma,
        consultant.id,
        entry.projectId,
        newDate,
      );
      const duplicate = await prisma.timeEntry.findFirst({
        where: {
          consultantId: consultant.id,
          projectId: entry.projectId,
          activityType: entry.activityType,
          date: newDate,
          id: { not: entry.id },
        },
      });
      if (duplicate) {
        throw new ActionError(
          "DUPLICATE_ENTRY",
          "Já existe um lançamento para este projeto, atividade e dia.",
        );
      }
      date = newDate;
      allocationId = allocation.id;
    }

    await prisma.$transaction(async (tx) => {
      await tx.timeEntry.update({
        where: { id: entry.id },
        data: {
          hours: parsed.hours,
          description: parsed.description?.trim() || null,
          billable: parsed.billable,
          date,
          allocationId,
          // Editing a REJECTED entry returns it to DRAFT for resubmission.
          status: "DRAFT",
          submittedAt: null,
        },
      });
      await recomputePeriodStatus(tx, entry.periodId);
    });

    revalidatePath(HORAS_PATH);
    return { ok: true, data: { id: entry.id } };
  } catch (error) {
    return toFailure(error);
  }
}

export async function deleteTimeEntry(
  input: DeleteTimeEntryInput,
): Promise<ActionResult<{ id: string }>> {
  try {
    ensureDatabase();
    const user = await requireUser();
    const consultant = await requireConsultant(user);
    const parsed = parseInput(deleteTimeEntryInputSchema, input);

    const entry = await prisma.timeEntry.findUnique({
      where: { id: parsed.id },
      include: { period: true },
    });
    if (!entry) {
      throw new ActionError("NOT_FOUND", "Lançamento não encontrado.");
    }
    if (entry.consultantId !== consultant.id) {
      throw new ActionError(
        "FORBIDDEN",
        "Você só pode excluir os seus próprios lançamentos.",
      );
    }
    if (entry.period.status === "CLOSED") {
      throw new ActionError(
        "PERIOD_CLOSED",
        "Esta semana já foi fechada e não aceita alterações.",
      );
    }
    if (entry.status !== "DRAFT" && entry.status !== "REJECTED") {
      throw new ActionError(
        "NOT_EDITABLE",
        "Apenas rascunhos ou lançamentos reprovados podem ser excluídos.",
      );
    }

    await prisma.$transaction(async (tx) => {
      await tx.timeEntry.delete({ where: { id: entry.id } });
      await recomputePeriodStatus(tx, entry.periodId);
    });

    revalidatePath(HORAS_PATH);
    return { ok: true, data: { id: entry.id } };
  } catch (error) {
    return toFailure(error);
  }
}

export interface CopyWeekResult {
  copied: number;
  skippedExisting: number;
  skippedIneligible: number;
}

export async function copyPreviousWeek(
  input: WeekActionInput,
): Promise<ActionResult<CopyWeekResult>> {
  try {
    ensureDatabase();
    const user = await requireUser();
    const consultant = await requireConsultant(user);
    const parsed = parseInput(weekActionInputSchema, input);
    const destStart = weekStartOf(parseIsoDateUtc(parsed.weekStart)!);
    const destEnd = addDays(destStart, 6);
    const sourceStart = addDays(destStart, -7);
    const sourceEnd = addDays(destStart, -1);

    const sourceEntries = await prisma.timeEntry.findMany({
      where: {
        consultantId: consultant.id,
        date: { gte: sourceStart, lte: sourceEnd },
      },
      include: { project: { select: { status: true } } },
    });
    // Eligible at the source: not REJECTED and with hours (isRowCopyable).
    // APPROVED entries copy as fresh editable DRAFTs.
    const eligible = sourceEntries.filter(
      (entry) => entry.status !== "REJECTED" && Number(entry.hours) > 0,
    );
    if (eligible.length === 0) {
      // Even with nothing to copy, a CLOSED destination week must answer
      // PERIOD_CLOSED — not a silent zero-result success.
      const destPeriod = await prisma.timesheetPeriod.findUnique({
        where: {
          consultantId_startDate_endDate: {
            consultantId: consultant.id,
            startDate: destStart,
            endDate: destEnd,
          },
        },
      });
      if (destPeriod?.status === "CLOSED") {
        throw new ActionError(
          "PERIOD_CLOSED",
          "Esta semana já foi fechada e não aceita alterações.",
        );
      }
      return {
        ok: true,
        data: { copied: 0, skippedExisting: 0, skippedIneligible: 0 },
      };
    }

    const result = await prisma.$transaction(async (tx) => {
      const period = await upsertOpenPeriod(tx, consultant.id, destStart);
      const destEntries = await tx.timeEntry.findMany({
        where: {
          consultantId: consultant.id,
          date: { gte: destStart, lte: destEnd },
        },
        select: { projectId: true, activityType: true, date: true },
      });
      const taken = new Set(
        destEntries.map(
          (e) => `${e.projectId}|${e.activityType}|${e.date.getTime()}`,
        ),
      );

      const counts: CopyWeekResult = {
        copied: 0,
        skippedExisting: 0,
        skippedIneligible: 0,
      };
      for (const entry of eligible) {
        const destDate = addDays(entry.date, 7);
        const key = `${entry.projectId}|${entry.activityType}|${destDate.getTime()}`;
        // Idempotent: skip when the destination key exists in ANY status.
        if (taken.has(key)) {
          counts.skippedExisting += 1;
          continue;
        }
        if (entry.project.status === "CLOSED") {
          counts.skippedIneligible += 1;
          continue;
        }
        const allocation = await findActiveAllocation(
          tx,
          consultant.id,
          entry.projectId,
          destDate,
        );
        if (!allocation) {
          counts.skippedIneligible += 1;
          continue;
        }
        await tx.timeEntry.create({
          data: {
            periodId: period.id,
            consultantId: consultant.id,
            projectId: entry.projectId,
            allocationId: allocation.id,
            date: destDate,
            hours: entry.hours,
            activityType: entry.activityType,
            description: entry.description,
            billable: entry.billable,
            status: "DRAFT",
            submittedAt: null,
          },
        });
        taken.add(key);
        counts.copied += 1;
      }
      if (counts.copied > 0) await recomputePeriodStatus(tx, period.id);
      return counts;
    });

    revalidatePath(HORAS_PATH);
    return { ok: true, data: result };
  } catch (error) {
    return toFailure(error);
  }
}

export async function submitWeek(
  input: WeekActionInput,
): Promise<ActionResult<{ submitted: number }>> {
  try {
    ensureDatabase();
    const user = await requireUser();
    const consultant = await requireConsultant(user);
    const parsed = parseInput(weekActionInputSchema, input);
    const startDate = weekStartOf(parseIsoDateUtc(parsed.weekStart)!);
    const endDate = addDays(startDate, 6);

    const period = await prisma.timesheetPeriod.findUnique({
      where: {
        consultantId_startDate_endDate: {
          consultantId: consultant.id,
          startDate,
          endDate,
        },
      },
    });
    if (!period) {
      throw new ActionError(
        "NOTHING_TO_SUBMIT",
        "Nenhum lançamento em rascunho para enviar.",
      );
    }
    if (period.status === "CLOSED") {
      throw new ActionError(
        "PERIOD_CLOSED",
        "Esta semana já foi fechada e não aceita alterações.",
      );
    }

    const dbUser = await resolveDbUser(user);
    const submitted = await prisma.$transaction(async (tx) => {
      const drafts = await tx.timeEntry.findMany({
        where: { periodId: period.id, status: "DRAFT" },
        select: { id: true, hours: true },
      });
      const now = new Date();
      // submittedAt is REQUIRED by the auto-approval engine: without it the
      // cron's delay rule never elapses and nothing is ever approved.
      const updated = await tx.timeEntry.updateMany({
        where: { periodId: period.id, status: "DRAFT" },
        data: { status: "SUBMITTED", submittedAt: now },
      });
      if (updated.count === 0) {
        throw new ActionError(
          "NOTHING_TO_SUBMIT",
          "Nenhum lançamento em rascunho para enviar.",
        );
      }
      await tx.timesheetPeriod.update({
        where: { id: period.id },
        data: { status: "SUBMITTED", submittedAt: now },
      });
      // Leftover REJECTED entries keep the period flagged for rework.
      await recomputePeriodStatus(tx, period.id);

      const total = drafts.reduce((sum, d) => sum + Number(d.hours), 0);
      await tx.auditEvent.create({
        data: buildAuditEventData({
          actorUserId: dbUser?.id ?? null,
          entityType: "TimesheetPeriod",
          entityId: period.id,
          action: "TIMESHEET_PERIOD_SUBMITTED",
          after: { entryIds: drafts.map((d) => d.id), total },
        }),
      });
      return updated.count;
    });

    revalidatePath(HORAS_PATH);
    revalidatePath(APROVACOES_PATH);
    return { ok: true, data: { submitted } };
  } catch (error) {
    return toFailure(error);
  }
}

export interface DecideHoursResult {
  decided: number;
  alreadyDecided: number;
}

export async function decideHours(
  input: DecideHoursInput,
): Promise<ActionResult<DecideHoursResult>> {
  try {
    ensureDatabase();
    const user = await requireRole([
      "ADMIN",
      "AREA_MANAGER",
      "PROJECT_MANAGER",
    ]);
    const parsed = parseInput(decideHoursSchema, input);

    // FK columns (approverUserId/actorUserId) need the REAL db user id — the
    // dev session id ("dev-user") does not exist in the database.
    const dbUser = await resolveDbUser(user);
    if (!dbUser) {
      throw new ActionError(
        "FORBIDDEN",
        "Usuário não encontrado no banco de dados.",
      );
    }

    const entries = await prisma.timeEntry.findMany({
      where: { id: { in: parsed.entryIds } },
      include: {
        project: { select: { managerUserId: true } },
        consultant: { select: { userId: true, email: true } },
      },
    });
    if (entries.length === 0) {
      throw new ActionError("NOT_FOUND", "Nenhum lançamento encontrado.");
    }

    // PROJECT_MANAGER decides only entries of projects they manage;
    // ADMIN/AREA_MANAGER are unrestricted.
    const restricted =
      !user.roles.includes("ADMIN") && !user.roles.includes("AREA_MANAGER");
    if (
      restricted &&
      entries.some((entry) => entry.project.managerUserId !== dbUser.id)
    ) {
      throw new ActionError(
        "FORBIDDEN",
        "Você só pode decidir lançamentos de projetos que gerencia.",
      );
    }

    // Segregation of duties: nobody approves or rejects their OWN hours — not
    // even ADMIN (mirrors assertNotSelf in despesas/actions). In dev auth the
    // session id never matches db rows, so the consultant email is also
    // compared (same constraint as getConsultantForUser/resolveDbUser).
    const decidesOwnHours = entries.some((entry) => {
      const sameUser = entry.consultant.userId === dbUser.id;
      const sameDevEmail =
        isDevAuthEnabled() &&
        entry.consultant.email.toLowerCase() ===
          user.email.trim().toLowerCase();
      return sameUser || sameDevEmail;
    });
    if (decidesOwnHours) {
      throw new ActionError(
        "SELF_APPROVAL",
        "Você não pode decidir os próprios lançamentos de horas.",
      );
    }

    const comment = parsed.comment.trim() || null;
    const auditAction =
      parsed.decision === "APPROVED"
        ? "TIME_ENTRY_APPROVED"
        : "TIME_ENTRY_REJECTED";

    let decided = 0;
    // Ids not found in the database count as already decided (race-safe).
    let alreadyDecided = parsed.entryIds.length - entries.length;
    for (const entry of entries) {
      // Same transactional pattern as the auto-approval engine: the status
      // guard makes the decision idempotent, and Approval + AuditEvent are
      // written in the SAME transaction as the status change.
      const applied = await prisma.$transaction(async (tx) => {
        const updated = await tx.timeEntry.updateMany({
          where: { id: entry.id, status: "SUBMITTED" },
          data: { status: parsed.decision },
        });
        if (updated.count !== 1) return false;

        await tx.approval.create({
          data: {
            entityType: "TIME_ENTRY",
            entityId: entry.id,
            approverUserId: dbUser.id,
            status: parsed.decision,
            comment,
            isAutomatic: false,
          },
        });
        await tx.auditEvent.create({
          data: buildAuditEventData({
            actorUserId: dbUser.id,
            entityType: "TimeEntry",
            entityId: entry.id,
            action: auditAction,
            after: { comment },
          }),
        });
        return true;
      });
      if (applied) decided += 1;
      else alreadyDecided += 1;
    }

    // Recompute the affected periods after the batch (section 4 of the spec).
    const periodIds = [...new Set(entries.map((entry) => entry.periodId))];
    for (const periodId of periodIds) {
      await recomputePeriodStatus(prisma, periodId);
    }

    revalidatePath(APROVACOES_PATH);
    revalidatePath(HORAS_PATH);
    return { ok: true, data: { decided, alreadyDecided } };
  } catch (error) {
    return toFailure(error);
  }
}
