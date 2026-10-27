/**
 * Calendario de dias uteis do SLA do fluxo de horas (item 5).
 *
 * PURO (sem Prisma, sem relogio implicito): importavel por Server e Client
 * Components (a tela de configuracao recalcula a previa no navegador) e testavel
 * isoladamente. Todas as datas sao strings ISO `yyyy-mm-dd` (date-only), na
 * mesma convencao de `Holiday.date @db.Date` e `TimeEntry.date`; a aritmetica
 * usa Date em UTC so como contador de dias, nunca como instante.
 *
 * Convencoes (espelham o enum SlaAnchor do schema):
 * - Dia util = segunda a sexta que nao esta no conjunto de feriados do
 *   calendario. Quais feriados entram e decidido por {@link slaCalendarFromHolidays}.
 * - COMPETENCE_MONTH_END + N: N-esimo dia util do mes seguinte a competencia;
 *   N = 0 e o ULTIMO dia util do proprio mes de competencia.
 * - PAYMENT_DATE + N: N dias uteis ANTES da data de pagamento; N = 0 e o
 *   proprio dia do pagamento.
 * - Data de pagamento = SlaSettings.paymentDay do mes seguinte a competencia
 *   (limitado ao ultimo dia do mes). Se cair em fim de semana/feriado aplica-se
 *   {@link PAYMENT_DAY_NON_BUSINESS_RULE} (padrao: antecipar para o dia util
 *   anterior — "antecipar pagamentos", como combinado com o Financeiro).
 * - O prazo vence no FIM do dia em America/Sao_Paulo ({@link endOfDayInstant}).
 */

/** Data ISO date-only `yyyy-mm-dd`. */
export type IsoDate = string;

/** Fuso de referencia dos prazos. */
export const SLA_TIME_ZONE = "America/Sao_Paulo";

/**
 * Offset fixo de Sao Paulo. O Brasil nao tem horario de verao desde 2019, entao
 * o offset e constante; se voltar a existir, troque {@link endOfDayInstant} por
 * uma conversao baseada em Intl.
 */
export const SAO_PAULO_UTC_OFFSET = "-03:00";

export type NonBusinessPaymentDayRule =
  | "PREVIOUS_BUSINESS_DAY"
  | "NEXT_BUSINESS_DAY";

/**
 * Regra quando o dia de pagamento cai em dia nao util. Constante unica para
 * facilitar a mudanca de politica (ex.: postergar em vez de antecipar).
 */
export const PAYMENT_DAY_NON_BUSINESS_RULE: NonBusinessPaymentDayRule =
  "PREVIOUS_BUSINESS_DAY";

/** Mes de competencia (month 1..12). */
export interface Competence {
  year: number;
  month: number;
}

/** Conjunto de feriados que tornam um dia nao util (+ nomes para exibicao). */
export interface BusinessCalendar {
  holidays: ReadonlySet<IsoDate>;
  names: ReadonlyMap<IsoDate, string>;
}

export function createBusinessCalendar(
  holidays: ReadonlyArray<{ date: IsoDate; name?: string }> = [],
): BusinessCalendar {
  const set = new Set<IsoDate>();
  const names = new Map<IsoDate, string>();
  for (const h of holidays) {
    set.add(h.date);
    if (h.name && !names.has(h.date)) names.set(h.date, h.name);
  }
  return { holidays: set, names };
}

export const EMPTY_BUSINESS_CALENDAR: BusinessCalendar = createBusinessCalendar();

/** Feriado como vem do banco, ja normalizado para o SLA. */
export interface SlaHolidayInput {
  date: IsoDate;
  name: string;
  scope: "NATIONAL" | "STATE" | "CITY";
}

/**
 * Monta o calendario do SLA a partir do cadastro de feriados. Entram os
 * NACIONAIS sempre e os ESTADUAIS apenas com `considerStateHolidays`. Feriados
 * MUNICIPAIS nao entram (o fluxo e corporativo, nao por praca). O chamador deve
 * passar somente feriados GLOBAIS (sem vinculo de projeto): folga de cliente nao
 * move prazo interno.
 */
export function slaCalendarFromHolidays(
  holidays: ReadonlyArray<SlaHolidayInput>,
  considerStateHolidays: boolean,
): BusinessCalendar {
  return createBusinessCalendar(
    holidays.filter(
      (h) =>
        h.scope === "NATIONAL" || (considerStateHolidays && h.scope === "STATE"),
    ),
  );
}

