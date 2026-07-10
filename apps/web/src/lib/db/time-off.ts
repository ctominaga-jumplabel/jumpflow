import { prisma, Prisma } from "@jumpflow/database";
import {
  buildMaterializationPlan,
  collectWorkdayConflicts,
  computeWorkingDays,
  type AllocationForMaterialization,
  type MaterializationPlan,
  type TimeOffKind,
  type TimeOffLookup,
} from "@/lib/timesheet/time-off";
import { getHolidayLookup } from "./timesheet";
import { addDays, startOfUtcDay, toIsoDate, weekStartOf } from "@/lib/timesheet/week";

/**
 * Camada de leitura/preparação do fluxo de ausência (Onda D/ausência-backend).
 *
 * Assume banco configurado — os chamadores guardam com `isDatabaseConfigured()`.
 * A lógica de negócio é PURA (`lib/timesheet/time-off`); aqui só carregamos e
 * moldamos dados do Prisma.
 */

type Db = Prisma.TransactionClient | typeof prisma;

/**
 * Conjunto de datas-feriado (ISO) aplicáveis ao consultor no intervalo, para o
 * cálculo de dias úteis. Considera feriados GLOBAIS + os feriados vinculados a
 * QUALQUER projeto em que o consultor tem alocação ativa que cobre a data.
 * Reusa o `getHolidayLookup` (mesmo lookup da grade), preservando a semântica de
 * aplicabilidade de `HolidayProject`.
 */
export async function getHolidayDatesForConsultant(
  consultantId: string,
  start: Date,
  end: Date,
): Promise<Set<string>> {
  const [lookup, allocations] = await Promise.all([
    getHolidayLookup(start, end),
    prisma.allocation.findMany({
      where: {
        consultantId,
        status: "ACTIVE",
        startDate: { lte: startOfUtcDay(end) },
        OR: [{ endDate: null }, { endDate: { gte: startOfUtcDay(start) } }],
      },
      select: { projectId: true },
    }),
  ]);
  const projectIds = new Set(allocations.map((a) => a.projectId));
  const dates = new Set<string>(Object.keys(lookup.global));
  for (const [projectId, byDate] of Object.entries(lookup.byProject)) {
    if (!projectIds.has(projectId)) continue;
    for (const iso of Object.keys(byDate)) dates.add(iso);
  }
  return dates;
}

/**
 * Dias úteis de uma ausência (exclui fim de semana e feriados aplicáveis ao
 * consultor). Base para `workingDays` na solicitação e para a materialização.
 */
export async function computeTimeOffWorkingDays(
  consultantId: string,
  start: Date,
  end: Date,
): Promise<{ count: number; dates: string[] }> {
  const holidays = await getHolidayDatesForConsultant(consultantId, start, end);
  return computeWorkingDays(start, end, holidays);
}

/**
 * Alocações ATIVAS do consultor que cobrem qualquer parte do intervalo, já com
 * `hoursPerDay` (do TimesheetDefault) e `billDuringVacation` (do projeto),
 * prontas para `buildMaterializationPlan`.
 */
export async function loadAllocationsForMaterialization(
  db: Db,
  consultantId: string,
  start: Date,
  end: Date,
): Promise<AllocationForMaterialization[]> {
  const allocations = await db.allocation.findMany({
    where: {
      consultantId,
      status: "ACTIVE",
      startDate: { lte: startOfUtcDay(end) },
      OR: [{ endDate: null }, { endDate: { gte: startOfUtcDay(start) } }],
      project: { status: { not: "CLOSED" } },
    },
    select: {
      id: true,
      projectId: true,
      allocationPercent: true,
      startDate: true,
      endDate: true,
      timesheetDefault: { select: { hoursPerDay: true } },
      project: { select: { billingConfig: { select: { billDuringVacation: true } } } },
    },
  });
  return allocations.map((a) => ({
    allocationId: a.id,
    projectId: a.projectId,
    allocationPercent: a.allocationPercent,
    startDate: a.startDate,
    endDate: a.endDate,
    hoursPerDay: a.timesheetDefault
      ? Number(a.timesheetDefault.hoursPerDay)
      : null,
    // Default do schema é true; sem ProjectBillingConfig assumimos o mesmo.
    billDuringVacation: a.project.billingConfig?.billDuringVacation ?? true,
  }));
}

/**
 * Plano de materialização para uma ausência já resolvida (dias úteis + kind).
 * Puro sobre os dados carregados; a persistência é feita pela action.
 */
