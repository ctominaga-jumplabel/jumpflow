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
  DECIDE_HOURS_SOURCE_STATUS,
  applyTimesheetDefaultInputSchema,
  copyPreviousWeekInputSchema,
  decideHoursSchema,
  deleteTimeEntryInputSchema,
  saveTimesheetDefaultInputSchema,
  timeEntryInputSchema,
  updateTimeEntryInputSchema,
  weekActionInputSchema,
  weeklyTimeEntryInputSchema,
  type ApplyTimesheetDefaultInput,
  type CopyPreviousWeekInput,
  type DecideHoursInput,
  type DeleteTimeEntryInput,
  type SaveTimesheetDefaultInput,
  type TimeEntryInput,
  type UpdateTimeEntryInput,
  type WeekActionInput,
  type WeeklyTimeEntryInput,
} from "@/lib/timesheet/schemas";
import type { ActionResult, ErrorCode } from "@/lib/timesheet/types";
import {
  computeHoursFromClock,
  normalizeBreak,
  type ClockTimes,
} from "@/lib/timesheet/time-clock";
import {
  addDays,
  parseIsoDateUtc,
  weekStartOf,
} from "@/lib/timesheet/week";

/**
 * Normalize the clock fields from a parsed input into persistable columns plus
 * the derived `hours` total. Hours are computed on the server (source of truth);
 * the break is optional (breakStart/breakEnd null when "Remover pausa" was used).
 */
function clockToData(input: ClockTimes) {
  const { breakStart, breakEnd } = normalizeBreak(input.breakStart, input.breakEnd);
  return {
    startTime: input.startTime,
    endTime: input.endTime,
    breakStart,
    breakEnd,
    hours: computeHoursFromClock({
      startTime: input.startTime,
      endTime: input.endTime,
      breakStart,
      breakEnd,
    }),
  };
}

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

async function requireDbUser(user: AppUser) {
  // FK columns (actorUserId) need the REAL db user id — the dev session id
  // ("dev-user") does not exist in the database.
  const dbUser = await resolveDbUser(user);
  if (!dbUser) {
    throw new ActionError(
      "FORBIDDEN",
      "Usuário não encontrado no banco de dados.",
    );
  }
  return dbUser;
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

    // Resolve the REAL db user BEFORE the transaction (the audit FK cannot use
    // the synthetic dev session id).
    const dbUser = await requireDbUser(user);

    const description = parsed.description.trim();
    const clock = clockToData(parsed);
    const entry = await prisma.$transaction(async (tx) => {
      const period = await upsertOpenPeriod(tx, consultant.id, date);
      // A complete entry enters approval as soon as it is saved (Rodada 4.3):
      // status = SUBMITTED + submittedAt = now (the auto-approval engine acts
      // on SUBMITTED entries with submittedAt set).
      const now = new Date();
      const existing = await tx.timeEntry.findFirst({
        where: {
          consultantId: consultant.id,
          projectId: project.id,
          activityType: parsed.activityType,
          date,
        },
      });
      let merged = false;
      let saved;
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
        // hours and resubmits the entry for approval.
        merged = true;
        saved = await tx.timeEntry.update({
          where: { id: existing.id },
          data: {
            ...clock,
            description,
            billable: parsed.billable,
            status: "SUBMITTED",
            submittedAt: now,
            allocationId: allocation.id,
            periodId: period.id,
          },
        });
      } else {
        saved = await tx.timeEntry.create({
          data: {
            periodId: period.id,
            consultantId: consultant.id,
            projectId: project.id,
            allocationId: allocation.id,
            date,
            ...clock,
            activityType: parsed.activityType,
            description,
            billable: parsed.billable,
            status: "SUBMITTED",
            submittedAt: now,
          },
        });
      }
      await recomputePeriodStatus(tx, period.id);
      await tx.auditEvent.create({
        data: buildAuditEventData({
          actorUserId: dbUser.id,
          entityType: "TimeEntry",
          entityId: saved.id,
          action: "TIME_ENTRY_SUBMITTED_ON_SAVE",
          after: { entryId: saved.id, hours: Number(saved.hours), merged },
        }),
      });
      return saved;
    });

    // The entry now sits in the approval queue, so refresh both routes.
    revalidatePath(HORAS_PATH);
    revalidatePath(APROVACOES_PATH);
    return { ok: true, data: { id: entry.id } };
  } catch (error) {
    return toFailure(error);
  }
}

