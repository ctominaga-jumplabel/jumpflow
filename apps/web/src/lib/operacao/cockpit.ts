/**
 * Camada FINA de banco do "Cockpit do Gestor de Área" (proposta §3, §4, Fase 2
 * item 2d). Só busca e molda dados; todo cálculo por consultor e a classificação
 * de fase vivem no núcleo puro `cockpit-core.ts`. Reaproveita helpers existentes:
 * feriados (`lib/db/timesheet#getHolidayLookup` + semântica de `lib/timesheet/
 * holidays`), prontidão DP (`lib/db/operation-closing#getOperationReadiness`) e
 * competência (`lib/timesheet/week#toIsoDate`).
 *
 * Dado { month, year } (competência — o caller resolve o default, o núcleo nunca
 * lê o relógio), devolve os projetos ACTIVE com, para cada um: consultores (via
 * Allocation vigente), as métricas por consultor, a prontidão DP e o status dos
 * dois eixos (financeiroLiberado / dpLiberado) + a fase ATIVO|HISTORICO.
 *
 * As consultas de coleção são em lote (sem N+1); só `getOperationReadiness` roda
 * por projeto — mas em paralelo (`Promise.all`) e é o helper canônico de
 * prontidão, então mantemos a fonte única em vez de reimplementar a contagem.
 */
import { prisma } from "@jumpflow/database";

import { toIsoDate } from "@/lib/timesheet/week";
import { getHolidayLookup } from "@/lib/db/timesheet";
import { getOperationReadiness } from "@/lib/db/operation-closing";
import type { OperationReadiness } from "@/lib/operations/closing";
import type { HolidayLookup } from "@/lib/timesheet/holidays";

import {
  classifyConsultantReadiness,
  isExceptionEntry,
} from "@/lib/operations/closing";
import { activityLabelOf } from "@/lib/timesheet/types";

import {
  classifyProjectPhase,
  computeConsultantMetrics,
  isWeekend,
  type CockpitCompetence,
  type CockpitEntryDay,
  type CockpitProjectPhase,
} from "./cockpit-core";

/**
 * Um lançamento "de exceção" (proposta itens 2/3): atividade diferente de
 * "Dia Útil" (WORKDAY) OU um "Dia Útil" que carrega anexo. Mesma regra do
 * fechamento (`isExceptionEntry`), aqui moldada para o alerta do cockpit.
 */
export interface CockpitException {
  /** ISO `yyyy-mm-dd` do lançamento. */
  date: string;
  activityType: string;
  /** Rótulo legível da atividade (ex.: "Sobreaviso"). */
  activityLabel: string;
  hasAttachment: boolean;
}

/** Uma linha de consultor no accordion de um projeto. */
export interface CockpitConsultantRow {
  consultantId: string;
  consultantName: string;
  diasSemLancamento: number;
  diasPendentes: number;
  /** Total de horas lançadas no mês (qualquer status), somadas. */
  horasLancadas: number;
  /**
   * Lançamentos de exceção do consultor no mês (item 3): não-WORKDAY ou WORKDAY
   * com anexo. Vazio = sem alerta. Ordenados por data.
   */
  exceptions: CockpitException[];
}

/** Uma linha de projeto no cockpit (uma competência). */
export interface CockpitProjectRow {
  projectId: string;
  projectName: string;
  clientName: string;
  /** Existe `RevenueClosing` CLOSED/INVOICED para (projeto, competência). */
  financeiroLiberado: boolean;
  /** Existe `OperationClosing` CLOSED para (projeto, competência). */
  dpLiberado: boolean;
  /** ATIVO (falta ≥1 eixo) vs. HISTORICO (ambos liberados). */
  phase: CockpitProjectPhase;
  /**
   * Flag operacional `Project.dailyEntryRequired` (proposta item 1.2): `true`
   * mantém a cobrança semanal e a contagem de "dias sem lançamento" como
   * pendência; `false` deixa a métrica apenas informativa.
   */
  dailyEntryRequired: boolean;
  /** Prontidão DP (helper canônico): `canClose` + contadores/motivo do bloqueio. */
  readiness: OperationReadiness;
  /** Consultores alocados (Allocation vigente) com suas métricas na competência. */
  consultants: CockpitConsultantRow[];
  /**
   * Total de horas lançadas no projeto na competência = soma das horas dos
   * consultores exibidos (o time alocado vigente). Consistente com as linhas
   * mostradas na tabela do accordion.
   */
  totalHoras: number;
}

