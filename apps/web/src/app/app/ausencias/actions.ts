"use server";

import { revalidatePath } from "next/cache";
import { prisma, Prisma } from "@jumpflow/database";
import { type ZodType } from "zod";
import { isDevAuthEnabled } from "@/lib/auth/dev";
import { requireRole, requireUser, hasRole } from "@/lib/auth/guards";
import type { AppUser } from "@/lib/auth/types";
import type { ActionResult, ErrorCode } from "@/lib/actions/result";
import { buildAuditEventData } from "@/lib/db/audit";
import { isDatabaseConfigured } from "@/lib/db/config";
import {
  getConsultantForUser,
  recomputePeriodStatus,
} from "@/lib/db/timesheet";
import { resolveDbUser } from "@/lib/db/users";
import {
  computeTimeOffWorkingDays,
  ensureOpenPeriodForDate,
  findWorkdayConflicts,
  planTimeOffMaterialization,
} from "@/lib/db/time-off";
import {
  computeLedgerDebit,
  computeLedgerReversal,
  resolveTimeOffPaid,
  timeOffKindLabel,
  type TimeOffKind,
} from "@/lib/timesheet/time-off";
import {
  cancelTimeOffSchema,
  decideTimeOffSchema,
  requestTimeOffSchema,
  TIME_OFF_REJECT_COMMENT_REQUIRED,
  type CancelTimeOffInput,
  type DecideTimeOffInput,
  type RequestTimeOffInput,
} from "@/lib/timesheet/time-off-schemas";
import { parseIsoDateUtc } from "@/lib/timesheet/week";

/**
 * Server actions do fluxo de Ausência remunerada (Onda D/ausência-backend):
 * solicitação (consultor) → decisão (People) → materialização + débito de saldo.
 * A lógica de negócio é pura (`lib/timesheet/time-off`); estas actions só
 * orquestram autorização, transação e auditoria (padrão de horas/actions).
 *
 * Toda action devolve `ActionResult` (nunca lança para o cliente) e revalida as
 * rotas afetadas.
 */

const AUSENCIAS_PATH = "/app/ausencias";
const HORAS_PATH = "/app/horas";
const APROVACOES_PATH = "/app/aprovacoes";

/** Papéis que decidem/gerenciam ausências (gate People). */
const TIME_OFF_MANAGER_ROLES = ["ADMIN", "PEOPLE"] as const;

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

function parseInput<T>(schema: ZodType<T>, input: unknown): T {
  const result = schema.safeParse(input);
  if (!result.success) {
    const issue = result.error.issues[0];
    const message = issue?.message ?? "Dados inválidos.";
    throw new ActionError(
      message === TIME_OFF_REJECT_COMMENT_REQUIRED
        ? "COMMENT_REQUIRED"
        : "INVALID_INPUT",
      message,
    );
  }
  return result.data;
}

function toFailure(error: unknown): ActionResult<never> {
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
  console.error("[ausencias] unexpected action error", error);
  return {
    ok: false,
    error: "UNEXPECTED",
    message: "Erro inesperado. Tente novamente.",
  };
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
  const dbUser = await resolveDbUser(user);
  if (!dbUser) {
    throw new ActionError(
      "FORBIDDEN",
      "Usuário não encontrado no banco de dados.",
    );
  }
  return dbUser;
}

