/**
 * Exceções de um lançamento de horas (sinal para DP / aprovador da Operação).
 *
 * Um lançamento é "exceção" quando cai num dia que NÃO é um dia útil comum
 * (sábado, domingo, feriado aplicável ao projeto) ou quando a atividade não é
 * "Dia Útil" (Sobreaviso, Hora Extra, Folga, Férias, Licença, Falta, Ausência
 * Remunerada, Aguardando início). O calendário é apenas um SINAL — nunca bloqueia
 * (feriados regionais e particularidades de cliente existem). Por isso este
 * módulo só descreve; quem decide é a pessoa.
 *
 * PURO (sem Prisma/IO): importável por Server e Client Components e pelos
 * builders de Excel. Datas são ISO `yyyy-mm-dd` (date-only), lidas em UTC —
 * mesma convenção de `TimeEntry.date`/`Holiday.date` (`@db.Date`).
 */
import {
  resolveGlobalHoliday,
  resolveProjectHoliday,
  type HolidayLookup,
} from "./holidays";
import { activityLabelOf, isActivityType } from "./types";

export type EntryExceptionKind = "WEEKEND" | "HOLIDAY" | "ACTIVITY";

export interface EntryException {
  kind: EntryExceptionKind;
  /** Rótulo curto pt-BR, ex.: "Sábado", "Feriado: Tiradentes", "Sobreaviso". */
  label: string;
  /** Explicação curta para o tooltip. */
  detail: string;
}

export interface EntryExceptionInput {
  /** ISO `yyyy-mm-dd` (ou ISO datetime — só os 10 primeiros caracteres valem). */
  date: string;
  /** Código cru de `TimeEntry.activityType`. */
  activityType: string;
  /**
   * Projeto do lançamento. Quando presente, feriados vinculados a ESTE projeto
   * também contam (além dos globais); ausente => só feriados globais.
   */
  projectId?: string | null;
  /** Horas acima do padrão do dia (Hora Extra não materializada como linha). */
  overtimeHours?: number | null;
  /** Lookup já carregado (uma query por página). Ausente => sem feriados. */
  holidays?: HolidayLookup | null;
}

export const WEEKDAY_LABELS_PT = [
  "Domingo",
  "Segunda",
  "Terça",
  "Quarta",
  "Quinta",
  "Sexta",
  "Sábado",
] as const;

/** Normaliza para ISO `yyyy-mm-dd`, ou null quando inválido. */
function isoDateOnly(value: string): string | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(value ?? "");
  return m ? `${m[1]}-${m[2]}-${m[3]}` : null;
}

/** Dia da semana (0=domingo) de uma data ISO, em UTC; null quando inválida. */
function utcWeekday(iso: string): number | null {
  const d = isoDateOnly(iso);
  if (!d) return null;
  const [y, m, day] = d.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, day)).getUTCDay();
}

/** ISO `yyyy-mm-dd` → dia da semana pt-BR ("Sábado"). "" quando inválida. */
export function weekdayLabelPt(iso: string): string {
  const wd = utcWeekday(iso);
  return wd == null ? "" : WEEKDAY_LABELS_PT[wd];
}

function formatHoursShort(hours: number): string {
  return `${hours.toLocaleString("pt-BR", { maximumFractionDigits: 2 })}h`;
}

/**
 * Lista as exceções de um lançamento, na ordem calendário → feriado → atividade.
 * "Dia Útil" num dia de semana comum (sem feriado) => lista vazia.
 */
export function getEntryExceptions(input: EntryExceptionInput): EntryException[] {
  const out: EntryException[] = [];
  const iso = isoDateOnly(input.date);

  if (iso) {
    const wd = utcWeekday(iso);
    if (wd === 0 || wd === 6) {
      const day = WEEKDAY_LABELS_PT[wd];
      out.push({
        kind: "WEEKEND",
        label: day,
        detail: `Lançamento em ${day.toLowerCase()} (fim de semana)`,
      });
    }

    const holidays = input.holidays ?? undefined;
    const holidayName = input.projectId
      ? resolveProjectHoliday(holidays, input.projectId, iso)
      : resolveGlobalHoliday(holidays, iso);
    if (holidayName) {
      const projectScoped =
        Boolean(input.projectId) && !resolveGlobalHoliday(holidays, iso);
      out.push({
        kind: "HOLIDAY",
        label: `Feriado: ${holidayName}`,
        detail: projectScoped
          ? "Feriado/folga cadastrado para este projeto"
          : "Feriado cadastrado no calendário",
      });
    }
  }

  // Só o catálogo canônico gera exceção de atividade: valores legados
  // (Desenvolvimento, Reunião…) eram trabalho comum e não devem virar ruído.
  if (input.activityType !== "WORKDAY" && isActivityType(input.activityType)) {
    out.push({
      kind: "ACTIVITY",
      label: activityLabelOf(input.activityType),
      detail: "Atividade fora do Dia Útil",
    });
  }

  const overtime = Number(input.overtimeHours ?? 0);
  if (overtime > 0 && input.activityType !== "OVERTIME") {
    out.push({
      kind: "ACTIVITY",
      label: activityLabelOf("OVERTIME"),
      detail: `${formatHoursShort(overtime)} acima do padrão do dia`,
    });
  }

  return out;
}

/** Texto de uma lista de exceções para Excel/aria ("Sábado; Sobreaviso"). */
export function formatEntryExceptions(
  exceptions: readonly EntryException[] | null | undefined,
  separator = "; ",
): string {
  return (exceptions ?? []).map((e) => e.label).join(separator);
}

/** ISO → "dd/mm" (sem fuso). */
export function formatDayMonth(iso: string): string {
  const d = isoDateOnly(iso);
  if (!d) return iso;
  const [, m, day] = d.split("-");
  return `${day}/${m}`;
}

/** Um dia com exceção, para o resumo agregado por consultor. */
export interface DatedEntryExceptions {
  date: string;
  exceptions: readonly EntryException[];
}

/** Resumo agregado (por consultor/pagamento) para o selo "N exceções". */
export interface EntryExceptionSummary {
  count: number;
  /** "21/11 (Sáb): Sábado; Sobreaviso". */
  lines: string[];
}

/**
 * Resumo agregado (por consultor): conta apenas lançamentos COM exceção e gera
 * linhas "dd/mm (Sáb): Sábado; Sobreaviso" em ordem de data, deduplicando
 * rótulos repetidos no mesmo dia (dois lançamentos no mesmo sábado).
 */
export function summarizeEntryExceptions(
  items: readonly DatedEntryExceptions[],
): EntryExceptionSummary {
  const flagged = items.filter((i) => i.exceptions.length > 0);
  const byDate = new Map<string, Set<string>>();
  for (const item of flagged) {
    const key = isoDateOnly(item.date) ?? item.date;
    const set = byDate.get(key) ?? new Set<string>();
    for (const e of item.exceptions) set.add(e.label);
    byDate.set(key, set);
  }
  const lines = [...byDate.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, labels]) => {
      const wd = weekdayLabelPt(date).slice(0, 3);
      return `${formatDayMonth(date)}${wd ? ` (${wd})` : ""}: ${[...labels].join("; ")}`;
    });
  return { count: flagged.length, lines };
}