/** Resultado do cockpit para UMA competência. */
export interface CockpitOverview {
  month: number;
  year: number;
  projects: CockpitProjectRow[];
}

/** Arredonda para 2 casas (horas), evitando ruído de ponto flutuante. */
const round2 = (n: number): number => Math.round(n * 100) / 100;

/** Limites da competência: início inclusivo, fim exclusivo e último dia (feriados). */
function monthBounds(
  month: number,
  year: number,
): { start: Date; endExclusive: Date; lastDay: Date } {
  return {
    start: new Date(Date.UTC(year, month - 1, 1)),
    endExclusive: new Date(Date.UTC(year, month, 1)),
    // Dia 0 do mês seguinte = último dia do mês corrente (à meia-noite UTC).
    lastDay: new Date(Date.UTC(year, month, 0)),
  };
}

/**
 * Conjunto de datas-feriado ISO aplicáveis a UM projeto no recorte, derivado do
 * `HolidayLookup` já carregado (não recomputa feriado): global ∪ vinculados ao
 * projeto — mesma semântica de `resolveProjectHoliday`.
 */
function applicableHolidaySet(
  lookup: HolidayLookup,
  projectId: string,
): Set<string> {
  const set = new Set<string>(Object.keys(lookup.global));
  const byProject = lookup.byProject[projectId];
  if (byProject) {
    for (const iso of Object.keys(byProject)) set.add(iso);
  }
  return set;
}

interface AllocatedConsultant {
  consultantId: string;
  consultantName: string;
}

/**
 * Monta o cockpit para a competência dada. Todas as coleções vêm em lote; a
 * prontidão DP roda por projeto em paralelo.
 */
