/**
 * Regras PURAS do fluxo de ausência remunerada (Onda D/ausência-backend).
 *
 * Este módulo NÃO importa Prisma: contém apenas a lógica de negócio testável em
 * isolamento (cálculo de dias úteis, plano de materialização, débito/estorno de
 * saldo de férias, detecção de conflito). O servidor (`lib/db/time-off.ts` +
 * `app/ausencias/actions.ts`) carrega os dados, chama estas funções e persiste
 * numa transação.
 *
 * Convenção de datas: ISO `yyyy-mm-dd` (date-only) sobre campos UTC, coerente com
 * `TimeEntry.date`, `Holiday.date` e o lookup de feriados (`lib/timesheet/holidays`).
 */
import { activityLabelOf, type ActivityType } from "./types";
import { addDays, parseIsoDateUtc, startOfUtcDay, toIsoDate } from "./week";

/** Espelha `TimeOffKind` no schema (mantido como união local: módulo puro). */
export type TimeOffKind = "VACATION" | "LEAVE" | "OTHER";

/** Espelha `TimeOffStatus` no schema. */
export type TimeOffStatus =
  | "PLANNED"
  | "REQUESTED"
  | "CONFIRMED"
  | "REJECTED"
  | "CANCELLED";

/**
 * Mapa kind → `paid` (ausência remunerada?). Deriva o default do pedido:
 * - VACATION: sempre remunerada (débito no saldo de férias).
 * - LEAVE: licença REMUNERADA por padrão (ex.: paternidade/luto/júri).
 *   Licenças não remuneradas específicas ficam para uma futura granularidade de
 *   kind; hoje o gestor pode negar/ajustar na decisão.
 * - OTHER: não remunerada por padrão (falta/ausência sem vencimento).
 * `paid=false` NÃO materializa nenhum TimeEntry (o consultor não é pago no dia).
 */
export const PAID_BY_KIND: Record<TimeOffKind, boolean> = {
  VACATION: true,
  LEAVE: true,
  OTHER: false,
};

/**
 * Mapa kind → `activityType` do TimeEntry materializado. Alinhado ao catálogo de
 * `lib/timesheet/types` (VACATION/LEAVE/PAID_ABSENCE existem lá).
 */
export const ACTIVITY_TYPE_BY_KIND: Record<TimeOffKind, ActivityType> = {
  VACATION: "VACATION",
  LEAVE: "LEAVE",
  OTHER: "PAID_ABSENCE",
};

/** Horas padrão de um dia útil quando não há TimesheetDefault (fallback). */
export const FALLBACK_HOURS_PER_DAY = 8;

/** `paid` derivado do kind (default do pedido). */
export function resolveTimeOffPaid(kind: TimeOffKind): boolean {
  return PAID_BY_KIND[kind];
}

/** `activityType` do lançamento materializado, a partir do kind. */
export function resolveTimeOffActivityType(kind: TimeOffKind): ActivityType {
  return ACTIVITY_TYPE_BY_KIND[kind];
}

/** Rótulo pt-BR do tipo de ausência (reusa o catálogo de atividades). */
export function timeOffKindLabel(kind: TimeOffKind): string {
  return activityLabelOf(ACTIVITY_TYPE_BY_KIND[kind]);
}

/** Sábado (6) ou domingo (0) em UTC. */
export function isWeekendIso(iso: string): boolean {
  const date = parseIsoDateUtc(iso);
  if (!date) return false;
  const day = date.getUTCDay();
  return day === 0 || day === 6;
}

/**
 * Todas as datas ISO no intervalo [start, end] inclusivo, em UTC date-only.
 * Retorna `[]` se start > end.
 */
export function enumerateIsoDates(start: Date, end: Date): string[] {
  const from = startOfUtcDay(start);
  const to = startOfUtcDay(end);
  if (from.getTime() > to.getTime()) return [];
  const out: string[] = [];
  for (
    let cursor = from;
    cursor.getTime() <= to.getTime();
    cursor = addDays(cursor, 1)
  ) {
    out.push(toIsoDate(cursor));
  }
  return out;
}

