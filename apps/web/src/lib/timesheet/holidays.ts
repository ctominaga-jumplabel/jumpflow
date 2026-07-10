/**
 * Project-aware holiday lookup for the Horas module (Onda A-ext/3).
 *
 * Semântica de aplicabilidade (espelha `HolidayProject` no schema):
 * - Feriado SEM vínculo em HolidayProject = GLOBAL: vale para TODOS os projetos
 *   (o caso dos feriados nacionais).
 * - Feriado COM >=1 vínculo = aplica-se SOMENTE aos projetos vinculados
 *   (folga de cliente / feriado regional).
 *
 * Este módulo é PURO (sem Prisma) para poder ser importado por Server e Client
 * Components e testado isoladamente. O servidor (`lib/db/timesheet.ts`) monta o
 * `HolidayLookup`; a UI apenas resolve por (projeto, data).
 *
 * Datas são sempre ISO `yyyy-mm-dd` (date-only), coerentes com a convenção UTC
 * de `Holiday.date @db.Date` e `TimeEntry.date`.
 */

export interface HolidayLookup {
  /**
   * ISO date -> nome do feriado GLOBAL (sem vínculo de projeto). Vale para
   * qualquer projeto e marca a coluna do dia na grade.
   */
  global: Record<string, string>;
  /**
   * projectId -> (ISO date -> nome) para feriados vinculados a projetos
   * específicos. Só marca células/linhas daquele projeto.
   */
  byProject: Record<string, Record<string, string>>;
}

/** Lookup vazio (modo demo / sem banco / nenhum feriado no intervalo). */
export const EMPTY_HOLIDAY_LOOKUP: HolidayLookup = { global: {}, byProject: {} };

/**
 * Nome do feriado aplicável a um (projeto, data), ou `undefined`. Um feriado
 * específico do projeto tem precedência sobre o global apenas para efeito de
 * qual NOME exibir; ambos disparam a marcação.
 */
export function resolveProjectHoliday(
  lookup: HolidayLookup | undefined,
  projectId: string,
  isoDate: string,
): string | undefined {
  if (!lookup) return undefined;
  return lookup.byProject[projectId]?.[isoDate] ?? lookup.global[isoDate];
}

/**
 * Nome do feriado GLOBAL numa data (ignorando projeto). Usado para marcar o
 * cabeçalho da coluna do dia e o resumo do período (que é cross-projeto).
 */
export function resolveGlobalHoliday(
  lookup: HolidayLookup | undefined,
  isoDate: string,
): string | undefined {
  return lookup?.global[isoDate];
}

/**
 * Regra pura de disparo da CONFIRMAÇÃO: só quando a atividade é "Dia Útil"
 * (WORKDAY) E a data é feriado para o projeto. Confirmar NÃO bloqueia o salvar;
 * apenas pede ratificação consciente. Demais atividades (Férias, Folga, etc.)
 * nunca disparam confirmação, pois lançar nelas em feriado é esperado.
 */
export function needsWorkdayHolidayConfirmation(
  activity: string,
  holidayName: string | undefined,
): boolean {
  return activity === "WORKDAY" && Boolean(holidayName);
}