export async function getCockpitOverview(input: {
  month: number;
  year: number;
}): Promise<CockpitOverview> {
  const { month, year } = input;
  const competence: CockpitCompetence = { month, year };
  const { start, endExclusive, lastDay } = monthBounds(month, year);

  // 1. Projetos ATIVOS (uma linha por projeto).
  const projects = await prisma.project.findMany({
    where: { status: "ACTIVE" },
    select: {
      id: true,
      name: true,
      dailyEntryRequired: true,
      client: { select: { name: true } },
    },
    orderBy: [{ client: { name: "asc" } }, { name: "asc" }],
  });
  const projectIds = projects.map((p) => p.id);

  if (projectIds.length === 0) {
    return { month, year, projects: [] };
  }

  // 2. Dados de coleção em lote (feriados, alocações vigentes, lançamentos, os
  //    dois eixos de liberação).
  const [lookup, allocations, entries, revenueClosings, operationClosings] =
    await Promise.all([
      getHolidayLookup(start, lastDay),
      prisma.allocation.findMany({
        where: {
          projectId: { in: projectIds },
          status: "ACTIVE",
          startDate: { lt: endExclusive },
          OR: [{ endDate: null }, { endDate: { gte: start } }],
        },
        select: {
          projectId: true,
          consultantId: true,
          consultant: { select: { name: true } },
        },
      }),
      prisma.timeEntry.findMany({
        where: {
          projectId: { in: projectIds },
          date: { gte: start, lt: endExclusive },
        },
        select: {
          projectId: true,
          consultantId: true,
          date: true,
          status: true,
          hours: true,
          activityType: true,
          attachment: { select: { id: true } },
        },
      }),
      prisma.revenueClosing.findMany({
        where: {
          projectId: { in: projectIds },
          month,
          year,
          status: { in: ["CLOSED", "INVOICED"] },
        },
        select: { projectId: true },
      }),
      prisma.operationClosing.findMany({
        where: { projectId: { in: projectIds }, month, year, status: "CLOSED" },
        select: { projectId: true },
      }),
    ]);

  // projectId → (consultantId → consultor alocado vigente).
  const teamByProject = new Map<string, Map<string, AllocatedConsultant>>();
  for (const a of allocations) {
    let team = teamByProject.get(a.projectId);
    if (!team) {
      team = new Map();
      teamByProject.set(a.projectId, team);
    }
    if (!team.has(a.consultantId)) {
      team.set(a.consultantId, {
        consultantId: a.consultantId,
        consultantName: a.consultant?.name ?? "Consultor",
      });
    }
  }

  // projectId → (consultantId → dias lançados). Uma entrada por TimeEntry.
  const entriesByProject = new Map<string, Map<string, CockpitEntryDay[]>>();
  // projectId → (consultantId → soma de horas lançadas no mês).
  const hoursByProject = new Map<string, Map<string, number>>();
  // projectId → (consultantId → lançamentos de exceção). Item 3.
  const exceptionsByProject = new Map<string, Map<string, CockpitException[]>>();
  for (const e of entries) {
    const iso = toIsoDate(e.date);
    let byConsultant = entriesByProject.get(e.projectId);
    if (!byConsultant) {
      byConsultant = new Map();
      entriesByProject.set(e.projectId, byConsultant);
    }
    const list = byConsultant.get(e.consultantId) ?? [];
    list.push({ date: iso, status: e.status });
    byConsultant.set(e.consultantId, list);

    let hoursOfConsultant = hoursByProject.get(e.projectId);
    if (!hoursOfConsultant) {
      hoursOfConsultant = new Map();
      hoursByProject.set(e.projectId, hoursOfConsultant);
    }
    hoursOfConsultant.set(
      e.consultantId,
      (hoursOfConsultant.get(e.consultantId) ?? 0) + Number(e.hours ?? 0),
    );

    const hasAttachment = e.attachment != null;
    if (isExceptionEntry({ activityType: e.activityType, hasAttachment })) {
      let exByConsultant = exceptionsByProject.get(e.projectId);
      if (!exByConsultant) {
        exByConsultant = new Map();
        exceptionsByProject.set(e.projectId, exByConsultant);
      }
      const exList = exByConsultant.get(e.consultantId) ?? [];
      exList.push({
        date: iso,
        activityType: e.activityType,
        activityLabel: activityLabelOf(e.activityType),
        hasAttachment,
      });
      exByConsultant.set(e.consultantId, exList);
    }
  }

  const financeSet = new Set(
    revenueClosings
      .map((r) => r.projectId)
      .filter((id): id is string => Boolean(id)),
  );
  const dpSet = new Set(operationClosings.map((o) => o.projectId));

  // 3. Uma linha por projeto; prontidão DP em paralelo (helper canônico).
  const rows = await Promise.all(
    projects.map(async (p): Promise<CockpitProjectRow> => {
      const holidaySet = applicableHolidaySet(lookup, p.id);
      const team = teamByProject.get(p.id) ?? new Map<string, AllocatedConsultant>();
      const entriesByConsultant =
        entriesByProject.get(p.id) ?? new Map<string, CockpitEntryDay[]>();
      const hoursByConsultant =
        hoursByProject.get(p.id) ?? new Map<string, number>();
      const exceptionsByConsultant =
        exceptionsByProject.get(p.id) ?? new Map<string, CockpitException[]>();

      const consultants: CockpitConsultantRow[] = [...team.values()]
        .map((c) => {
          const metrics = computeConsultantMetrics(
            competence,
            holidaySet,
            entriesByConsultant.get(c.consultantId) ?? [],
          );
          const exceptions = (exceptionsByConsultant.get(c.consultantId) ?? [])
            .slice()
            .sort((a, b) => a.date.localeCompare(b.date));
          return {
            consultantId: c.consultantId,
            consultantName: c.consultantName,
            diasSemLancamento: metrics.diasSemLancamento,
            diasPendentes: metrics.diasPendentes,
            horasLancadas: round2(hoursByConsultant.get(c.consultantId) ?? 0),
            exceptions,
          };
        })
        .sort((a, b) => a.consultantName.localeCompare(b.consultantName, "pt-BR"));

      const totalHoras = round2(
        consultants.reduce((sum, c) => sum + c.horasLancadas, 0),
      );

      const readiness = await getOperationReadiness(p.id, month, year);
      const financeiroLiberado = financeSet.has(p.id);
      const dpLiberado = dpSet.has(p.id);

      return {
        projectId: p.id,
        projectName: p.name,
        clientName: p.client?.name ?? "—",
        financeiroLiberado,
        dpLiberado,
        phase: classifyProjectPhase(financeiroLiberado, dpLiberado),
        dailyEntryRequired: p.dailyEntryRequired,
        readiness,
        consultants,
        totalHoras,
      };
    }),
  );

  return { month, year, projects: rows };
}