export interface CreateWeeklyTimeEntriesResult {
  created: number;
  skippedExisting: number;
  skippedOutOfAllocation: number;
}

export async function createWeeklyTimeEntries(
  input: WeeklyTimeEntryInput,
): Promise<ActionResult<CreateWeeklyTimeEntriesResult>> {
  try {
    ensureDatabase();
    const user = await requireUser();
    const consultant = await requireConsultant(user);
    const parsed = parseInput(weeklyTimeEntryInputSchema, input);
    const weekStart = weekStartOf(parseIsoDateUtc(parsed.weekStart)!);
    const weekEnd = addDays(weekStart, 6);

    const project = await prisma.project.findUnique({
      where: { id: parsed.projectId },
    });
    if (!project) {
      throw new ActionError("NOT_FOUND", "Projeto nÃ£o encontrado.");
    }
    if (project.status === "CLOSED") {
      throw new ActionError(
        "PROJECT_CLOSED",
        "Projeto encerrado nÃ£o recebe lanÃ§amentos.",
      );
    }

    const dbUser = await requireDbUser(user);
    const weekdays = [...new Set(parsed.weekdays)].sort((a, b) => a - b);
    const description = parsed.description.trim();
    const clock = clockToData(parsed);

    const result = await prisma.$transaction(async (tx) => {
      let period = await tx.timesheetPeriod.findUnique({
        where: {
          consultantId_startDate_endDate: {
            consultantId: consultant.id,
            startDate: weekStart,
            endDate: weekEnd,
          },
        },
      });
      if (period?.status === "CLOSED") {
        throw new ActionError(
          "PERIOD_CLOSED",
          "Esta semana jÃ¡ foi fechada e nÃ£o aceita alteraÃ§Ãµes.",
        );
      }
      const existing = await tx.timeEntry.findMany({
        where: {
          consultantId: consultant.id,
          projectId: project.id,
          activityType: parsed.activityType,
          date: { gte: weekStart, lte: weekEnd },
        },
        select: { date: true },
      });
      const existingDays = new Set(existing.map((entry) => entry.date.getTime()));
      const counts: CreateWeeklyTimeEntriesResult = {
        created: 0,
        skippedExisting: 0,
        skippedOutOfAllocation: 0,
      };
      const submittedAt = new Date();

      for (let index = 0; index < 7; index += 1) {
        const date = addDays(weekStart, index);
        if (!weekdays.includes(utcIsoWeekday(date))) continue;
        if (existingDays.has(date.getTime())) {
          counts.skippedExisting += 1;
          continue;
        }
        const allocation = await findActiveAllocation(
          tx,
          consultant.id,
          project.id,
          date,
        );
        if (!allocation) {
          counts.skippedOutOfAllocation += 1;
          continue;
        }
        period ??= await upsertOpenPeriod(tx, consultant.id, weekStart);
        const created = await tx.timeEntry.create({
          data: {
            periodId: period.id,
            consultantId: consultant.id,
            projectId: project.id,
            allocationId: allocation.id,
            date,
            ...clock,
            activityType: parsed.activityType,
            description,
            billable: parsed.billable,
            status: "SUBMITTED",
            submittedAt,
          },
        });
        existingDays.add(date.getTime());
        counts.created += 1;
        await tx.auditEvent.create({
          data: buildAuditEventData({
            actorUserId: dbUser.id,
            entityType: "TimeEntry",
            entityId: created.id,
            action: "TIME_ENTRY_WEEKLY_CREATED",
            after: {
              entryId: created.id,
              hours: Number(created.hours),
              date: created.date.toISOString().slice(0, 10),
            },
          }),
        });
      }

      if (counts.created > 0 && period) await recomputePeriodStatus(tx, period.id);
      return counts;
    });

    revalidatePath(HORAS_PATH);
    revalidatePath(APROVACOES_PATH);
    return { ok: true, data: result };
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
    if (
      entry.status !== "DRAFT" &&
      entry.status !== "REJECTED" &&
      entry.status !== "SUBMITTED"
    ) {
      // APPROVED/CLOSED are terminal: a decided or closed entry must never be
      // mutated by the consultant (mirrors isRowEditable in lib/timesheet/types).
      throw new ActionError(
        "NOT_EDITABLE",
        "Lançamento aprovado ou fechado não pode ser alterado.",
      );
    }
    // Captured before the update so the audit trail records the reopened state
    // (a SUBMITTED entry being edited is a re-submission, not a first submit).
    const previousStatus = entry.status;

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

    // Resolve the REAL db user BEFORE the transaction (audit FK).
    const dbUser = await requireDbUser(user);

    await prisma.$transaction(async (tx) => {
      // Editing a DRAFT/REJECTED/SUBMITTED entry resubmits it for approval
      // (Rodada 4.3): status = SUBMITTED + new submittedAt. The new submittedAt
      // also resets the auto-approval delay for an already-submitted entry.
      const now = new Date();
      await tx.timeEntry.update({
        where: { id: entry.id },
        data: {
          ...clockToData(parsed),
          description: parsed.description.trim(),
          billable: parsed.billable,
          date,
          allocationId,
          status: "SUBMITTED",
          submittedAt: now,
        },
      });
      await recomputePeriodStatus(tx, entry.periodId);
      await tx.auditEvent.create({
        data: buildAuditEventData({
          actorUserId: dbUser.id,
          entityType: "TimeEntry",
          entityId: entry.id,
          action: "TIME_ENTRY_SUBMITTED_ON_SAVE",
          // `before.status` records the reopened state for traceability: a
          // SUBMITTED -> SUBMITTED edit is an in-place re-submission of a
          // still-pending entry, distinct from correcting a REJECTED one.
          before: { status: previousStatus },
          after: { entryId: entry.id, resubmit: true },
        }),
      });
    });

    // The entry now sits in the approval queue, so refresh both routes.
    revalidatePath(HORAS_PATH);
    revalidatePath(APROVACOES_PATH);
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

async function requireOwnedActiveAllocation(
  db: Db,
  consultantId: string,
  allocationId: string,
) {
  const allocation = await db.allocation.findFirst({
    where: { id: allocationId, consultantId, status: "ACTIVE" },
    include: { project: { select: { id: true, status: true } } },
  });
  if (!allocation) {
    throw new ActionError(
      "NO_ACTIVE_ALLOCATION",
      "Alocacao ativa nao encontrada para este consultor.",
    );
  }
  if (allocation.project.status === "CLOSED") {
    throw new ActionError(
      "PROJECT_CLOSED",
      "Projeto encerrado nao recebe lancamentos.",
    );
  }
  return allocation;
}

function utcIsoWeekday(date: Date): number {
  const day = date.getUTCDay();
  return day === 0 ? 7 : day;
}

function allocationCoversDate(
  allocation: { startDate: Date; endDate: Date | null },
  date: Date,
): boolean {
  return (
    allocation.startDate.getTime() <= date.getTime() &&
    (!allocation.endDate || allocation.endDate.getTime() >= date.getTime())
  );
}

export async function saveTimesheetDefault(
  input: SaveTimesheetDefaultInput,
): Promise<ActionResult<{ allocationId: string }>> {
  try {
    ensureDatabase();
    const user = await requireUser();
    const consultant = await requireConsultant(user);
    const parsed = parseInput(saveTimesheetDefaultInputSchema, input);
    const dbUser = await requireDbUser(user);

    const allocation = await requireOwnedActiveAllocation(
      prisma,
      consultant.id,
      parsed.allocationId,
    );
    const weekdays = [...new Set(parsed.weekdays)].sort((a, b) => a - b);
    const clock = clockToData(parsed);
    const defaultData = {
      activityType: parsed.activityType,
      hoursPerDay: clock.hours,
      startTime: clock.startTime,
      breakStart: clock.breakStart,
      breakEnd: clock.breakEnd,
      endTime: clock.endTime,
      weekdays,
      billable: parsed.billable,
      description: parsed.description.trim(),
    };

    await prisma.$transaction(async (tx) => {
      const saved = await tx.timesheetDefault.upsert({
        where: { allocationId: allocation.id },
        update: defaultData,
        create: { allocationId: allocation.id, ...defaultData },
      });
      await tx.auditEvent.create({
        data: buildAuditEventData({
          actorUserId: dbUser.id,
          entityType: "TimesheetDefault",
          entityId: saved.id,
          action: "TIMESHEET_DEFAULT_SAVED",
          after: {
            allocationId: allocation.id,
            activityType: saved.activityType,
            hoursPerDay: Number(saved.hoursPerDay),
            weekdays: saved.weekdays,
            billable: saved.billable,
          },
        }),
      });
    });

    revalidatePath(HORAS_PATH);
    return { ok: true, data: { allocationId: allocation.id } };
  } catch (error) {
    return toFailure(error);
  }
}

export interface ApplyTimesheetDefaultResult {
  created: number;
  skippedExisting: number;
  skippedOutOfAllocation: number;
  skippedNoDefault: number;
}

export async function applyTimesheetDefault(
  input: ApplyTimesheetDefaultInput,
): Promise<ActionResult<ApplyTimesheetDefaultResult>> {
  try {
    ensureDatabase();
    const user = await requireUser();
    const consultant = await requireConsultant(user);
    const parsed = parseInput(applyTimesheetDefaultInputSchema, input);
    const weekStart = weekStartOf(parseIsoDateUtc(parsed.weekStart)!);
    const weekEnd = addDays(weekStart, 6);
    const dbUser = await requireDbUser(user);

    const allocation = await prisma.allocation.findFirst({
      where: { id: parsed.allocationId, consultantId: consultant.id, status: "ACTIVE" },
      include: {
        project: { select: { id: true, status: true } },
        timesheetDefault: true,
      },
    });
    if (!allocation) {
      throw new ActionError(
        "NO_ACTIVE_ALLOCATION",
        "Alocacao ativa nao encontrada para este consultor.",
      );
    }
    if (allocation.project.status === "CLOSED") {
      throw new ActionError(
        "PROJECT_CLOSED",
        "Projeto encerrado nao recebe lancamentos.",
      );
    }
    if (!allocation.timesheetDefault) {
      return {
        ok: true,
        data: {
          created: 0,
          skippedExisting: 0,
          skippedOutOfAllocation: 0,
          skippedNoDefault: 1,
        },
      };
    }

    const result = await prisma.$transaction(async (tx) => {
      const period = await upsertOpenPeriod(tx, consultant.id, weekStart);
      const existing = await tx.timeEntry.findMany({
        where: {
          consultantId: consultant.id,
          projectId: allocation.projectId,
          activityType: allocation.timesheetDefault!.activityType,
          date: { gte: weekStart, lte: weekEnd },
        },
        select: { date: true },
      });
      const existingDays = new Set(existing.map((entry) => entry.date.getTime()));
      const counts: ApplyTimesheetDefaultResult = {
        created: 0,
        skippedExisting: 0,
        skippedOutOfAllocation: 0,
        skippedNoDefault: 0,
      };
      const submittedAt = new Date();
      for (let index = 0; index < 7; index += 1) {
        const date = addDays(weekStart, index);
        if (!allocation.timesheetDefault!.weekdays.includes(utcIsoWeekday(date))) {
          continue;
        }
        if (!allocationCoversDate(allocation, date)) {
          counts.skippedOutOfAllocation += 1;
          continue;
        }
        if (existingDays.has(date.getTime())) {
          counts.skippedExisting += 1;
          continue;
        }
        const def = allocation.timesheetDefault!;
        const created = await tx.timeEntry.create({
          data: {
            periodId: period.id,
            consultantId: consultant.id,
            projectId: allocation.projectId,
            allocationId: allocation.id,
            date,
            hours: def.hoursPerDay,
            startTime: def.startTime,
            breakStart: def.breakStart,
            breakEnd: def.breakEnd,
            endTime: def.endTime,
            activityType: def.activityType,
            description: def.description ?? "",
            billable: def.billable,
            status: "SUBMITTED",
            submittedAt,
          },
        });
        existingDays.add(date.getTime());
        counts.created += 1;
        await tx.auditEvent.create({
          data: buildAuditEventData({
            actorUserId: dbUser.id,
            entityType: "TimeEntry",
            entityId: created.id,
            action: "TIME_ENTRY_CREATED_FROM_DEFAULT",
            after: {
              allocationId: allocation.id,
              timesheetDefaultId: allocation.timesheetDefault!.id,
              hours: Number(created.hours),
              date: created.date.toISOString().slice(0, 10),
            },
          }),
        });
      }
      if (counts.created > 0) await recomputePeriodStatus(tx, period.id);
      await tx.auditEvent.create({
        data: buildAuditEventData({
          actorUserId: dbUser.id,
          entityType: "TimesheetDefault",
          entityId: allocation.timesheetDefault!.id,
          action: "TIMESHEET_DEFAULT_APPLIED",
          after: { allocationId: allocation.id, weekStart: parsed.weekStart, ...counts },
        }),
      });
      return counts;
    });

    revalidatePath(HORAS_PATH);
    revalidatePath(APROVACOES_PATH);
    return { ok: true, data: result };
  } catch (error) {
    return toFailure(error);
  }
}

export async function copyPreviousWeek(
  input: CopyPreviousWeekInput,
): Promise<ActionResult<CopyWeekResult>> {
  try {
    ensureDatabase();
    const user = await requireUser();
    const consultant = await requireConsultant(user);
    const parsed = parseInput(copyPreviousWeekInputSchema, input);
    // Single week-level description applied to every copied entry (the modal).
    // Blank = keep each source entry's own description.
    const weekDescription = parsed.description?.trim() || null;
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
    // Copied entries carry hours, so they are complete launches and — like a
    // direct save (Rodada 4.3) — enter approval immediately as SUBMITTED.
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

    const dbUser = await requireDbUser(user);
    const submittedAt = new Date();
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
        const created = await tx.timeEntry.create({
          data: {
            periodId: period.id,
            consultantId: consultant.id,
            projectId: entry.projectId,
            allocationId: allocation.id,
            date: destDate,
            hours: entry.hours,
            startTime: entry.startTime,
            breakStart: entry.breakStart,
            breakEnd: entry.breakEnd,
            endTime: entry.endTime,
            activityType: entry.activityType,
            description: weekDescription ?? entry.description,
            billable: entry.billable,
            status: "SUBMITTED",
            submittedAt,
          },
        });
        await tx.auditEvent.create({
          data: buildAuditEventData({
            actorUserId: dbUser.id,
            entityType: "TimeEntry",
            entityId: created.id,
            action: "TIME_ENTRY_SUBMITTED_ON_SAVE",
            after: { entryId: created.id, hours: Number(entry.hours), copied: true },
          }),
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
        period: { select: { status: true } },
      },
    });
    if (entries.length === 0) {
      throw new ActionError("NOT_FOUND", "Nenhum lançamento encontrado.");
    }

    // CLOSED is terminal: a closed entry (or any entry in a CLOSED period) can
    // never be approved, rejected OR reopened. Fail the whole batch so the
    // caller never gets a misleading partial success.
    if (
      entries.some(
        (entry) => entry.status === "CLOSED" || entry.period.status === "CLOSED",
      )
    ) {
      throw new ActionError(
        "PERIOD_CLOSED",
        "Lançamentos fechados não podem ser alterados.",
      );
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
    // SUBMITTED here is a REOPEN (decided -> pending). It is recorded as a
    // MANUAL Approval (isAutomatic:false) so the auto-approval engine treats
    // the entry as already manually handled and never re-approves it on its own.
    const isReopen = parsed.decision === "SUBMITTED";
    const auditAction = isReopen
      ? "TIME_ENTRY_REOPENED"
      : parsed.decision === "APPROVED"
        ? "TIME_ENTRY_APPROVED"
        : "TIME_ENTRY_REJECTED";
    // The Approval enum only allows APPROVED/REJECTED. A reopen is the reversal
    // of a prior decision, so it is recorded as a MANUAL REJECTED Approval — the
    // exact value the status field can hold AND the marker the auto-approval
    // engine reads (any isAutomatic:false Approval blocks re-approval; see
    // collectAutoApprovalDecisions). The audited intent (TIME_ENTRY_REOPENED +
    // before/after status) is the authoritative human-readable record.
    const approvalStatus: "APPROVED" | "REJECTED" = isReopen
      ? "REJECTED"
      : (parsed.decision as "APPROVED" | "REJECTED");
    // Statuses this transition is allowed to start FROM (idempotency guard).
    // Cast to the Prisma enum literal union (the guard is the source of truth).
    const sourceStatuses = [...DECIDE_HOURS_SOURCE_STATUS[parsed.decision]] as (
      | "SUBMITTED"
      | "APPROVED"
      | "REJECTED"
    )[];

    let decided = 0;
    // Ids not found in the database count as already decided (race-safe).
    let alreadyDecided = parsed.entryIds.length - entries.length;
    for (const entry of entries) {
      // Same transactional pattern as the auto-approval engine: the status
      // guard makes the transition idempotent (only entries currently in an
      // allowed source status are touched), and Approval + AuditEvent are
      // written in the SAME transaction as the status change.
      const applied = await prisma.$transaction(async (tx) => {
        const updated = await tx.timeEntry.updateMany({
          where: { id: entry.id, status: { in: sourceStatuses } },
          data: { status: parsed.decision },
        });
        if (updated.count !== 1) return false;

        await tx.approval.create({
          data: {
            entityType: "TIME_ENTRY",
            entityId: entry.id,
            approverUserId: dbUser.id,
            status: approvalStatus,
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
            before: { status: entry.status },
            after: { status: parsed.decision, comment },
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