export async function planTimeOffMaterialization(
  db: Db,
  input: {
    consultantId: string;
    kind: TimeOffKind;
    start: Date;
    end: Date;
    workingDates: string[];
  },
): Promise<MaterializationPlan> {
  const allocations = await loadAllocationsForMaterialization(
    db,
    input.consultantId,
    input.start,
    input.end,
  );
  return buildMaterializationPlan({
    kind: input.kind,
    workingDates: input.workingDates,
    allocations,
  });
}

/**
 * Datas de conflito: dias com lançamento de DIA ÚTIL (WORKDAY) já existente do
 * consultor dentro do intervalo. A aprovação é bloqueada quando não vazio.
 */
export async function findWorkdayConflicts(
  db: Db,
  consultantId: string,
  start: Date,
  end: Date,
  isoDates: string[],
): Promise<string[]> {
  const entries = await db.timeEntry.findMany({
    where: {
      consultantId,
      activityType: "WORKDAY",
      date: { gte: startOfUtcDay(start), lte: startOfUtcDay(end) },
    },
    select: { date: true },
  });
  const existing = entries.map((e) => toIsoDate(e.date));
  return collectWorkdayConflicts(existing, isoDates);
}

/**
 * Ausências CONFIRMED do consultor que cobrem uma data específica (guarda
 * server-side no POST de WORKDAY em horas/actions). Uma única query.
 */
export async function findConfirmedTimeOffCovering(
  db: Db,
  consultantId: string,
  date: Date,
): Promise<{ id: string; kind: TimeOffKind } | null> {
  const day = startOfUtcDay(date);
  const found = await db.consultantTimeOff.findFirst({
    where: {
      consultantId,
      status: "CONFIRMED",
      startDate: { lte: day },
      endDate: { gte: day },
    },
    select: { id: true, kind: true },
  });
  return found ? { id: found.id, kind: found.kind as TimeOffKind } : null;
}

/**
 * Lookup de ausências do consultor num intervalo (CONFIRMED + REQUESTED), no
 * mesmo espírito do lookup de feriados: `ISO date -> info`. Consumido pela UI
 * (D/3b). CONFIRMED tem precedência sobre REQUESTED numa mesma data.
 */
export async function getTimeOffLookup(
  consultantId: string,
  start: Date,
  end: Date,
): Promise<TimeOffLookup> {
  const from = startOfUtcDay(start);
  const to = startOfUtcDay(end);
  const timeOffs = await prisma.consultantTimeOff.findMany({
    where: {
      consultantId,
      status: { in: ["CONFIRMED", "REQUESTED"] },
      // Sobreposição de intervalos: começa antes/na data final E termina depois/na inicial.
      startDate: { lte: to },
      endDate: { gte: from },
    },
    select: {
      id: true,
      kind: true,
      paid: true,
      status: true,
      startDate: true,
      endDate: true,
    },
    // CONFIRMED por último para vencer o byDate na colisão de datas.
    orderBy: { status: "asc" },
  });

  const byDate: TimeOffLookup["byDate"] = {};
  for (const off of timeOffs) {
    const info = {
      timeOffId: off.id,
      kind: off.kind as TimeOffKind,
      paid: off.paid,
      status: off.status as TimeOffLookup["byDate"][string]["status"],
    };
    const rangeStart = off.startDate.getTime() < from.getTime() ? from : startOfUtcDay(off.startDate);
    const rangeEnd = off.endDate.getTime() > to.getTime() ? to : startOfUtcDay(off.endDate);
    for (
      let cursor = rangeStart;
      cursor.getTime() <= rangeEnd.getTime();
      cursor = addDays(cursor, 1)
    ) {
      const iso = toIsoDate(cursor);
      const current = byDate[iso];
      // CONFIRMED vence REQUESTED numa mesma data.
      if (!current || (current.status !== "CONFIRMED" && info.status === "CONFIRMED")) {
        byDate[iso] = info;
      }
    }
  }
  return { byDate };
}

/** Período semanal (upsert aberto) para materializar um TimeEntry numa data. */
export async function ensureOpenPeriodForDate(
  tx: Prisma.TransactionClient,
  consultantId: string,
  date: Date,
): Promise<{ id: string; status: string } | null> {
  const startDate = weekStartOf(date);
  const endDate = addDays(startDate, 6);
  const where = {
    consultantId_startDate_endDate: { consultantId, startDate, endDate },
  };
  const existing = await tx.timesheetPeriod.findUnique({ where });
  // Semana fechada: não materializamos nela (a action sinaliza/pula).
  if (existing?.status === "CLOSED") return null;
  if (existing) return { id: existing.id, status: existing.status };
  const created = await tx.timesheetPeriod.upsert({
    where,
    update: {},
    create: { consultantId, startDate, endDate, status: "DRAFT" },
  });
  return { id: created.id, status: created.status };
}