// ---------------------------------------------------------------------------
// Calendário por consultor + competência (proposta item 1.1.1.1).
// ---------------------------------------------------------------------------

/**
 * Estado de pintura de um dia na grade do calendário. Um dia COM lançamento é
 * classificado pelo status dos seus `TimeEntry` (reusa a mesma prioridade da
 * prontidão DP via `classifyConsultantReadiness`); um dia SEM lançamento cai em
 * feriado > fim de semana > vazio (dia útil sem lançamento).
 */
export type CockpitCalendarDayKind =
  | "APPROVED"
  | "PENDING"
  | "DRAFT"
  | "REJECTED"
  | "EMPTY"
  | "HOLIDAY"
  | "WEEKEND";

/**
 * Um lançamento do dia no calendário do consultor (item 4): a atividade, as
 * horas e — quando há anexo — o id do `TimeEntry` para gerar a URL assinada de
 * visualização (o clip). Pode haver mais de um por dia (atividades distintas).
 */
export interface CockpitCalendarActivity {
  /** Id do TimeEntry (usado para abrir o anexo via signed URL). */
  entryId: string;
  activityType: string;
  activityLabel: string;
  hours: number;
  /** Quando true, há anexo e o clip deve linkar para `entryId`. */
  hasAttachment: boolean;
}

export interface CockpitCalendarDay {
  /** ISO `yyyy-mm-dd`. */
  date: string;
  /** Dia do mês (1..N). */
  day: number;
  /** 0 = domingo … 6 = sábado (UTC, coerente com a convenção date-only). */
  weekday: number;
  kind: CockpitCalendarDayKind;
  /** Nome do feriado aplicável ao projeto/data, quando houver. */
  holidayName: string | null;
  /** Horas lançadas no dia (qualquer status), somadas. */
  hours: number;
  /** Lançamentos do dia (atividade, horas, anexo). Item 4. */
  activities: CockpitCalendarActivity[];
}

export interface CockpitCalendar {
  month: number;
  year: number;
  projectId: string;
  projectName: string;
  consultantId: string;
  consultantName: string;
  days: CockpitCalendarDay[];
  /** Total de horas lançadas no mês (soma de todos os dias). */
  totalHoras: number;
}

/**
 * Pinta o "kind" de um dia a partir dos status dos lançamentos (reusa a mesma
 * prioridade de `classifyConsultantReadiness`); sem lançamentos cai em
 * feriado > fim de semana > vazio. Compartilhado pelos calendários de consultor
 * e de projeto.
 */
function calendarDayKind(
  statuses: readonly string[],
  holidayName: string | null,
  iso: string,
): CockpitCalendarDayKind {
  if (statuses.length > 0) {
    const state = classifyConsultantReadiness(statuses);
    return state === "APPROVED"
      ? "APPROVED"
      : state === "PENDING_REVIEW"
        ? "PENDING"
        : state === "REJECTED"
          ? "REJECTED"
          : "DRAFT";
  }
  if (holidayName) return "HOLIDAY";
  if (isWeekend(iso)) return "WEEKEND";
  return "EMPTY";
}

