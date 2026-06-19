import {
  addDays,
  parseIsoDateUtc,
  toIsoDate,
  weekLabel,
  weekStartOf,
} from "@/lib/timesheet/week";
import {
  type AvailabilityAllocationInput,
  type AvailabilityCell,
  type AvailabilityConsultantInput,
  type AvailabilityMap,
  type AvailabilityPeriod,
  type AvailabilityRow,
  type AvailabilityState,
  type AvailabilityVacationInput,
} from "./types";

/**
 * Pure domain logic for the Mapa de Disponibilidade (EP11). No I/O: the caller
 * (Prisma read or mock) passes plain rows and gets back the heatmap read-model.
 * Reusable and testable. Derived only from existing data — no new schema.
 *
 * Date convention mirrors the Horas module: weeks run Monday→Sunday, every date
 * is an ISO `yyyy-mm-dd` at midnight UTC (see lib/timesheet/week.ts).
 */

/** Bench/Livre só fazem sentido quando o consultor está ACTIVE com 0%. */
const FULL_THRESHOLD = 100;

/**
 * Build the window of weekly periods (columns) starting at the Monday of the
 * week containing `from`. Returns `weeks` consecutive Monday→Sunday windows.
 */
export function buildWeeklyPeriods(
  from: Date,
  weeks: number,
): AvailabilityPeriod[] {
  const count = Math.max(1, Math.floor(weeks));
  const first = weekStartOf(from);
  const periods: AvailabilityPeriod[] = [];
  for (let i = 0; i < count; i += 1) {
    const start = addDays(first, i * 7);
    const end = addDays(start, 6);
    periods.push({
      key: toIsoDate(start),
      shortLabel: shortWeekLabel(start),
      label: weekLabel(start),
      start: toIsoDate(start),
      end: toIsoDate(end),
    });
  }
  return periods;
}

/** "Sem 24 · 08/06" — compacto para o cabeçalho do grid. */
function shortWeekLabel(weekStart: Date): string {
  const full = weekLabel(weekStart); // "Semana 24 · 08–14 jun 2026"
  const week = full.match(/Semana (\d+)/)?.[1] ?? "";
  const dd = String(weekStart.getUTCDate()).padStart(2, "0");
  const mm = String(weekStart.getUTCMonth() + 1).padStart(2, "0");
  return `Sem ${week} · ${dd}/${mm}`;
}

/**
 * Whether two inclusive date ranges overlap. Each bound is an ISO date-only at
 * midnight UTC; an open end (`null`) means "no end" (overlaps any later period).
 * Returns false for unparsable inputs (defensive — never throw on bad data).
 */
export function rangesOverlap(
  aStart: string,
  aEnd: string | null,
  bStart: string,
  bEnd: string,
): boolean {
  const as = parseIsoDateUtc(aStart);
  const bs = parseIsoDateUtc(bStart);
  const be = parseIsoDateUtc(bEnd);
  if (!as || !bs || !be) return false;
  const ae = aEnd ? parseIsoDateUtc(aEnd) : null;
  if (aEnd && !ae) return false;
  // a starts after b ends → no overlap; a ends before b starts → no overlap.
  if (as.getTime() > be.getTime()) return false;
  if (ae && ae.getTime() < bs.getTime()) return false;
  return true;
}

/** Soma o % das alocações (já filtradas como ATIVAS) que cruzam o período. */
function allocationPercentInPeriod(
  allocations: ReadonlyArray<AvailabilityAllocationInput>,
  period: AvailabilityPeriod,
): number {
  let total = 0;
  for (const a of allocations) {
    if (rangesOverlap(a.startDate, a.endDate, period.start, period.end)) {
      total += a.allocationPercent;
    }
  }
  return total;
}

