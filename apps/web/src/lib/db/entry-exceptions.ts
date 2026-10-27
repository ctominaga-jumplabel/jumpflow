/**
 * Carregamento de feriados para a sinalização de exceções de lançamentos
 * (`lib/timesheet/entry-exceptions.ts`). UMA query por página/listagem: o
 * intervalo [menor data, maior data] dos lançamentos exibidos alimenta um único
 * `getHolidayLookup` (project-aware), e cada linha resolve em memória.
 */
import { prisma } from "@jumpflow/database";
import { getHolidayLookup } from "./timesheet";
import {
  getEntryExceptions,
  summarizeEntryExceptions,
  type EntryExceptionSummary,
} from "@/lib/timesheet/entry-exceptions";
import {
  EMPTY_HOLIDAY_LOOKUP,
  type HolidayLookup,
} from "@/lib/timesheet/holidays";
import { parseIsoDateUtc, toIsoDate } from "@/lib/timesheet/week";

/** Lookup de feriados cobrindo todas as datas informadas (Date ou ISO). */
export async function loadHolidayLookupForDates(
  dates: ReadonlyArray<Date | string>,
): Promise<HolidayLookup> {
  let min: Date | null = null;
  let max: Date | null = null;
  for (const value of dates) {
    const d =
      typeof value === "string" ? parseIsoDateUtc(value.slice(0, 10)) : value;
    if (!d || Number.isNaN(d.getTime())) continue;
    if (!min || d < min) min = d;
    if (!max || d > max) max = d;
  }
  if (!min || !max) return EMPTY_HOLIDAY_LOOKUP;
  return getHolidayLookup(min, max);
}

/** Resumo de exceções de um pagamento (consultor × competência). */
export type PaymentExceptionSummary = EntryExceptionSummary;

/**
 * Exceções dos lançamentos que compõem cada pagamento de consultor (DP): para
 * cada `ConsultantPayment` (consultor × mês/ano), os lançamentos do mês que não
 * foram rascunho/reprovados. Três leituras no total — pagamentos, lançamentos
 * (todos os consultores/meses de uma vez) e feriados — nunca por linha.
 * Retorna apenas pagamentos COM exceção (paymentId → resumo).
 */
export async function loadPaymentEntryExceptions(
  paymentIds: readonly string[],
): Promise<Record<string, PaymentExceptionSummary>> {
  if (paymentIds.length === 0) return {};
  const payments = await prisma.consultantPayment.findMany({
    where: { id: { in: [...paymentIds] } },
    select: { id: true, consultantId: true, month: true, year: true },
  });
  if (payments.length === 0) return {};

  const startOf = (p: { month: number; year: number }) =>
    new Date(Date.UTC(p.year, p.month - 1, 1));
  let min = startOf(payments[0]);
  let max = new Date(Date.UTC(payments[0].year, payments[0].month, 1));
  for (const p of payments) {
    const s = startOf(p);
    const e = new Date(Date.UTC(p.year, p.month, 1));
    if (s < min) min = s;
    if (e > max) max = e;
  }

  const entries = await prisma.timeEntry.findMany({
    where: {
      consultantId: { in: [...new Set(payments.map((p) => p.consultantId))] },
      date: { gte: min, lt: max },
      status: { notIn: ["DRAFT", "REJECTED"] },
    },
    select: { consultantId: true, projectId: true, date: true, activityType: true },
  });
  const holidays = await loadHolidayLookupForDates(entries.map((e) => e.date));

  // (consultor|yyyy-mm) → lançamentos com exceção.
  const byKey = new Map<
    string,
    { date: string; exceptions: ReturnType<typeof getEntryExceptions> }[]
  >();
  for (const e of entries) {
    const iso = toIsoDate(e.date);
    const exceptions = getEntryExceptions({
      date: iso,
      activityType: e.activityType,
      projectId: e.projectId,
      holidays,
    });
    if (exceptions.length === 0) continue;
    const key = `${e.consultantId}|${iso.slice(0, 7)}`;
    const list = byKey.get(key) ?? [];
    list.push({ date: iso, exceptions });
    byKey.set(key, list);
  }

  const out: Record<string, PaymentExceptionSummary> = {};
  for (const p of payments) {
    const key = `${p.consultantId}|${p.year}-${String(p.month).padStart(2, "0")}`;
    const list = byKey.get(key);
    if (!list) continue;
    out[p.id] = summarizeEntryExceptions(list);
  }
  return out;
}