/**
 * Grade do mês de UM consultor em UM projeto (drawer do cockpit). Reusa os
 * helpers puros de `cockpit-core` (fim de semana) e o lookup de feriados já
 * usado no overview (NÃO reimplementa feriado): global ∪ vinculados ao projeto.
 * Um dia é pintado pelo status dos lançamentos quando houver; senão por
 * feriado/fim de semana/vazio. Retorna `null` se o projeto ou o consultor não
 * existir.
 */
export async function getConsultantCalendar(input: {
  projectId: string;
  consultantId: string;
  month: number;
  year: number;
}): Promise<CockpitCalendar | null> {
  const { projectId, consultantId, month, year } = input;
  const { start, endExclusive, lastDay } = monthBounds(month, year);

  const [project, consultant, lookup, entries] = await Promise.all([
    prisma.project.findUnique({
      where: { id: projectId },
      select: { name: true },
    }),
    prisma.consultant.findUnique({
      where: { id: consultantId },
      select: { name: true },
    }),
    getHolidayLookup(start, lastDay),
    prisma.timeEntry.findMany({
      where: {
        projectId,
        consultantId,
        date: { gte: start, lt: endExclusive },
      },
      select: {
        id: true,
        date: true,
        status: true,
        hours: true,
        activityType: true,
        attachment: { select: { id: true } },
      },
    }),
  ]);
  if (!project || !consultant) return null;

  const holidaySet = applicableHolidaySet(lookup, projectId);

  // ISO date → { statuses[], hours, activities[] } (pode haver mais de um
  // TimeEntry no dia, com atividades distintas).
  const byDay = new Map<
    string,
    { statuses: string[]; hours: number; activities: CockpitCalendarActivity[] }
  >();
  for (const e of entries) {
    const iso = toIsoDate(e.date);
    const bucket = byDay.get(iso) ?? { statuses: [], hours: 0, activities: [] };
    bucket.statuses.push(e.status);
    bucket.hours += Number(e.hours);
    bucket.activities.push({
      entryId: e.id,
      activityType: e.activityType,
      activityLabel: activityLabelOf(e.activityType),
      hours: round2(Number(e.hours ?? 0)),
      hasAttachment: e.attachment != null,
    });
    byDay.set(iso, bucket);
  }

  const mm = String(month).padStart(2, "0");
  const lastDayNum = new Date(Date.UTC(year, month, 0)).getUTCDate();
  const days: CockpitCalendarDay[] = [];
  for (let d = 1; d <= lastDayNum; d += 1) {
    const iso = `${year}-${mm}-${String(d).padStart(2, "0")}`;
    const weekday = new Date(`${iso}T00:00:00.000Z`).getUTCDay();
    const holidayName = holidaySet.has(iso)
      ? (lookup.byProject[projectId]?.[iso] ?? lookup.global[iso] ?? null)
      : null;
    const bucket = byDay.get(iso);

    days.push({
      date: iso,
      day: d,
      weekday,
      kind: calendarDayKind(bucket?.statuses ?? [], holidayName, iso),
      holidayName,
      hours: bucket ? round2(bucket.hours) : 0,
      activities: bucket?.activities ?? [],
    });
  }

  return {
    month,
    year,
    projectId,
    projectName: project.name,
    consultantId,
    consultantName: consultant.name,
    days,
    totalHoras: round2(days.reduce((sum, d) => sum + d.hours, 0)),
  };
}

// ---------------------------------------------------------------------------
// Calendário por PROJETO + competência (proposta item 2).
// ---------------------------------------------------------------------------

/** Uma situação de exceção num dia do calendário de projeto (para o hover). */
export interface CockpitProjectCalendarException {
  consultantName: string;
  activityType: string;
  activityLabel: string;
  hasAttachment: boolean;
}