// ---------------------------------------------------------------------------
// requestTimeOff — consultor solicita uma ausência.
// ---------------------------------------------------------------------------
export async function requestTimeOff(
  input: RequestTimeOffInput,
): Promise<ActionResult<{ id: string; workingDays: number }>> {
  try {
    ensureDatabase();
    const user = await requireUser();
    const consultant = await requireConsultant(user);
    const parsed = parseInput(requestTimeOffSchema, input);
    const dbUser = await requireDbUser(user);

    const start = parseIsoDateUtc(parsed.startDate)!;
    const end = parseIsoDateUtc(parsed.endDate)!;
    const kind = parsed.kind as TimeOffKind;
    const paid = resolveTimeOffPaid(kind);
    // Dias úteis já excluem fim de semana E feriados aplicáveis ao consultor.
    const { count: workingDays } = await computeTimeOffWorkingDays(
      consultant.id,
      start,
      end,
    );
    // vacationId só faz sentido em férias (débito de saldo).
    const vacationId = kind === "VACATION" ? (parsed.vacationId ?? null) : null;

    const now = new Date();
    const created = await prisma.$transaction(async (tx) => {
      const timeOff = await tx.consultantTimeOff.create({
        data: {
          consultantId: consultant.id,
          kind,
          startDate: start,
          endDate: end,
          status: "REQUESTED",
          note: parsed.note,
          paid,
          requestedByUserId: dbUser.id,
          requestedAt: now,
          workingDays,
          vacationId,
        },
      });
      await tx.auditEvent.create({
        data: buildAuditEventData({
          actorUserId: dbUser.id,
          entityType: "ConsultantTimeOff",
          entityId: timeOff.id,
          action: "TIME_OFF_REQUESTED",
          after: {
            kind,
            paid,
            startDate: parsed.startDate,
            endDate: parsed.endDate,
            workingDays,
          },
        }),
      });
      return timeOff;
    });

    // GANCHO DE NOTIFICAÇÃO (best-effort): avisar People do novo pedido. Exige um
    // novo evento (ex.: "TIME_OFF_REQUESTED") + NotificationRule semeada; como
    // isso demanda seed/migração, fica como gancho — ver relatório da D/3b.
    // await notifyTimeOffRequested(created.id);

    revalidatePath(AUSENCIAS_PATH);
    return { ok: true, data: { id: created.id, workingDays } };
  } catch (error) {
    return toFailure(error);
  }
}