export interface WorkingDaysResult {
  /** Quantidade de dias úteis (exclui fim de semana E feriados). */
  count: number;
  /** As datas ISO úteis, em ordem crescente. */
  dates: string[];
}

/**
 * Dias úteis no intervalo [start, end], excluindo fins de semana E feriados.
 * `holidayIsoDates` é o conjunto de datas-feriado aplicáveis (o chamador decide a
 * aplicabilidade: globais e/ou por projeto). Base para `workingDays` e para a
 * materialização.
 */
export function computeWorkingDays(
  start: Date,
  end: Date,
  holidayIsoDates: ReadonlySet<string>,
): WorkingDaysResult {
  const dates = enumerateIsoDates(start, end).filter(
    (iso) => !isWeekendIso(iso) && !holidayIsoDates.has(iso),
  );
  return { count: dates.length, dates };
}

/** Uma alocação candidata à materialização, já reduzida ao essencial. */
export interface AllocationForMaterialization {
  allocationId: string;
  projectId: string;
  /** Percentual de alocação; desempata o fallback (maior % vence). */
  allocationPercent: number;
  /** Vigência da alocação (a materialização só gera dentro dela). */
  startDate: Date;
  endDate: Date | null;
  /** Horas/dia do TimesheetDefault ativo; `null` quando não há default. */
  hoursPerDay: number | null;
  /** `ProjectBillingConfig.billDuringVacation` do projeto (default true). */
  billDuringVacation: boolean;
}

/** Um TimeEntry a ser criado (materializado). */
export interface PlannedTimeOffEntry {
  allocationId: string;
  projectId: string;
  /** ISO `yyyy-mm-dd`. */
  date: string;
  hours: number;
  activityType: ActivityType;
  billable: boolean;
  /** True quando veio do fallback 8h (sem TimesheetDefault). */
  fromFallback: boolean;
}

export interface MaterializationPlan {
  entries: PlannedTimeOffEntry[];
  /** True se ao menos uma entrada usou o fallback 8h. */
  usedFallback: boolean;
  /**
   * True quando NENHUM lançamento foi gerado por não haver alocação ativa
   * cobrindo qualquer dia útil (sinalização: aprovação segue, mas nada é pago).
   */
  noActiveAllocation: boolean;
}

function allocationCovers(
  allocation: AllocationForMaterialization,
  date: Date,
): boolean {
  const t = date.getTime();
  return (
    startOfUtcDay(allocation.startDate).getTime() <= t &&
    (!allocation.endDate || startOfUtcDay(allocation.endDate).getTime() >= t)
  );
}

/**
 * Plano de materialização (regra aprovada):
 * - Para cada dia útil (já sem fim de semana/feriado), considera as alocações
 *   ATIVAS que cobrem a data.
 * - Se ao menos uma alocação coberta tem TimesheetDefault (hoursPerDay != null):
 *   gera 1 entry por alocação-com-default, com `hours = hoursPerDay`.
 * - Fallback (nenhuma alocação coberta tem default): gera 1 entry de 8h na
 *   alocação coberta de MAIOR percentual.
 * - Nenhuma alocação cobre a data: não gera nada nesse dia.
 * `billable` de CADA entry = `billDuringVacation` do projeto daquela alocação.
 * `activityType` = derivado do kind (VACATION/LEAVE/PAID_ABSENCE).
 *
 * Não filtra por `TimesheetDefault.weekdays`: a ausência cobre TODOS os dias
 * úteis do intervalo, não só os dias do padrão semanal do consultor.
 */