/** Alguma férias cobre (cruza) o período? */
function hasVacationInPeriod(
  vacations: ReadonlyArray<AvailabilityVacationInput>,
  period: AvailabilityPeriod,
): boolean {
  return vacations.some((v) =>
    rangesOverlap(v.start, v.end, period.start, period.end),
  );
}

/**
 * Classifica o estado de uma célula. Precedência (EP11): consultor inativo →
 * INACTIVE; afastado → ON_LEAVE; férias prevalecem sobre alocação → VACATION;
 * caso contrário a soma de % classifica FULL/PARTIAL e, no 0%, FREE vs BENCH.
 *
 * `hasAnyActiveAllocationInWindow` distingue BENCH (sem alocação ativa em toda a
 * janela = ociosidade real) de FREE (livre só neste período, alocado em outro).
 */
export function classifyCell(
  status: AvailabilityConsultantInput["status"],
  allocationPercent: number,
  onVacation: boolean,
  hasAnyActiveAllocationInWindow: boolean,
): AvailabilityState {
  if (status === "INACTIVE") return "INACTIVE";
  if (status === "ON_LEAVE") return "ON_LEAVE";
  if (onVacation) return "VACATION";
  if (allocationPercent >= FULL_THRESHOLD) return "FULL";
  if (allocationPercent > 0) return "PARTIAL";
  // 0% e ACTIVE: bench se nunca tem alocação ativa na janela; senão livre.
  return hasAnyActiveAllocationInWindow ? "FREE" : "BENCH";
}

/** Constrói as células de um consultor ao longo dos períodos. */
function buildRow(
  consultant: AvailabilityConsultantInput,
  periods: ReadonlyArray<AvailabilityPeriod>,
): AvailabilityRow {
  const hasAnyActiveAllocationInWindow = periods.some(
    (p) => allocationPercentInPeriod(consultant.allocations, p) > 0,
  );
  const cells: AvailabilityCell[] = periods.map((period) => {
    const onVacation = hasVacationInPeriod(consultant.vacations, period);
    const percent = allocationPercentInPeriod(consultant.allocations, period);
    const state = classifyCell(
      consultant.status,
      percent,
      onVacation,
      hasAnyActiveAllocationInWindow,
    );
    // Férias/afastado/inativo não reportam capacidade alocada na célula.
    const reportedPercent =
      state === "VACATION" || state === "ON_LEAVE" || state === "INACTIVE"
        ? 0
        : percent;
    return { periodKey: period.key, state, allocationPercent: reportedPercent };
  });
  return {
    consultantId: consultant.id,
    consultantName: consultant.name,
    seniority: consultant.seniority,
    area: consultant.area,
    jobTitle: consultant.jobTitle,
    status: consultant.status,
    cells,
  };
}

/**
 * Build the full availability read-model from consultants + periods. Rows are
 * sorted by name (pt-BR). The caller is responsible for RBAC scoping (which
 * consultants) and for pre-filtering allocations to the ACTIVE ones.
 */
export function buildAvailabilityMap(
  consultants: ReadonlyArray<AvailabilityConsultantInput>,
  periods: ReadonlyArray<AvailabilityPeriod>,
): AvailabilityMap {
  const rows = consultants
    .map((c) => buildRow(c, periods))
    .sort((a, b) => a.consultantName.localeCompare(b.consultantName, "pt-BR"));
  return { periods: [...periods], rows };
}

/** Conta consultores por estado em um dado período (para resumo/legendas). */
export function countStatesForPeriod(
  map: AvailabilityMap,
  periodKey: string,
): Record<AvailabilityState, number> {
  const counts: Record<AvailabilityState, number> = {
    FREE: 0,
    BENCH: 0,
    PARTIAL: 0,
    FULL: 0,
    VACATION: 0,
    ON_LEAVE: 0,
    INACTIVE: 0,
  };
  for (const row of map.rows) {
    const cell = row.cells.find((c) => c.periodKey === periodKey);
    if (cell) counts[cell.state] += 1;
  }
  return counts;
}