export interface CockpitProjectCalendarDay {
  /** ISO `yyyy-mm-dd`. */
  date: string;
  day: number;
  weekday: number;
  /** Status agregado do dia (pior status entre todos os consultores). */
  kind: CockpitCalendarDayKind;
  holidayName: string | null;
  /** Total de horas lançadas no dia (todos os consultores). */
  hours: number;
  /**
   * Lançamentos de exceção no dia (item 2): qualquer consultor com atividade
   * não-WORKDAY ou WORKDAY com anexo. Vazio = sem alerta. Alimenta o hover.
   */
  exceptions: CockpitProjectCalendarException[];
}

export interface CockpitProjectCalendar {
  month: number;
  year: number;
  projectId: string;
  projectName: string;
  clientName: string;
  days: CockpitProjectCalendarDay[];
  totalHoras: number;
}

/**
 * Grade do mês de UM projeto agregando TODOS os consultores (drawer do item 2).
 * Cada dia mostra o status agregado (pior status), o total de horas e a lista de
 * lançamentos de exceção (não-WORKDAY ou WORKDAY com anexo) para o alerta/hover.
 * Reusa `calendarDayKind` (status), o lookup de feriados e `isExceptionEntry`.
 * Retorna `null` se o projeto não existir.
 */
export async function getProjectCalendar(input: {
  projectId: string;
  month: number;
  year: number;
}): Promise<CockpitProjectCalendar | null> {
  const { projectId, month, year } = input;
  const { start, endExclusive, lastDay } = monthBounds(month, year);

  const [project, lookup, entries] = await Promise.all([
    prisma.project.findUnique({
      where: { id: projectId },
      select: { name: true, client: { select: { name: true } } },
    }),
    getHolidayLookup(start, lastDay),
    prisma.timeEntry.findMany({
      where: { projectId, date: { gte: start, lt: endExclusive } },
      select: {
        date: true,
        status: true,
        hours: true,
        activityType: true,
        attachment: { select: { id: true } },
        consultant: { select: { name: true } },
      },
    }),
  ]);
  if (!project) return null;

  const holidaySet = applicableHolidaySet(lookup, projectId);

  const byDay = new Map<
    string,
    {
      statuses: string[];
      hours: number;
      exceptions: CockpitProjectCalendarException[];
    }
  >();
  for (const e of entries) {
    const iso = toIsoDate(e.date);
    const bucket = byDay.get(iso) ?? { statuses: [], hours: 0, exceptions: [] };
    bucket.statuses.push(e.status);
    bucket.hours += Number(e.hours ?? 0);
    const hasAttachment = e.attachment != null;
    if (isExceptionEntry({ activityType: e.activityType, hasAttachment })) {
      bucket.exceptions.push({
        consultantName: e.consultant?.name ?? "Consultor",
        activityType: e.activityType,
        activityLabel: activityLabelOf(e.activityType),
        hasAttachment,
      });
    }
    byDay.set(iso, bucket);
  }

  const mm = String(month).padStart(2, "0");
  const lastDayNum = new Date(Date.UTC(year, month, 0)).getUTCDate();
  const days: CockpitProjectCalendarDay[] = [];
  for (let d = 1; d <= lastDayNum; d += 1) {
    const iso = `${year}-${mm}-${String(d).padStart(2, "0")}`;
    const weekday = new Date(`${iso}T00:00:00.000Z`).getUTCDay();
    const holidayName = holidaySet.has(iso)
      ? (lookup.byProject[projectId]?.[iso] ?? lookup.global[iso] ?? null)
      : null;
    const bucket = byDay.get(iso);
    days.push({
      date: iso,
      day: d,
      weekday,
      kind: calendarDayKind(bucket?.statuses ?? [], holidayName, iso),
      holidayName,
      hours: bucket ? round2(bucket.hours) : 0,
      exceptions: bucket?.exceptions ?? [],
    });
  }

  return {
    month,
    year,
    projectId,
    projectName: project.name,
    clientName: project.client?.name ?? "—",
    days,
    totalHoras: round2(days.reduce((sum, day) => sum + day.hours, 0)),
  };
}
