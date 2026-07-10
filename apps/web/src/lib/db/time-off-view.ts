import { prisma } from "@jumpflow/database";
import { toIsoDate } from "@/lib/timesheet/week";
import type { TimeOffKind, TimeOffStatus } from "@/lib/timesheet/time-off";

/**
 * Camada de LEITURA da tela `/app/ausencias` (Onda D/ausência-UI).
 *
 * Assume banco configurado — os chamadores guardam com `isDatabaseConfigured()`.
 * Só carrega e molda dados do Prisma; nenhuma regra de negócio (essa vive em
 * `lib/timesheet/time-off.ts` e nas actions). Datas saem em ISO date-only
 * (`toIsoDate`), coerentes com o lookup de feriados/ausências da grade.
 */

/** Uma ausência na lista (own ou fila), reduzida ao que a UI mostra. */
export interface TimeOffListItem {
  id: string;
  kind: TimeOffKind;
  status: TimeOffStatus;
  /** Ausência remunerada? */
  paid: boolean;
  /** ISO `yyyy-mm-dd`. */
  startDate: string;
  endDate: string;
  /** Dias úteis calculados (null enquanto não decidida em alguns fluxos). */
  workingDays: number | null;
  note: string | null;
  decisionComment: string | null;
}

/** Item da fila de decisão (People): inclui o consultor e o saldo de férias. */
export interface PendingTimeOffItem extends TimeOffListItem {
  consultantId: string;
  consultantName: string;
  /** Saldo de férias vinculado ao pedido (quando kind = férias), ou null. */
  vacationBalanceDays: number | null;
}

const LIST_SELECT = {
  id: true,
  kind: true,
  status: true,
  paid: true,
  startDate: true,
  endDate: true,
  workingDays: true,
  note: true,
  decisionComment: true,
} as const;

type ListRow = {
  id: string;
  kind: string;
  status: string;
  paid: boolean;
  startDate: Date;
  endDate: Date;
  workingDays: number | null;
  note: string | null;
  decisionComment: string | null;
};

function mapRow(row: ListRow): TimeOffListItem {
  return {
    id: row.id,
    kind: row.kind as TimeOffKind,
    status: row.status as TimeOffStatus,
    paid: row.paid,
    startDate: toIsoDate(row.startDate),
    endDate: toIsoDate(row.endDate),
    workingDays: row.workingDays,
    note: row.note,
    decisionComment: row.decisionComment,
  };
}

/** As ausências do próprio consultor, mais recentes primeiro. */
export async function listTimeOffForConsultant(
  consultantId: string,
): Promise<TimeOffListItem[]> {
  const rows = await prisma.consultantTimeOff.findMany({
    where: { consultantId },
    orderBy: { startDate: "desc" },
    select: LIST_SELECT,
  });
  return rows.map(mapRow);
}

/**
 * Saldo de férias do consultor: soma dos `balanceDays` de todos os períodos
 * aquisitivos. `null` quando não há registro de férias (nada a exibir).
 */
export async function getVacationBalanceForConsultant(
  consultantId: string,
): Promise<number | null> {
  const rows = await prisma.consultantVacation.findMany({
    where: { consultantId },
    select: { balanceDays: true },
  });
  if (rows.length === 0) return null;
  return rows.reduce((sum, r) => sum + r.balanceDays, 0);
}

/** Todas as ausências REQUESTED (fila de decisão de People), mais antigas primeiro. */
export async function listPendingTimeOffRequests(): Promise<PendingTimeOffItem[]> {
  const rows = await prisma.consultantTimeOff.findMany({
    where: { status: "REQUESTED" },
    orderBy: [{ requestedAt: "asc" }, { startDate: "asc" }],
    select: {
      ...LIST_SELECT,
      consultantId: true,
      consultant: { select: { name: true } },
      vacation: { select: { balanceDays: true } },
    },
  });
  return rows.map((row) => ({
    ...mapRow(row),
    consultantId: row.consultantId,
    consultantName: row.consultant?.name ?? "Consultor",
    vacationBalanceDays: row.vacation?.balanceDays ?? null,
  }));
}
