/**
 * Shared, pure types for the Mapa de Disponibilidade (Talentos — Onda 0, EP11).
 *
 * No server-only imports so these are safe to import from client components and
 * tests. The read-model is DERIVED from existing data (`Allocation`,
 * `ConsultantVacation`, `Consultant.status`) — no new schema (docs/backlog-
 * talentos.md EP11, docs/roadmap-talentos-gcpec.md §8.1).
 */

/**
 * Estado de uma célula (consultor × período).
 *
 * - FREE: consultor ACTIVE com 0% no período, mas com alguma alocação ativa em
 *   outro ponto da janela (entre projetos — "livre" neste período).
 * - BENCH: consultor ACTIVE com 0% e SEM nenhuma alocação ativa em toda a janela
 *   (ociosidade real — bench). A distinção FREE×BENCH é derivada da janela, pois
 *   o schema não tem um marcador explícito de bench (documentado em EP11).
 * - PARTIAL: soma das alocações ativas no período entre 1% e 99%.
 * - FULL: soma das alocações ativas no período >= 100%.
 * - VACATION: ConsultantVacation cobrindo o período (prevalece sobre alocação).
 * - ON_LEAVE: consultor afastado (Consultant.status = ON_LEAVE).
 * - INACTIVE: consultor inativo (não conta como capacidade disponível).
 */
export type AvailabilityState =
  | "FREE"
  | "BENCH"
  | "PARTIAL"
  | "FULL"
  | "VACATION"
  | "ON_LEAVE"
  | "INACTIVE";

export const availabilityStateLabels: Record<AvailabilityState, string> = {
  FREE: "Livre",
  BENCH: "Bench",
  PARTIAL: "Parcial",
  FULL: "100% alocado",
  VACATION: "Férias",
  ON_LEAVE: "Afastado",
  INACTIVE: "Inativo",
};

/** Ordem estável de estados para legenda e agregações. */
export const availabilityStateOrder: AvailabilityState[] = [
  "FREE",
  "BENCH",
  "PARTIAL",
  "FULL",
  "VACATION",
  "ON_LEAVE",
  "INACTIVE",
];

/** Status do consultor relevante para o cálculo (espelha ConsultantStatus). */
export type ConsultantStatusForAvailability =
  | "ACTIVE"
  | "INACTIVE"
  | "ON_LEAVE";

/**
 * Uma alocação reduzida ao mínimo necessário para o cálculo. Datas como ISO
 * `yyyy-mm-dd` (date-only, UTC) — coerente com as convenções do módulo de Horas.
 */
export interface AvailabilityAllocationInput {
  /** Soma feita por período; PLANNED/ENDED/etc. são ignorados pelo chamador. */
  allocationPercent: number;
  /** Início (ISO date-only). */
  startDate: string;
  /** Fim (ISO date-only) ou null para alocação em aberto. */
  endDate: string | null;
}

/**
 * Uma janela de férias reduzida. O schema atual (`ConsultantVacation`) é um
 * ledger de período aquisitivo (accrual), não um agendamento de dias gozados.
 * O chamador mapeia `accrualPeriodStart/End` para `start/end` e só inclui linhas
 * com `takenDays > 0` (férias efetivamente registradas no período). Tratado como
 * melhor esforço dado o schema — documentado em EP11.
 */
export interface AvailabilityVacationInput {
  start: string;
  end: string;
}

export interface AvailabilityConsultantInput {
  id: string;
  name: string;
  seniority: string;
  area: string | null;
  jobTitle: string | null;
  status: ConsultantStatusForAvailability;
  allocations: AvailabilityAllocationInput[];
  vacations: AvailabilityVacationInput[];
}

/** Um período (coluna) da janela do heatmap. */
export interface AvailabilityPeriod {
  /** Chave estável (ISO da segunda-feira, UTC). */
  key: string;
  /** Rótulo curto para o cabeçalho (ex.: "Sem 24"). */
  shortLabel: string;
  /** Rótulo completo (ex.: "Semana 24 · 08–14 jun 2026"). */
  label: string;
  /** Início inclusivo (ISO date-only, UTC). */
  start: string;
  /** Fim inclusivo (ISO date-only, UTC). */
  end: string;
}

/** Uma célula resolvida (consultor × período). */
export interface AvailabilityCell {
  periodKey: string;
  state: AvailabilityState;
  /** Soma de % das alocações ativas no período (0 quando férias/afastado). */
  allocationPercent: number;
}

/** Uma linha do heatmap: um consultor e suas células por período. */
export interface AvailabilityRow {
  consultantId: string;
  consultantName: string;
  seniority: string;
  area: string | null;
  jobTitle: string | null;
  status: ConsultantStatusForAvailability;
  cells: AvailabilityCell[];
}

/** O read-model completo: períodos (colunas) e linhas (consultores). */
export interface AvailabilityMap {
  periods: AvailabilityPeriod[];
  rows: AvailabilityRow[];
}