export function buildMaterializationPlan(input: {
  kind: TimeOffKind;
  workingDates: string[];
  allocations: AllocationForMaterialization[];
  fallbackHours?: number;
}): MaterializationPlan {
  const activityType = resolveTimeOffActivityType(input.kind);
  const fallbackHours = input.fallbackHours ?? FALLBACK_HOURS_PER_DAY;
  const entries: PlannedTimeOffEntry[] = [];
  let usedFallback = false;

  for (const iso of input.workingDates) {
    const date = parseIsoDateUtc(iso);
    if (!date) continue;
    const covering = input.allocations.filter((a) => allocationCovers(a, date));
    if (covering.length === 0) continue;

    const withDefault = covering.filter((a) => a.hoursPerDay != null);
    if (withDefault.length > 0) {
      for (const alloc of withDefault) {
        entries.push({
          allocationId: alloc.allocationId,
          projectId: alloc.projectId,
          date: iso,
          hours: alloc.hoursPerDay as number,
          activityType,
          billable: alloc.billDuringVacation,
          fromFallback: false,
        });
      }
    } else {
      // Fallback: maior percentual vence (empate: primeira ordem estável).
      const chosen = [...covering].sort(
        (a, b) => b.allocationPercent - a.allocationPercent,
      )[0];
      usedFallback = true;
      entries.push({
        allocationId: chosen.allocationId,
        projectId: chosen.projectId,
        date: iso,
        hours: fallbackHours,
        activityType,
        billable: chosen.billDuringVacation,
        fromFallback: true,
      });
    }
  }

  return {
    entries,
    usedFallback,
    noActiveAllocation: entries.length === 0,
  };
}

// --- Saldo de férias (ledger CLT) ------------------------------------------

export type LedgerDebitResult =
  | { ok: true; balanceDays: number; takenDays: number }
  | { ok: false; reason: "INSUFFICIENT_BALANCE" };

/**
 * Débito do saldo de férias na APROVAÇÃO (kind=VACATION com vacationId).
 * Bloqueia quando `workingDays > balanceDays` (a aplicação traduz para msg
 * pt-br). Sucesso: novo balanceDays/takenDays.
 */
export function computeLedgerDebit(
  balanceDays: number,
  takenDays: number,
  workingDays: number,
): LedgerDebitResult {
  if (workingDays > balanceDays) {
    return { ok: false, reason: "INSUFFICIENT_BALANCE" };
  }
  return {
    ok: true,
    balanceDays: balanceDays - workingDays,
    takenDays: takenDays + workingDays,
  };
}

/**
 * Estorno do saldo no CANCELAMENTO de uma ausência já CONFIRMED. Devolve os
 * dias ao saldo e desconta de takenDays (nunca abaixo de zero).
 */
export function computeLedgerReversal(
  balanceDays: number,
  takenDays: number,
  workingDays: number,
): { balanceDays: number; takenDays: number } {
  return {
    balanceDays: balanceDays + workingDays,
    takenDays: Math.max(0, takenDays - workingDays),
  };
}

// --- Lookup para a UI (consumido pela D/3b) --------------------------------

/** Info de uma data coberta por ausência, para a grade/fila da UI. */
export interface TimeOffDayInfo {
  timeOffId: string;
  kind: TimeOffKind;
  paid: boolean;
  status: TimeOffStatus;
}

/**
 * Lookup de ausências de UM consultor num intervalo, no MESMO espírito do
 * `HolidayLookup`: um mapa `ISO date -> info`. Inclui apenas ausências
 * CONFIRMED e REQUESTED (as que impactam a grade). CONFIRMED tem precedência
 * sobre REQUESTED numa mesma data.
 */
export interface TimeOffLookup {
  byDate: Record<string, TimeOffDayInfo>;
}

/** Lookup vazio (modo demo / sem banco / sem ausências no intervalo). */
export const EMPTY_TIME_OFF_LOOKUP: TimeOffLookup = { byDate: {} };

/** Info da ausência numa data, ou `undefined`. */
export function resolveTimeOff(
  lookup: TimeOffLookup | undefined,
  isoDate: string,
): TimeOffDayInfo | undefined {
  return lookup?.byDate[isoDate];
}

/**
 * Datas em que já existe um lançamento de DIA ÚTIL (WORKDAY) do consultor que
 * conflita com o intervalo da ausência. Interseção ordenada e deduplicada — a
 * aprovação é BLOQUEADA quando não vazia (não sobrepomos ausência a trabalho já
 * apontado).
 */
export function collectWorkdayConflicts(
  existingWorkdayIsoDates: readonly string[],
  timeOffIsoDates: readonly string[],
): string[] {
  const range = new Set(timeOffIsoDates);
  const hits = new Set<string>();
  for (const iso of existingWorkdayIsoDates) {
    if (range.has(iso)) hits.add(iso);
  }
  return [...hits].sort();
}
