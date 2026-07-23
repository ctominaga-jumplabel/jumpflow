"use server";

import { revalidatePath } from "next/cache";
import { prisma, Prisma } from "@jumpflow/database";
import { z, type ZodType } from "zod";
import { isDevAuthEnabled } from "@/lib/auth/dev";
import { requireRole, requireUser } from "@/lib/auth/guards";
import { hasRole } from "@/lib/auth/route-permissions";
import type { AppUser } from "@/lib/auth/types";
import { buildAuditEventData } from "@/lib/db/audit";
import { isDatabaseConfigured } from "@/lib/db/config";
import {
  findActiveAllocation,
  getConsultantForUser,
  recomputePeriodStatus,
} from "@/lib/db/timesheet";
import { findConfirmedTimeOffCovering } from "@/lib/db/time-off";
import { resolveDbUser } from "@/lib/db/users";
import { transcribeAudio } from "@/lib/transcription/transcribe";
import {
  ACTIVITY_AUDIO_MAX_BYTES,
  type TranscribeActivityAudioResult,
} from "./activityAudio";
import {
  BILLABLE_JUSTIFICATION_BUCKET,
  getStorageProvider,
  isStorageConfigured,
  ONCALL_APPROVALS_BUCKET,
} from "@/lib/storage/provider";
import {
  safeFileName,
  validateReceiptFile,
} from "@/lib/storage/file-validation";
import {
  JUSTIFICATION_REQUIRED_MESSAGE,
  justificationSchema,
} from "@/lib/shared/justification";
import {
  COMMENT_REQUIRED_MESSAGE,
  DECIDE_HOURS_SOURCE_STATUS,
  applyTimesheetDefaultInputSchema,
  copyPreviousWeekInputSchema,
  decideHoursSchema,
  deleteTimeEntryInputSchema,
  saveTimesheetDefaultInputSchema,
  setEntryBillableSchema,
  timeEntryInputSchema,
  updateTimeEntryInputSchema,
  weekActionInputSchema,
  weeklyTimeEntryInputSchema,
  type ApplyTimesheetDefaultInput,
  type CopyPreviousWeekInput,
  type DecideHoursInput,
  type DeleteTimeEntryInput,
  type SaveTimesheetDefaultInput,
  type SetEntryBillableInput,
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
  toIsoDate,
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
 * Papéis de gestão que podem definir o campo financeiro `billable` livremente
 * (mesmo conjunto de MANAGER_ROLES usado em horas/page.tsx).
 */
const BILLABLE_MANAGER_ROLES = [
  "ADMIN",
  "AREA_MANAGER",
  "PROJECT_MANAGER",
  "FINANCE",
] as const;

/**
 * Enforcement server-side do campo financeiro `billable` (CLAUDE.md: proteger
 * campo financeiro por papel). Gestão define livremente; um consultor puro NÃO
 * dita `billable` — o servidor IGNORA o payload e deriva pela regra de negócio
 * (Sobreaviso/ON_CALL = não faturável; demais atividades = faturável). Esconder
 * o controle no client é apenas cosmético: a autoridade é esta função.
 */
function resolveBillable(
  user: AppUser,
  activityType: string,
  requested: boolean,
): boolean {
  if (hasRole(user, [...BILLABLE_MANAGER_ROLES])) return requested;
  return activityType !== "ON_CALL";
}

function isBillableManager(user: AppUser): boolean {
  return hasRole(user, [...BILLABLE_MANAGER_ROLES]);
}

/**
 * Resolução do campo financeiro `billable` PARA LANÇAMENTOS (P9 / melhoria #9),
 * já com a regra de justificativa obrigatória:
 *
 *  - Consultor puro: NÃO dita `billable`. Deriva pela atividade (ON_CALL = não
 *    faturável; demais = faturável). Essa derivação AUTOMÁTICA nunca exige um
 *    motivo — é regra de negócio, não uma decisão explícita de gestor. Ignora
 *    qualquer `reason` enviado.
 *  - Gestão (BILLABLE_MANAGER_ROLES): define livremente. Marcar NÃO faturável é
 *    uma ação sensível — exige `nonBillableReason` não-vazio (justificationSchema).
 *    Sem motivo válido, recusa com COMMENT_REQUIRED (o servidor é a autoridade).
 *
 * Retorna também o `nonBillableReason` a persistir (null quando faturável ou
 * quando a não-faturabilidade veio da derivação automática do consultor) e
 * `managerMarkedNonBillable` (para auditar TIME_ENTRY_MARKED_NON_BILLABLE).
 */
function resolveBillableDecision(
  user: AppUser,
  activityType: string,
  requested: boolean,
  reason: string | null | undefined,
): {
  billable: boolean;
  nonBillableReason: string | null;
  managerMarkedNonBillable: boolean;
} {
  if (!isBillableManager(user)) {
    return {
      billable: activityType !== "ON_CALL",
      nonBillableReason: null,
      managerMarkedNonBillable: false,
    };
  }
  if (requested) {
    return {
      billable: true,
      nonBillableReason: null,
      managerMarkedNonBillable: false,
    };
  }
  // ON_CALL não faturável é REGRA DE NEGÓCIO (Sobreaviso), não uma ação
  // explícita de gestor — nunca exige justificativa, mesmo para gestão.
  if (activityType === "ON_CALL") {
    return {
      billable: false,
      nonBillableReason: null,
      managerMarkedNonBillable: false,
    };
  }
  // Gestor tornando um lançamento NORMAL não faturável: ação sensível → motivo.
  const parsed = justificationSchema.safeParse(reason ?? "");
  if (!parsed.success) {
    throw new ActionError("COMMENT_REQUIRED", JUSTIFICATION_REQUIRED_MESSAGE);
  }
  return {
    billable: false,
    nonBillableReason: parsed.data,
    managerMarkedNonBillable: true,
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

/**
 * Guarda server-side (Onda D): recusa o POST de um lançamento de DIA ÚTIL
 * (WORKDAY) numa data já coberta por ausência CONFIRMED do consultor. Só WORKDAY
 * dispara — atividades de ausência (Férias/Licença/Ausência Remunerada) são
 * exatamente o que a ausência materializa. Sem efeito para as demais atividades.
 */
async function assertNoConfirmedTimeOff(
  db: Db,
  consultantId: string,
  activityType: string,
  date: Date,
): Promise<void> {
  if (activityType !== "WORKDAY") return;
  const off = await findConfirmedTimeOffCovering(db, consultantId, date);
  if (off) {
    throw new ActionError(
      "TIME_OFF_CONFLICT",
      `Você possui ausência confirmada em ${toIsoDate(date)}. Não é possível lançar Dia Útil nesta data.`,
    );
  }
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
    // Guarda de ausência: WORKDAY em data com ausência confirmada é recusado.
    await assertNoConfirmedTimeOff(
      prisma,
      consultant.id,
      parsed.activityType,
      date,
    );

    // Resolve the REAL db user BEFORE the transaction (the audit FK cannot use
    // the synthetic dev session id).
    const dbUser = await requireDbUser(user);

    const description = parsed.description.trim();
    const clock = clockToData(parsed);
    // Enforcement de campo financeiro por papel + P9: consultor puro não dita
    // billable; gestor que marca NÃO faturável precisa de justificativa.
    const billableDecision = resolveBillableDecision(
      user,
      parsed.activityType,
      parsed.billable,
      parsed.nonBillableReason,
    );
    const billable = billableDecision.billable;
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
            billable,
            nonBillableReason: billableDecision.nonBillableReason,
            multiplier: parsed.multiplier,
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
            billable,
            nonBillableReason: billableDecision.nonBillableReason,
            multiplier: parsed.multiplier,
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
      // P9: auditoria dedicada quando um gestor torna o lançamento não faturável.
      if (billableDecision.managerMarkedNonBillable) {
        await tx.auditEvent.create({
          data: buildAuditEventData({
            actorUserId: dbUser.id,
            entityType: "TimeEntry",
            entityId: saved.id,
            action: "TIME_ENTRY_MARKED_NON_BILLABLE",
            after: {
              entryId: saved.id,
              reason: billableDecision.nonBillableReason,
            },
          }),
        });
      }
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
    // Enforcement de campo financeiro por papel + P9: gestor que marca NÃO
    // faturável precisa de justificativa (mesmo motivo aplicado a todos os dias
    // criados nesta semana). Consultor puro não dita billable.
    const billableDecision = resolveBillableDecision(
      user,
      parsed.activityType,
      parsed.billable,
      parsed.nonBillableReason,
    );
    const billable = billableDecision.billable;

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
        // Guarda de ausência: recusa WORKDAY em data com ausência confirmada.
        await assertNoConfirmedTimeOff(
          tx,
          consultant.id,
          parsed.activityType,
          date,
        );
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
            billable,
            nonBillableReason: billableDecision.nonBillableReason,
            multiplier: parsed.multiplier,
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
        // P9: auditoria dedicada quando o gestor torna o lançamento não faturável.
        if (billableDecision.managerMarkedNonBillable) {
          await tx.auditEvent.create({
            data: buildAuditEventData({
              actorUserId: dbUser.id,
              entityType: "TimeEntry",
              entityId: created.id,
              action: "TIME_ENTRY_MARKED_NON_BILLABLE",
              after: {
                entryId: created.id,
                reason: billableDecision.nonBillableReason,
              },
            }),
          });
        }
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
      include: {
        period: true,
        billableJustificationAttachment: {
          select: { storageKey: true, storageBucket: true },
        },
      },
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

    // Guarda de ausência: WORKDAY (atividade não muda no edit) em data coberta
    // por ausência confirmada é recusado — inclusive ao mover a data.
    await assertNoConfirmedTimeOff(
      prisma,
      consultant.id,
      entry.activityType,
      date,
    );

    // Resolve the REAL db user BEFORE the transaction (audit FK).
    const dbUser = await requireDbUser(user);

    // Enforcement por papel + P9: consultor puro não dita billable — deriva-se
    // pela atividade EXISTENTE do lançamento (a atividade não muda no edit); um
    // gestor que marca NÃO faturável precisa de justificativa. Quando volta a
    // ser faturável, o motivo é limpo (nonBillableReason = null).
    const billableDecision = resolveBillableDecision(
      user,
      entry.activityType,
      parsed.billable,
      parsed.nonBillableReason,
    );

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
          billable: billableDecision.billable,
          nonBillableReason: billableDecision.nonBillableReason,
          multiplier: parsed.multiplier,
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
      // P9: auditoria dedicada quando o gestor torna o lançamento não faturável.
      if (billableDecision.managerMarkedNonBillable) {
        await tx.auditEvent.create({
          data: buildAuditEventData({
            actorUserId: dbUser.id,
            entityType: "TimeEntry",
            entityId: entry.id,
            action: "TIME_ENTRY_MARKED_NON_BILLABLE",
            before: { billable: entry.billable },
            after: { entryId: entry.id, reason: billableDecision.nonBillableReason },
          }),
        });
      }
      // Voltou a ser faturável: o comprovante de NÃO faturável não faz mais
      // sentido — remove o registro para não ficar órfão (limpeza do objeto no
      // storage é best-effort logo após a transação).
      if (billableDecision.billable) {
        await tx.timeEntryBillableJustificationAttachment.deleteMany({
          where: { timeEntryId: entry.id },
        });
      }
    });

    // Best-effort: apaga o objeto do anexo de justificativa órfão do storage.
    if (billableDecision.billable && entry.billableJustificationAttachment) {
      const att = entry.billableJustificationAttachment;
      const provider = getStorageProvider(
        att.storageBucket || BILLABLE_JUSTIFICATION_BUCKET,
      );
      if (provider) {
        try {
          await provider.delete(att.storageKey);
        } catch (e) {
          console.error("[horas] failed to delete orphan justification object", e);
        }
      }
    }

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
    // Sobreaviso (ON_CALL) não pode virar padrão semanal: é irregular e o
    // TimesheetDefault não tem coluna de fator de remuneração, então aplicá-lo
    // criaria lançamentos com multiplier 1.00 e superpagaria o sobreaviso.
    // Lance ON_CALL manualmente, com o fator, pela tela de Horas.
    if (parsed.activityType === "ON_CALL") {
      throw new ActionError(
        "INVALID_INPUT",
        "Sobreaviso não pode ser definido como padrão semanal. Lance-o manualmente com o fator de remuneração.",
      );
    }
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
      // Enforcement de campo financeiro por papel: um consultor puro não dita
      // billable nem via padrão semanal — deriva-se pela atividade (ON_CALL já é
      // rejeitado acima, então não-gestão sempre grava true aqui).
      billable: resolveBillable(user, parsed.activityType, parsed.billable),
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
    // Defense-in-depth: ON_CALL nunca deveria ter sido salvo como padrão
    // (bloqueado em saveTimesheetDefault), mas se um default legado existir,
    // recusamos aplicá-lo — o TimesheetDefault não carrega fator de remuneração
    // e geraria lançamentos com multiplier 1.00 (superpagamento do sobreaviso).
    if (allocation.timesheetDefault.activityType === "ON_CALL") {
      throw new ActionError(
        "INVALID_INPUT",
        "Sobreaviso não pode ser aplicado como padrão semanal. Lance-o manualmente com o fator de remuneração.",
      );
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
        // Guarda de ausência: um padrão WORKDAY não materializa em data com
        // ausência confirmada.
        await assertNoConfirmedTimeOff(
          tx,
          consultant.id,
          allocation.timesheetDefault!.activityType,
          date,
        );
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
            // Defesa-em-profundidade: mesmo que um default legado guarde
            // billable=false, um consultor puro aplicando-o gera lançamentos
            // faturáveis (ON_CALL nunca é padrão). Gestão aplica o que está no def.
            billable: resolveBillable(user, def.activityType, def.billable),
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
        // C1: nunca copiar um WORKDAY sobre um dia com ausência CONFIRMED (já
        // materializada como VACATION); senão o dia seria pago/faturado em
        // dobro. É o mesmo invariante de assertNoConfirmedTimeOff, mas aqui
        // pulamos silenciosamente (com contagem) em vez de abortar a cópia
        // inteira. Fecha o 5º caminho de criação de WORKDAY.
        if (
          entry.activityType === "WORKDAY" &&
          (await findConfirmedTimeOffCovering(tx, consultant.id, destDate))
        ) {
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
            // Preserva o fator de remuneração do lançamento de origem: copiar um
            // ON_CALL (ex.: 0.33) com multiplier 1.00 superpagaria ~3x.
            multiplier: entry.multiplier,
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

    // Segregation of duties: a PROJECT_MANAGER never decides their OWN hours
    // (mirrors assertNotSelf in despesas/actions). ADMIN/AREA_MANAGER are
    // exempt — in a small operation the same person often logs and approves
    // hours, so the guard would otherwise block the entire approval flow
    // (incl. a mixed bulk selection). In dev auth the session id never matches
    // db rows, so the consultant email is also compared (same constraint as
    // getConsultantForUser/resolveDbUser).
    if (restricted) {
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

/**
 * Define o campo financeiro `billable` de UM lançamento específico (por dia), a
 * partir da tela de APROVAÇÃO. "Faturável" é uma DEFINIÇÃO DE GESTÃO: só papéis
 * de gestão/financeiro alteram (BILLABLE_MANAGER_ROLES). Um PROJECT_MANAGER só
 * pode alterar lançamentos de projetos que gerencia; ADMIN/AREA_MANAGER/FINANCE
 * são irrestritos.
 *
 * Marcar como NÃO faturável é uma ação sensível: exige justificativa não-vazia
 * (reforçada no servidor, via resolveBillableDecision) — exceto ON_CALL, que já
 * é regra de negócio. Voltar a faturável limpa o motivo e o anexo de
 * justificativa (best-effort no storage). Idempotente: uma chamada que não muda
 * nada não gera auditoria. Nunca altera lançamentos fechados (CLOSED terminal).
 */
export async function setEntryBillable(
  input: SetEntryBillableInput,
): Promise<ActionResult<{ id: string; billable: boolean }>> {
  try {
    ensureDatabase();
    const user = await requireRole([...BILLABLE_MANAGER_ROLES]);
    const parsed = parseInput(setEntryBillableSchema, input);

    const entry = await prisma.timeEntry.findUnique({
      where: { id: parsed.entryId },
      include: {
        period: { select: { status: true } },
        project: { select: { managerUserId: true } },
        billableJustificationAttachment: {
          select: { storageKey: true, storageBucket: true },
        },
      },
    });
    if (!entry) throw new ActionError("NOT_FOUND", "Lançamento não encontrado.");
    // CLOSED é terminal (lançamento ou período): campo financeiro imutável.
    if (entry.status === "CLOSED" || entry.period.status === "CLOSED") {
      throw new ActionError(
        "PERIOD_CLOSED",
        "Lançamentos fechados não podem ser alterados.",
      );
    }

    // FK de auditoria/escopo precisa do id real do usuário no banco.
    const dbUser = await requireDbUser(user);

    // Escopo do PROJECT_MANAGER: só projetos que gerencia. ADMIN/AREA_MANAGER e
    // FINANCE (papel financeiro) são irrestritos sobre o campo `billable`.
    const unrestricted = hasRole(user, ["ADMIN", "AREA_MANAGER", "FINANCE"]);
    if (!unrestricted && entry.project.managerUserId !== dbUser.id) {
      throw new ActionError(
        "FORBIDDEN",
        "Você só pode alterar lançamentos de projetos que gerencia.",
      );
    }

    // resolveBillableDecision reforça a justificativa obrigatória ao marcar NÃO
    // faturável (COMMENT_REQUIRED quando falta motivo); ON_CALL não exige.
    const decision = resolveBillableDecision(
      user,
      entry.activityType,
      parsed.billable,
      parsed.nonBillableReason,
    );

    // Idempotência: nada mudou → não persiste nem audita (chamadas repetidas
    // são seguras).
    if (
      entry.billable === decision.billable &&
      (entry.nonBillableReason ?? null) === decision.nonBillableReason
    ) {
      return { ok: true, data: { id: entry.id, billable: entry.billable } };
    }

    await prisma.$transaction(async (tx) => {
      await tx.timeEntry.update({
        where: { id: entry.id },
        data: {
          billable: decision.billable,
          nonBillableReason: decision.nonBillableReason,
        },
      });
      await tx.auditEvent.create({
        data: buildAuditEventData({
          actorUserId: dbUser.id,
          entityType: "TimeEntry",
          entityId: entry.id,
          action: decision.managerMarkedNonBillable
            ? "TIME_ENTRY_MARKED_NON_BILLABLE"
            : "TIME_ENTRY_BILLABLE_CHANGED",
          before: {
            billable: entry.billable,
            nonBillableReason: entry.nonBillableReason,
          },
          after: {
            billable: decision.billable,
            nonBillableReason: decision.nonBillableReason,
          },
        }),
      });
      // Voltou a ser faturável: o comprovante de NÃO faturável não faz sentido —
      // remove o registro (limpeza do objeto é best-effort após a transação).
      if (decision.billable) {
        await tx.timeEntryBillableJustificationAttachment.deleteMany({
          where: { timeEntryId: entry.id },
        });
      }
    });

    if (decision.billable && entry.billableJustificationAttachment) {
      const att = entry.billableJustificationAttachment;
      const provider = getStorageProvider(
        att.storageBucket || BILLABLE_JUSTIFICATION_BUCKET,
      );
      if (provider) {
        try {
          await provider.delete(att.storageKey);
        } catch (e) {
          console.error("[horas] failed to delete orphan justification object", e);
        }
      }
    }

    revalidatePath(APROVACOES_PATH);
    revalidatePath(HORAS_PATH);
    return { ok: true, data: { id: entry.id, billable: decision.billable } };
  } catch (error) {
    return toFailure(error);
  }
}

// --- Anexo genérico do lançamento (TimeEntryAttachment) ---------------------
//
// Melhoria #2: qualquer lançamento de horas pode carregar 1 anexo (PDF/JPG/
// PNG/WebP) — nasceu para o "ok do responsável" do sobreaviso (ON_CALL), mas
// vale para qualquer activityType. Mesmo padrão de Despesas/Sobreaviso: o
// arquivo vive em object storage (bucket privado + chave), a URL é sempre
// assinada e de vida curta. Reusa o bucket privado de anexos (oncall-approvals)
// que já é provisionado, evitando uma mudança de devops nesta etapa.

/**
 * Papéis que podem visualizar o anexo de um lançamento (além do dono). Inclui
 * PEOPLE (DP): a apuração do Fechamento Operacional é a tela do DP e precisa
 * abrir os anexos dia a dia de cada consultor.
 */
const ATTACHMENT_VIEW_ROLES = [
  "ADMIN",
  "AREA_MANAGER",
  "PROJECT_MANAGER",
  "FINANCE",
  "PEOPLE",
] as const;

// Não validamos com .cuid(): ids do seed não são cuid (apenas string não vazia).
const attachmentIdSchema = z.object({
  id: z.string().trim().min(1, "Identificador obrigatório."),
});

/**
 * Chave de storage do anexo: `time-entries/{entryId}/{timestamp}-{nome}`. O
 * caminho NUNCA carrega dado sensível — apenas o id do lançamento e o nome
 * sanitizado do arquivo.
 */
function buildTimeEntryAttachmentKey(entryId: string, fileName: string): string {
  const ts = new Date()
    .toISOString()
    .replace(/[-:]/g, "")
    .replace(/\.\d+Z$/, "Z");
  return `time-entries/${entryId}/${ts}-${safeFileName(fileName)}`;
}

/**
 * Statuses do lançamento que ainda aceitam mexer no anexo (mesma fronteira de
 * edição do consultor): DRAFT/REJECTED/SUBMITTED. APPROVED/CLOSED são terminais.
 */
const ATTACHMENT_EDITABLE_STATUS = ["DRAFT", "REJECTED", "SUBMITTED"] as const;

/**
 * Anexa (ou substitui) o arquivo de um lançamento de horas. Só o próprio
 * consultor anexa, e só enquanto o lançamento é editável (período aberto e
 * status não-terminal). Validação de arquivo e autorização no servidor.
 */
export async function attachTimeEntryFile(
  formData: FormData,
): Promise<ActionResult<{ fileName: string }>> {
  try {
    ensureDatabase();
    const user = await requireUser();
    if (!isStorageConfigured()) {
      throw new ActionError(
        "NO_STORAGE",
        "Anexos indisponíveis: storage não configurado.",
      );
    }
    const consultant = await requireConsultant(user);
    const parsed = parseInput(attachmentIdSchema, { id: formData.get("id") });

    const file = formData.get("file");
    if (!(file instanceof File)) {
      throw new ActionError("INVALID_FILE", "Nenhum arquivo enviado.");
    }
    const invalid = validateReceiptFile({
      name: file.name,
      type: file.type,
      size: file.size,
    });
    if (invalid) throw new ActionError(invalid.code, invalid.message);

    const entry = await prisma.timeEntry.findUnique({
      where: { id: parsed.id },
      select: {
        consultantId: true,
        status: true,
        period: { select: { status: true } },
        attachment: { select: { storageKey: true } },
      },
    });
    if (!entry) throw new ActionError("NOT_FOUND", "Lançamento não encontrado.");
    if (entry.consultantId !== consultant.id) {
      throw new ActionError(
        "FORBIDDEN",
        "Você só pode anexar nos seus próprios lançamentos.",
      );
    }
    if (entry.period.status === "CLOSED") {
      throw new ActionError(
        "PERIOD_CLOSED",
        "Esta semana já foi fechada e não aceita alterações.",
      );
    }
    if (
      !(ATTACHMENT_EDITABLE_STATUS as readonly string[]).includes(entry.status)
    ) {
      throw new ActionError(
        "ATTACHMENT_LOCKED",
        "Lançamento aprovado ou fechado: anexo bloqueado.",
      );
    }
    const dbUser = await resolveDbUser(user);

    const provider = getStorageProvider(ONCALL_APPROVALS_BUCKET)!;
    const storageKey = buildTimeEntryAttachmentKey(parsed.id, file.name);
    await provider.upload(storageKey, await file.arrayBuffer(), file.type);

    const previousKey = entry.attachment?.storageKey ?? null;
    const data = {
      fileName: file.name,
      contentType: file.type,
      size: file.size,
      storageBucket: ONCALL_APPROVALS_BUCKET,
      storageKey,
      uploadedByUserId: dbUser?.id ?? null,
    };
    try {
      await prisma.$transaction(async (tx) => {
        // Re-check the editable status inside the transaction to avoid racing a
        // decision/closing between the read and the write.
        const guard = await tx.timeEntry.updateMany({
          where: {
            id: parsed.id,
            status: { in: [...ATTACHMENT_EDITABLE_STATUS] },
          },
          data: { updatedAt: new Date() },
        });
        if (guard.count !== 1) {
          throw new ActionError(
            "ATTACHMENT_LOCKED",
            "Lançamento aprovado ou fechado: anexo bloqueado.",
          );
        }
        await tx.timeEntryAttachment.upsert({
          where: { timeEntryId: parsed.id },
          update: data,
          create: { timeEntryId: parsed.id, ...data },
        });
        await tx.auditEvent.create({
          data: buildAuditEventData({
            actorUserId: dbUser?.id ?? null,
            entityType: "TimeEntry",
            entityId: parsed.id,
            action: "TIME_ENTRY_ATTACHMENT_ADDED",
            after: { fileName: file.name, size: file.size },
          }),
        });
      });
    } catch (error) {
      // Orphan-object cleanup: the row write failed, so remove the uploaded file.
      try {
        await provider.delete(storageKey);
      } catch (cleanup) {
        console.error("[horas] failed to clean up attachment object", cleanup);
      }
      throw error;
    }
    if (previousKey && previousKey !== storageKey) {
      try {
        await provider.delete(previousKey);
      } catch (e) {
        console.error("[horas] failed to delete replaced attachment", e);
      }
    }

    revalidatePath(HORAS_PATH);
    return { ok: true, data: { fileName: file.name } };
  } catch (error) {
    return toFailure(error);
  }
}

/**
 * Short-lived signed URL for a lançamento's attachment. Visível ao próprio
 * consultor e aos papéis de gestão/financeiro. Anti-enumeração: a mesma resposta
 * para lançamento inexistente e sem acesso.
 */
export async function getTimeEntryAttachmentUrl(
  input: z.infer<typeof attachmentIdSchema>,
): Promise<ActionResult<{ url: string }>> {
  try {
    ensureDatabase();
    const user = await requireUser();
    const parsed = parseInput(attachmentIdSchema, input);
    const consultant = await getConsultantForUser(user);
    const isViewer = ATTACHMENT_VIEW_ROLES.some((r) => user.roles.includes(r));

    const entry = await prisma.timeEntry.findUnique({
      where: { id: parsed.id },
      select: {
        consultantId: true,
        attachment: { select: { storageKey: true, storageBucket: true } },
      },
    });
    const allowed =
      entry &&
      (isViewer || (consultant && entry.consultantId === consultant.id));
    if (!entry || !allowed || !entry.attachment) {
      throw new ActionError("NOT_FOUND", "Anexo não encontrado.");
    }
    const provider = getStorageProvider(
      entry.attachment.storageBucket || ONCALL_APPROVALS_BUCKET,
    );
    if (!provider) {
      throw new ActionError("NO_STORAGE", "Storage não configurado.");
    }
    const url = await provider.getSignedUrl(entry.attachment.storageKey, 300);
    return { ok: true, data: { url } };
  } catch (error) {
    return toFailure(error);
  }
}

/**
 * Remove o anexo de um lançamento (somente o dono, somente enquanto editável).
 * Apaga a linha e o objeto de storage.
 */
export async function removeTimeEntryAttachment(
  input: z.infer<typeof attachmentIdSchema>,
): Promise<ActionResult<{ id: string }>> {
  try {
    ensureDatabase();
    const user = await requireUser();
    const consultant = await requireConsultant(user);
    const parsed = parseInput(attachmentIdSchema, input);

    const entry = await prisma.timeEntry.findUnique({
      where: { id: parsed.id },
      select: {
        consultantId: true,
        status: true,
        period: { select: { status: true } },
        attachment: { select: { storageKey: true } },
      },
    });
    if (!entry) throw new ActionError("NOT_FOUND", "Lançamento não encontrado.");
    if (entry.consultantId !== consultant.id) {
      throw new ActionError(
        "FORBIDDEN",
        "Você só pode remover anexos dos seus próprios lançamentos.",
      );
    }
    if (!entry.attachment) {
      throw new ActionError("NOT_FOUND", "Anexo não encontrado.");
    }
    if (entry.period.status === "CLOSED") {
      throw new ActionError(
        "PERIOD_CLOSED",
        "Esta semana já foi fechada e não aceita alterações.",
      );
    }
    if (
      !(ATTACHMENT_EDITABLE_STATUS as readonly string[]).includes(entry.status)
    ) {
      throw new ActionError(
        "ATTACHMENT_LOCKED",
        "Lançamento aprovado ou fechado: anexo bloqueado.",
      );
    }
    const dbUser = await resolveDbUser(user);
    const storageKey = entry.attachment.storageKey;

    await prisma.$transaction(async (tx) => {
      await tx.timeEntryAttachment.delete({ where: { timeEntryId: parsed.id } });
      await tx.auditEvent.create({
        data: buildAuditEventData({
          actorUserId: dbUser?.id ?? null,
          entityType: "TimeEntry",
          entityId: parsed.id,
          action: "TIME_ENTRY_ATTACHMENT_REMOVED",
        }),
      });
    });
    const provider = getStorageProvider(ONCALL_APPROVALS_BUCKET);
    try {
      await provider?.delete(storageKey);
    } catch (e) {
      console.error("[horas] failed to delete attachment object", e);
    }

    revalidatePath(HORAS_PATH);
    return { ok: true, data: { id: parsed.id } };
  } catch (error) {
    return toFailure(error);
  }
}

// --- Anexo da justificativa de NÃO faturável (P9) ---------------------------
//
// Anexo OPCIONAL e DEDICADO que comprova a justificativa de "não faturável"
// (melhoria #9). Modelo próprio (TimeEntryBillableJustificationAttachment) em
// bucket privado dedicado — NUNCA reusa o anexo próprio do lançamento
// (TimeEntryAttachment). Só papéis de gestão anexam (foi um gestor que marcou o
// lançamento como não faturável). Degrade honesto: sem storage, a ação recusa
// com NO_STORAGE e o lançamento segue com o motivo textual persistido.

/** Papéis que podem anexar/gerir a justificativa (mesma autoridade do billable). */
const BILLABLE_JUSTIFICATION_ROLES = [
  "ADMIN",
  "AREA_MANAGER",
  "PROJECT_MANAGER",
  "FINANCE",
] as const;

function buildBillableJustificationKey(entryId: string, fileName: string): string {
  const ts = new Date()
    .toISOString()
    .replace(/[-:]/g, "")
    .replace(/\.\d+Z$/, "Z");
  return `billable-justifications/${entryId}/${ts}-${safeFileName(fileName)}`;
}

/**
 * Anexa (ou substitui) o arquivo que comprova a justificativa de NÃO faturável
 * de um lançamento. Só papéis de gestão, só enquanto o lançamento é editável e
 * apenas quando o lançamento está de fato NÃO faturável (billable=false). O
 * anexo é aplicado APÓS o save (com o id retornado), como o anexo próprio.
 */
export async function attachBillableJustificationFile(
  formData: FormData,
): Promise<ActionResult<{ fileName: string }>> {
  try {
    ensureDatabase();
    const user = await requireRole([...BILLABLE_JUSTIFICATION_ROLES]);
    if (!isStorageConfigured()) {
      throw new ActionError(
        "NO_STORAGE",
        "Anexos indisponíveis: storage não configurado. A justificativa textual foi registrada.",
      );
    }
    const parsed = parseInput(attachmentIdSchema, { id: formData.get("id") });

    const file = formData.get("file");
    if (!(file instanceof File)) {
      throw new ActionError("INVALID_FILE", "Nenhum arquivo enviado.");
    }
    const invalid = validateReceiptFile({
      name: file.name,
      type: file.type,
      size: file.size,
    });
    if (invalid) throw new ActionError(invalid.code, invalid.message);

    const entry = await prisma.timeEntry.findUnique({
      where: { id: parsed.id },
      select: {
        status: true,
        billable: true,
        period: { select: { status: true } },
        billableJustificationAttachment: { select: { storageKey: true } },
      },
    });
    if (!entry) throw new ActionError("NOT_FOUND", "Lançamento não encontrado.");
    if (entry.billable) {
      throw new ActionError(
        "INVALID_INPUT",
        "O anexo de justificativa só se aplica a lançamentos não faturáveis.",
      );
    }
    if (entry.period.status === "CLOSED") {
      throw new ActionError(
        "PERIOD_CLOSED",
        "Esta semana já foi fechada e não aceita alterações.",
      );
    }
    if (
      !(ATTACHMENT_EDITABLE_STATUS as readonly string[]).includes(entry.status)
    ) {
      throw new ActionError(
        "ATTACHMENT_LOCKED",
        "Lançamento aprovado ou fechado: anexo bloqueado.",
      );
    }
    const dbUser = await resolveDbUser(user);

    const provider = getStorageProvider(BILLABLE_JUSTIFICATION_BUCKET)!;
    const storageKey = buildBillableJustificationKey(parsed.id, file.name);
    await provider.upload(storageKey, await file.arrayBuffer(), file.type);

    const previousKey =
      entry.billableJustificationAttachment?.storageKey ?? null;
    const data = {
      fileName: file.name,
      contentType: file.type,
      size: file.size,
      storageBucket: BILLABLE_JUSTIFICATION_BUCKET,
      storageKey,
      uploadedByUserId: dbUser?.id ?? null,
    };
    try {
      await prisma.$transaction(async (tx) => {
        const guard = await tx.timeEntry.updateMany({
          where: {
            id: parsed.id,
            billable: false,
            status: { in: [...ATTACHMENT_EDITABLE_STATUS] },
          },
          data: { updatedAt: new Date() },
        });
        if (guard.count !== 1) {
          throw new ActionError(
            "ATTACHMENT_LOCKED",
            "Lançamento aprovado, fechado ou faturável: anexo bloqueado.",
          );
        }
        await tx.timeEntryBillableJustificationAttachment.upsert({
          where: { timeEntryId: parsed.id },
          update: data,
          create: { timeEntryId: parsed.id, ...data },
        });
        await tx.auditEvent.create({
          data: buildAuditEventData({
            actorUserId: dbUser?.id ?? null,
            entityType: "TimeEntry",
            entityId: parsed.id,
            action: "TIME_ENTRY_BILLABLE_JUSTIFICATION_ATTACHED",
            after: { fileName: file.name, size: file.size },
          }),
        });
      });
    } catch (error) {
      try {
        await provider.delete(storageKey);
      } catch (cleanup) {
        console.error(
          "[horas] failed to clean up justification object",
          cleanup,
        );
      }
      throw error;
    }
    if (previousKey && previousKey !== storageKey) {
      try {
        await provider.delete(previousKey);
      } catch (e) {
        console.error("[horas] failed to delete replaced justification", e);
      }
    }

    revalidatePath(HORAS_PATH);
    return { ok: true, data: { fileName: file.name } };
  } catch (error) {
    return toFailure(error);
  }
}

/**
 * Short-lived signed URL for a lançamento's non-billable justification
 * attachment. Visível ao próprio consultor e aos papéis de gestão/financeiro.
 */
export async function getBillableJustificationUrl(
  input: z.infer<typeof attachmentIdSchema>,
): Promise<ActionResult<{ url: string }>> {
  try {
    ensureDatabase();
    const user = await requireUser();
    const parsed = parseInput(attachmentIdSchema, input);
    const consultant = await getConsultantForUser(user);
    const isViewer = ATTACHMENT_VIEW_ROLES.some((r) => user.roles.includes(r));

    const entry = await prisma.timeEntry.findUnique({
      where: { id: parsed.id },
      select: {
        consultantId: true,
        billable: true,
        billableJustificationAttachment: {
          select: { storageKey: true, storageBucket: true },
        },
      },
    });
    const allowed =
      entry &&
      (isViewer || (consultant && entry.consultantId === consultant.id));
    // Recusa também quando o lançamento voltou a ser faturável: um comprovante
    // de "não faturável" não deve ser servível nesse estado (defesa extra além
    // da limpeza feita no updateTimeEntry).
    if (
      !entry ||
      !allowed ||
      entry.billable ||
      !entry.billableJustificationAttachment
    ) {
      throw new ActionError("NOT_FOUND", "Anexo não encontrado.");
    }
    const provider = getStorageProvider(
      entry.billableJustificationAttachment.storageBucket ||
        BILLABLE_JUSTIFICATION_BUCKET,
    );
    if (!provider) {
      throw new ActionError("NO_STORAGE", "Storage não configurado.");
    }
    const url = await provider.getSignedUrl(
      entry.billableJustificationAttachment.storageKey,
      300,
    );
    return { ok: true, data: { url } };
  } catch (error) {
    return toFailure(error);
  }
}

// --- Transcrição por voz da descrição (Melhoria #3) -------------------------
//
// Recebe um áudio gravado no cliente (MediaRecorder) e devolve só o texto
// transcrito para o formulário preencher a Descrição. NÃO persiste nada: é um
// utilitário de preenchimento. A autorização é server-side (requireUser); a
// regra de flag/provider/limite vive no seam (transcribeAudio), que degrada
// honesto quando desativado ou sem provider.

/**
 * Transcreve o áudio enviado (FormData com um Blob no campo `audio`). Aceita o
 * mimeType do próprio Blob. Não grava nada — devolve o texto para o cliente.
 */
export async function transcribeActivityAudio(
  formData: FormData,
): Promise<TranscribeActivityAudioResult> {
  try {
    // Autorização: qualquer usuário autenticado pode transcrever a própria fala
    // que vai digitar na descrição. Sem persistência, sem escopo de consultor.
    await requireUser();

    const audio = formData.get("audio");
    if (!(audio instanceof Blob)) {
      return {
        ok: false,
        reason: "INVALID_SIZE",
        message: "Nenhum áudio enviado.",
      };
    }
    if (audio.size <= 0) {
      return { ok: false, reason: "INVALID_SIZE", message: "Áudio vazio." };
    }
    // Teto da feature: corta ANTES de materializar/encodar o buffer. Evita o
    // NO_RESULT confuso do inline do Gemini para áudio longo e dá uma mensagem
    // acionável. O MAX_AUDIO_BYTES (25 MB) do seam segue como defesa-em-
    // profundidade lá dentro, mas a action corta bem antes.
    if (audio.size > ACTIVITY_AUDIO_MAX_BYTES) {
      return {
        ok: false,
        reason: "AUDIO_TOO_LONG",
        message: `Áudio muito longo (limite de ${Math.floor(ACTIVITY_AUDIO_MAX_BYTES / (1024 * 1024))} MB). Grave um trecho menor.`,
      };
    }

    // MediaRecorder costuma anexar codecs ao mimeType (ex. "audio/webm;codecs=opus").
    // O seam valida contra a allow-list pelo tipo base, então enviamos só ele.
    const mimeType = (audio.type || "audio/webm").split(";")[0].trim();
    const buffer = Buffer.from(await audio.arrayBuffer());

    const outcome = await transcribeAudio({
      audio: buffer,
      mimeType,
      languageHint: "pt-BR",
      entityType: "TimeEntry",
    });

    if (outcome.ok) {
      return { ok: true, text: outcome.text };
    }
    return { ok: false, reason: outcome.reason, message: outcome.message };
  } catch (error) {
    // Never throw to the client; mirror toFailure's framework-error guard.
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
    console.error("[horas] transcribeActivityAudio error", error);
    return {
      ok: false,
      reason: "UNEXPECTED",
      message: "Não foi possível transcrever o áudio.",
    };
  }
}