// ---------------------------------------------------------------------------
// decideTimeOff — People aprova/reprova. Aprovar materializa + debita saldo.
// ---------------------------------------------------------------------------
export async function decideTimeOff(
  input: DecideTimeOffInput,
): Promise<ActionResult<{ id: string; generatedEntries: number }>> {
  try {
    ensureDatabase();
    const user = await requireRole([...TIME_OFF_MANAGER_ROLES]);
    const parsed = parseInput(decideTimeOffSchema, input);
    const dbUser = await requireDbUser(user);

    const timeOff = await prisma.consultantTimeOff.findUnique({
      where: { id: parsed.id },
      include: {
        consultant: { select: { userId: true, email: true } },
        vacation: {
          select: { id: true, balanceDays: true, takenDays: true },
        },
      },
    });
    if (!timeOff) {
      throw new ActionError("NOT_FOUND", "Ausência não encontrada.");
    }
    // Idempotência: só decidimos um pedido ainda REQUESTED.
    if (timeOff.status !== "REQUESTED") {
      throw new ActionError(
        "ALREADY_DECIDED",
        "Esta ausência já foi decidida ou não está pendente.",
      );
    }

    // Segregação de funções: quem decide não pode ser o próprio consultor da
    // ausência (ADMIN é isento — operação pequena). Em dev auth o id de sessão
    // nunca casa com as linhas, então também comparamos o e-mail.
    if (!user.roles.includes("ADMIN")) {
      const sameUser = timeOff.consultant.userId === dbUser.id;
      const sameDevEmail =
        isDevAuthEnabled() &&
        timeOff.consultant.email.toLowerCase() ===
          user.email.trim().toLowerCase();
      if (sameUser || sameDevEmail) {
        throw new ActionError(
          "SELF_APPROVAL",
          "Você não pode decidir a sua própria ausência.",
        );
      }
    }

    const kindLabel = timeOffKindLabel(timeOff.kind as TimeOffKind);
    const now = new Date();

    // --- REPROVAÇÃO ---------------------------------------------------------
    if (!parsed.approve) {
      await prisma.$transaction(async (tx) => {
        const updated = await tx.consultantTimeOff.updateMany({
          where: { id: timeOff.id, status: "REQUESTED" },
          data: {
            status: "REJECTED",
            approvedByUserId: dbUser.id,
            decidedAt: now,
            decisionComment: parsed.comment,
          },
        });
        if (updated.count !== 1) {
          throw new ActionError(
            "ALREADY_DECIDED",
            "Esta ausência já foi decidida.",
          );
        }
        await tx.approval.create({
          data: {
            entityType: "TIME_OFF",
            entityId: timeOff.id,
            approverUserId: dbUser.id,
            status: "REJECTED",
            comment: parsed.comment,
            isAutomatic: false,
          },
        });
        await tx.auditEvent.create({
          data: buildAuditEventData({
            actorUserId: dbUser.id,
            entityType: "ConsultantTimeOff",
            entityId: timeOff.id,
            action: "TIME_OFF_REJECTED",
            before: { status: "REQUESTED" },
            after: { status: "REJECTED", comment: parsed.comment },
          }),
        });
      });
      revalidatePath(AUSENCIAS_PATH);
      return { ok: true, data: { id: timeOff.id, generatedEntries: 0 } };
    }

    // --- APROVAÇÃO ----------------------------------------------------------
    const start = timeOff.startDate;
    const end = timeOff.endDate;
    const { count: workingDays, dates: workingDates } =
      await computeTimeOffWorkingDays(timeOff.consultantId, start, end);

    // Guarda de conflito: não sobrepor ausência a DIA ÚTIL já apontado.
    const conflicts = await findWorkdayConflicts(
      prisma,
      timeOff.consultantId,
      start,
      end,
      workingDates,
    );
    if (conflicts.length > 0) {
      throw new ActionError(
        "WORKDAY_CONFLICT",
        `Há lançamentos de Dia Útil nas datas: ${conflicts.join(", ")}. Ajuste-os antes de aprovar a ausência.`,
      );
    }

    // Ledger de férias: bloquear se dias > saldo. Só quando há vínculo de saldo.
    const debitVacation =
      timeOff.kind === "VACATION" && timeOff.vacation ? timeOff.vacation : null;
    if (debitVacation) {
      const debit = computeLedgerDebit(
        debitVacation.balanceDays,
        debitVacation.takenDays,
        workingDays,
      );
      if (!debit.ok) {
        throw new ActionError(
          "INSUFFICIENT_BALANCE",
          `Saldo de férias insuficiente: ${workingDays} dia(s) úteis solicitados, ${debitVacation.balanceDays} disponível(is).`,
        );
      }
    }

    // Plano de materialização (apenas ausência REMUNERADA gera lançamento).
    const plan = timeOff.paid
      ? await planTimeOffMaterialization(prisma, {
          consultantId: timeOff.consultantId,
          kind: timeOff.kind as TimeOffKind,
          start,
          end,
          workingDates,
        })
      : { entries: [], usedFallback: false, noActiveAllocation: true };

    let generatedEntries = 0;
    const applied = await prisma.$transaction(async (tx) => {
      // Idempotência: só a transição REQUESTED→CONFIRMED materializa.
      const updated = await tx.consultantTimeOff.updateMany({
        where: { id: timeOff.id, status: "REQUESTED" },
        data: {
          status: "CONFIRMED",
          approvedByUserId: dbUser.id,
          decidedAt: now,
          decisionComment: parsed.comment,
          workingDays,
        },
      });
      if (updated.count !== 1) return false;

      await tx.approval.create({
        data: {
          entityType: "TIME_OFF",
          entityId: timeOff.id,
          approverUserId: dbUser.id,
          status: "APPROVED",
          comment: parsed.comment,
          isAutomatic: false,
        },
      });

      // Materialização: 1 TimeEntry APPROVED por (dia útil, alocação), com
      // multiplier 1.00, timeOffId setado, billable = billDuringVacation.
      const touchedPeriods = new Set<string>();
      for (const entry of plan.entries) {
        const date = parseIsoDateUtc(entry.date)!;
        const period = await ensureOpenPeriodForDate(
          tx,
          timeOff.consultantId,
          date,
        );
        // Semana fechada: não materializa nela (sinalizado pela contagem).
        if (!period) continue;
        const saved = await tx.timeEntry.create({
          data: {
            periodId: period.id,
            consultantId: timeOff.consultantId,
            projectId: entry.projectId,
            allocationId: entry.allocationId,
            timeOffId: timeOff.id,
            date,
            hours: entry.hours,
            multiplier: new Prisma.Decimal(1),
            activityType: entry.activityType,
            description: `Ausência: ${kindLabel}`,
            billable: entry.billable,
            status: "APPROVED",
          },
        });
        await tx.approval.create({
          data: {
            entityType: "TIME_ENTRY",
            entityId: saved.id,
            approverUserId: dbUser.id,
            status: "APPROVED",
            isAutomatic: false,
          },
        });
        await tx.auditEvent.create({
          data: buildAuditEventData({
            actorUserId: dbUser.id,
            entityType: "TimeEntry",
            entityId: saved.id,
            action: "TIME_ENTRY_MATERIALIZED_FROM_TIME_OFF",
            after: {
              timeOffId: timeOff.id,
              date: entry.date,
              hours: entry.hours,
              activityType: entry.activityType,
              billable: entry.billable,
              fromFallback: entry.fromFallback,
            },
          }),
        });
        touchedPeriods.add(period.id);
        generatedEntries += 1;
      }
      for (const periodId of touchedPeriods) {
        await recomputePeriodStatus(tx, periodId);
      }

      // Débito do saldo de férias (na MESMA transação da confirmação).
      if (debitVacation) {
        const debit = computeLedgerDebit(
          debitVacation.balanceDays,
          debitVacation.takenDays,
          workingDays,
        );
        if (!debit.ok) {
          throw new ActionError(
            "INSUFFICIENT_BALANCE",
            "Saldo de férias insuficiente.",
          );
        }
        await tx.consultantVacation.update({
          where: { id: debitVacation.id },
          data: { balanceDays: debit.balanceDays, takenDays: debit.takenDays },
        });
        await tx.auditEvent.create({
          data: buildAuditEventData({
            actorUserId: dbUser.id,
            entityType: "ConsultantVacation",
            entityId: debitVacation.id,
            action: "VACATION_BALANCE_DEBITED",
            before: {
              balanceDays: debitVacation.balanceDays,
              takenDays: debitVacation.takenDays,
            },
            after: { balanceDays: debit.balanceDays, takenDays: debit.takenDays },
          }),
        });
      }

      await tx.auditEvent.create({
        data: buildAuditEventData({
          actorUserId: dbUser.id,
          entityType: "ConsultantTimeOff",
          entityId: timeOff.id,
          action: "TIME_OFF_CONFIRMED",
          before: { status: "REQUESTED" },
          after: {
            status: "CONFIRMED",
            workingDays,
            generatedEntries,
            usedFallback: plan.usedFallback,
            noActiveAllocation: plan.noActiveAllocation,
          },
        }),
      });
      return true;
    });

    if (!applied) {
      throw new ActionError("ALREADY_DECIDED", "Esta ausência já foi decidida.");
    }

    // GANCHO DE NOTIFICAÇÃO (best-effort): avisar o consultor da decisão. Requer
    // novo evento + NotificationRule semeada — ver relatório (deixado p/ D/3b).
    // await notifyTimeOffDecided(timeOff.id);

    revalidatePath(AUSENCIAS_PATH);
    revalidatePath(HORAS_PATH);
    revalidatePath(APROVACOES_PATH);
    return { ok: true, data: { id: timeOff.id, generatedEntries } };
  } catch (error) {
    return toFailure(error);
  }
}