// ---------------------------------------------------------------------------
// Aritmetica de datas ISO
// ---------------------------------------------------------------------------

function toUtc(iso: IsoDate): Date {
  return new Date(`${iso}T00:00:00.000Z`);
}

function fromUtc(date: Date): IsoDate {
  return date.toISOString().slice(0, 10);
}

export function isoDate(year: number, month: number, day: number): IsoDate {
  return fromUtc(new Date(Date.UTC(year, month - 1, day)));
}

export function addCalendarDays(iso: IsoDate, days: number): IsoDate {
  const d = toUtc(iso);
  d.setUTCDate(d.getUTCDate() + days);
  return fromUtc(d);
}

/** 0 = domingo .. 6 = sabado. */
export function weekdayOf(iso: IsoDate): number {
  return toUtc(iso).getUTCDay();
}

export function daysInMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

export function isWeekend(iso: IsoDate): boolean {
  const wd = weekdayOf(iso);
  return wd === 0 || wd === 6;
}

export function isBusinessDay(iso: IsoDate, calendar: BusinessCalendar): boolean {
  return !isWeekend(iso) && !calendar.holidays.has(iso);
}

/**
 * Anda `n` dias uteis a partir de `iso` (o proprio dia nao conta). n > 0 para
 * frente, n < 0 para tras, n = 0 devolve `iso` inalterado (mesmo se nao util).
 */
export function addBusinessDays(
  iso: IsoDate,
  n: number,
  calendar: BusinessCalendar,
): IsoDate {
  if (!Number.isInteger(n)) throw new Error("addBusinessDays: n deve ser inteiro");
  const step = n >= 0 ? 1 : -1;
  let remaining = Math.abs(n);
  let current = iso;
  while (remaining > 0) {
    current = addCalendarDays(current, step);
    if (isBusinessDay(current, calendar)) remaining -= 1;
  }
  return current;
}

/** Primeiro dia util em `iso` ou antes dele. */
export function previousOrSameBusinessDay(
  iso: IsoDate,
  calendar: BusinessCalendar,
): IsoDate {
  let current = iso;
  while (!isBusinessDay(current, calendar)) current = addCalendarDays(current, -1);
  return current;
}

/** Primeiro dia util em `iso` ou depois dele. */
export function nextOrSameBusinessDay(
  iso: IsoDate,
  calendar: BusinessCalendar,
): IsoDate {
  let current = iso;
  while (!isBusinessDay(current, calendar)) current = addCalendarDays(current, 1);
  return current;
}

/** Ultimo dia util do mes. */
export function lastBusinessDayOfMonth(
  year: number,
  month: number,
  calendar: BusinessCalendar,
): IsoDate {
  return previousOrSameBusinessDay(
    isoDate(year, month, daysInMonth(year, month)),
    calendar,
  );
}

/**
 * N-esimo dia util do mes (n >= 1). Pode transbordar para o mes seguinte se o
 * mes tiver menos de `n` dias uteis (comportamento consistente com prazos
 * "N dias uteis apos o fim do mes").
 */
export function nthBusinessDayOfMonth(
  year: number,
  month: number,
  n: number,
  calendar: BusinessCalendar,
): IsoDate {
  if (!Number.isInteger(n) || n < 1) {
    throw new Error("nthBusinessDayOfMonth: n deve ser inteiro >= 1");
  }
  const first = nextOrSameBusinessDay(isoDate(year, month, 1), calendar);
  return addBusinessDays(first, n - 1, calendar);
}

/**
 * Dias uteis entre duas datas: quantidade de dias uteis em (from, to] quando
 * to > from; negativo (-(dias uteis em (to, from])) quando to < from; 0 quando
 * iguais. Assim "faltam N dias uteis" = businessDaysBetween(hoje, prazo): no
 * proprio dia do prazo e 0 ("vence hoje").
 */
export function businessDaysBetween(
  from: IsoDate,
  to: IsoDate,
  calendar: BusinessCalendar,
): number {
  if (from === to) return 0;
  const forward = from < to;
  const [start, end] = forward ? [from, to] : [to, from];
  let count = 0;
  let current = start;
  while (current < end) {
    current = addCalendarDays(current, 1);
    if (isBusinessDay(current, calendar)) count += 1;
  }
  return forward ? count : -count;
}

/** Todos os dias uteis do mes, em ordem. */
export function businessDaysOfMonth(
  year: number,
  month: number,
  calendar: BusinessCalendar,
): IsoDate[] {
  const out: IsoDate[] = [];
  for (let d = 1; d <= daysInMonth(year, month); d++) {
    const iso = isoDate(year, month, d);
    if (isBusinessDay(iso, calendar)) out.push(iso);
  }
  return out;
}