// ---------------------------------------------------------------------------
// cancelTimeOff — dono ou People cancela. Se CONFIRMED, reverte tudo.
// ---------------------------------------------------------------------------
export async function cancelTimeOff(
  input: CancelTimeOffInput,
): Promise<ActionResult<{ id: string; revertedEntries: number }>> {
  try {
    ensureDatabase();
    const user = await requireUser();
    const parsed = parseInput(cancelTimeOffSchema, input);
    const dbUser = await requireDbUser(user);

    const timeOff = await prisma.consultantTimeOff.findUnique({
      where: { id: parsed.id },
      include: {
        consultant: { select: { id: true, userId: true, email: true } },
        vacation: {
          select: { id: true, balanceDays: true, takenDays: true },
        },
        generatedEntries: {
          select: { id: true, periodId: true, period: { select: { status: true } } },
        },
      },
    });
    if (!timeOff) {
      throw new ActionError("NOT_FOUND", "Ausência não encontrada.");
    }
    if (timeOff.status === "CANCELLED" || timeOff.status === "REJECTED") {
      throw new ActionError(
        "ALREADY_DECIDED",
        "Esta ausência já foi encerrada e não pode ser cancelada.",
      );
    }

    // Autorização: o próprio consultor OU um gestor de People/ADMIN.
    const consultant = await getConsultantForUser(user);
    const isOwner = consultant?.id === timeOff.consultantId;
    const isManager = hasRole(user, [...TIME_OFF_MANAGER_ROLES]);
    if (!isOwner && !isManager) {
      throw new ActionError(
        "FORBIDDEN",
        "Você não tem permissão para cancelar esta ausência.",
      );
    }

    const wasConfirmed = timeOff.status === "CONFIRMED";
    // Reversão de semana fechada é proibida: um lançamento materializado num
    // período CLOSED não pode ser removido.
    if (
      wasConfirmed &&
      timeOff.generatedEntries.some((e) => e.period.status === "CLOSED")
    ) {
      throw new ActionError(
        "PERIOD_CLOSED",
        "Há lançamentos desta ausência em semana já fechada. Reabra a semana antes de cancelar.",
      );
    }

    let revertedEntries = 0;
    await prisma.$transaction(async (tx) => {
      const updated = await tx.consultantTimeOff.updateMany({
        where: {
          id: timeOff.id,
          status: { in: ["REQUESTED", "PLANNED", "CONFIRMED"] },
        },
        data: {
          status: "CANCELLED",
          decisionComment: parsed.comment ?? timeOff.decisionComment,
        },
      });
      if (updated.count !== 1) {
        throw new ActionError(
          "ALREADY_DECIDED",
          "Esta ausência já foi encerrada.",
        );
      }

      if (wasConfirmed && timeOff.generatedEntries.length > 0) {
        const entryIds = timeOff.generatedEntries.map((e) => e.id);
        // Apaga as aprovações dessas entries (sem FK) e as próprias entries.
        await tx.approval.deleteMany({
          where: { entityType: "TIME_ENTRY", entityId: { in: entryIds } },
        });
        await tx.timeEntry.deleteMany({ where: { id: { in: entryIds } } });
        revertedEntries = entryIds.length;
        const periodIds = [
          ...new Set(timeOff.generatedEntries.map((e) => e.periodId)),
        ];
        for (const periodId of periodIds) {
          await recomputePeriodStatus(tx, periodId);
        }
      }

      // Estorno do saldo de férias (só se foi debitado, i.e. estava CONFIRMED).
      if (wasConfirmed && timeOff.kind === "VACATION" && timeOff.vacation) {
        const workingDays = timeOff.workingDays ?? 0;
        const reversal = computeLedgerReversal(
          timeOff.vacation.balanceDays,
          timeOff.vacation.takenDays,
          workingDays,
        );
        await tx.consultantVacation.update({
          where: { id: timeOff.vacation.id },
          data: {
            balanceDays: reversal.balanceDays,
            takenDays: reversal.takenDays,
          },
        });
        await tx.auditEvent.create({
          data: buildAuditEventData({
            actorUserId: dbUser.id,
            entityType: "ConsultantVacation",
            entityId: timeOff.vacation.id,
            action: "VACATION_BALANCE_REVERSED",
            before: {
              balanceDays: timeOff.vacation.balanceDays,
              takenDays: timeOff.vacation.takenDays,
            },
            after: {
              balanceDays: reversal.balanceDays,
              takenDays: reversal.takenDays,
            },
          }),
        });
      }

      await tx.auditEvent.create({
        data: buildAuditEventData({
          actorUserId: dbUser.id,
          entityType: "ConsultantTimeOff",
          entityId: timeOff.id,
          action: "TIME_OFF_CANCELLED",
          before: { status: timeOff.status },
          after: { status: "CANCELLED", revertedEntries },
        }),
      });
    });

    revalidatePath(AUSENCIAS_PATH);
    revalidatePath(HORAS_PATH);
    revalidatePath(APROVACOES_PATH);
    return { ok: true, data: { id: timeOff.id, revertedEntries } };
  } catch (error) {
    return toFailure(error);
  }
}