// ---------------------------------------------------------------------------
// Competencia
// ---------------------------------------------------------------------------

export function nextCompetence(c: Competence): Competence {
  return c.month === 12
    ? { year: c.year + 1, month: 1 }
    : { year: c.year, month: c.month + 1 };
}

export function previousCompetence(c: Competence): Competence {
  return c.month === 1
    ? { year: c.year - 1, month: 12 }
    : { year: c.year, month: c.month - 1 };
}

export function shiftCompetence(c: Competence, months: number): Competence {
  const index = c.year * 12 + (c.month - 1) + months;
  return { year: Math.floor(index / 12), month: (index % 12) + 1 };
}

/** `yyyy-mm` (formato do <input type="month">). */
export function competenceKey(c: Competence): string {
  return `${c.year}-${String(c.month).padStart(2, "0")}`;
}

export function parseCompetenceKey(value: string | undefined | null): Competence | null {
  if (!value) return null;
  const match = /^(\d{4})-(\d{2})$/.exec(value.trim());
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  if (year < 2020 || year > 2100 || month < 1 || month > 12) return null;
  return { year, month };
}

export function competenceOf(iso: IsoDate): Competence {
  return { year: Number(iso.slice(0, 4)), month: Number(iso.slice(5, 7)) };
}

// ---------------------------------------------------------------------------
// Prazos
// ---------------------------------------------------------------------------

/**
 * Data de pagamento da competencia: `paymentDay` do mes seguinte (limitado ao
 * ultimo dia do mes), ajustada por {@link PAYMENT_DAY_NON_BUSINESS_RULE}.
 */
export function resolvePaymentDate(
  competence: Competence,
  paymentDay: number,
  calendar: BusinessCalendar,
  rule: NonBusinessPaymentDayRule = PAYMENT_DAY_NON_BUSINESS_RULE,
): IsoDate {
  const next = nextCompetence(competence);
  const day = Math.min(Math.max(1, Math.trunc(paymentDay)), daysInMonth(next.year, next.month));
  const nominal = isoDate(next.year, next.month, day);
  return rule === "PREVIOUS_BUSINESS_DAY"
    ? previousOrSameBusinessDay(nominal, calendar)
    : nextOrSameBusinessDay(nominal, calendar);
}

export type SlaAnchorKey = "COMPETENCE_MONTH_END" | "PAYMENT_DATE";

export interface StageDeadlineInput {
  anchor: SlaAnchorKey;
  businessDays: number;
}

export interface SlaSettingsInput {
  paymentDay: number;
}

/** Data-limite (date-only) de uma etapa para a competencia. */
export function computeStageDeadline(
  stage: StageDeadlineInput,
  competence: Competence,
  settings: SlaSettingsInput,
  calendar: BusinessCalendar,
): IsoDate {
  const n = Math.max(0, Math.trunc(stage.businessDays));
  if (stage.anchor === "COMPETENCE_MONTH_END") {
    const last = lastBusinessDayOfMonth(competence.year, competence.month, calendar);
    // O N-esimo dia util do mes seguinte e exatamente N dias uteis apos o
    // ultimo dia util da competencia.
    return addBusinessDays(last, n, calendar);
  }
  const payment = resolvePaymentDate(competence, settings.paymentDay, calendar);
  return addBusinessDays(payment, -n, calendar);
}

/** Instante em que o prazo vence: 23:59:59.999 do dia em Sao Paulo. */
export function endOfDayInstant(iso: IsoDate): Date {
  return new Date(`${iso}T23:59:59.999${SAO_PAULO_UTC_OFFSET}`);
}

/** Data (date-only) de um instante no fuso de Sao Paulo. */
export function isoDateInSaoPaulo(instant: Date): IsoDate {
  // en-CA formata como yyyy-mm-dd.
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: SLA_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(instant);
}

const WEEKDAY_SHORT = ["dom", "seg", "ter", "qua", "qui", "sex", "sáb"];

/** `dd/mm (seg)` para exibicao. */
export function formatDeadlineShort(iso: IsoDate): string {
  return `${iso.slice(8, 10)}/${iso.slice(5, 7)} (${WEEKDAY_SHORT[weekdayOf(iso)]})`;
}

export function weekdayShort(iso: IsoDate): string {
  return WEEKDAY_SHORT[weekdayOf(iso)];
}
