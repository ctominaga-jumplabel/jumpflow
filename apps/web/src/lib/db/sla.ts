/**
 * Camada de dados do SLA do fluxo de horas (item 5): configuracao
 * (SlaSettings/SlaStage), calendario de feriados e os dados brutos de uma
 * competencia que alimentam a avaliacao pura de `lib/sla/evaluate.ts`.
 *
 * Somente leitura aqui (a gravacao da configuracao vive na server action, com
 * RBAC + Zod + AuditEvent). Sem banco configurado, devolve os defaults do seed e
 * dados vazios — a tela continua navegavel em modo demo.
 */
import { unstable_cache } from "next/cache";
import { prisma } from "@jumpflow/database";
import type { AppUser } from "@/lib/auth/types";
import { isDatabaseConfigured } from "./config";
import { resolveDbUser } from "./users";
import {
  competenceKey,
  computeStageDeadline,
  competenceOf,
  daysInMonth,
  isoDate,
  isoDateInSaoPaulo,
  nextCompetence,
  shiftCompetence,
  slaCalendarFromHolidays,
  type BusinessCalendar,
  type Competence,
  type IsoDate,
  type SlaHolidayInput,
} from "@/lib/sla/business-days";
import {
  buildHistoryFromDigests,
  buildSlaFacts,
  digestEvaluations,
  evaluateProcess,
  scopeProcessEvaluation,
  type SlaCompetenceDigest,
  type SlaHistory,
  type SlaProcessEvaluation,
  type SlaRawData,
  type SlaViewerScope,
} from "@/lib/sla/evaluate";
import {
  SLA_PROCESSES,
  SLA_SETTINGS_DEFAULTS,
  SLA_STAGE_DEFAULTS,
  type SlaConfig,
  type SlaProcessKey,
  type SlaStageConfig,
} from "@/lib/sla/types";

const iso = (d: Date | null | undefined): string | null => (d ? d.toISOString() : null);
const day = (d: Date): IsoDate => d.toISOString().slice(0, 10);

/**
 * Configuracao vigente. Etapas ausentes no banco (tabela vazia/migracao parcial)
 * sao completadas com os defaults, para a tela e o job nunca ficarem sem prazo.
 */
export async function loadSlaConfig(): Promise<SlaConfig> {
  if (!isDatabaseConfigured()) {
    return { settings: { ...SLA_SETTINGS_DEFAULTS }, stages: SLA_STAGE_DEFAULTS.map((s) => ({ ...s })) };
  }
  const [settings, rows] = await Promise.all([
    prisma.slaSettings.findUnique({ where: { id: "default" } }),
    prisma.slaStage.findMany({ orderBy: [{ process: "asc" }, { sortOrder: "asc" }] }),
  ]);
  const byKey = new Map(rows.map((r) => [`${r.process}:${r.stageKey}`, r]));
  const stages: SlaStageConfig[] = SLA_STAGE_DEFAULTS.map((def) => {
    const row = byKey.get(`${def.process}:${def.stageKey}`);
    if (!row) return { ...def };
    return {
      process: row.process,
      stageKey: row.stageKey,
      area: row.area,
      label: row.label,
      anchor: row.anchor,
      businessDays: row.businessDays,
      warningBusinessDays: row.warningBusinessDays,
      sortOrder: row.sortOrder,
      active: row.active,
    };
  });
  return {
    settings: settings
      ? { paymentDay: settings.paymentDay, considerStateHolidays: settings.considerStateHolidays }
      : { ...SLA_SETTINGS_DEFAULTS },
    stages,
  };
}

/**
 * Feriados GLOBAIS (sem vinculo de projeto) no intervalo, com escopo — o
 * filtro nacional/estadual e aplicado por `slaCalendarFromHolidays`.
 */
export async function loadSlaHolidays(from: IsoDate, to: IsoDate): Promise<SlaHolidayInput[]> {
  if (!isDatabaseConfigured()) return [];
  const rows = await prisma.holiday.findMany({
    where: {
      date: { gte: new Date(`${from}T00:00:00.000Z`), lte: new Date(`${to}T00:00:00.000Z`) },
      projects: { none: {} },
    },
    select: { date: true, name: true, scope: true },
    orderBy: { date: "asc" },
  });
  return rows.map((r) => ({ date: day(r.date), name: r.name, scope: r.scope }));
}

/**
 * Intervalo de datas que cobre todos os prazos possiveis das competencias:
 * do 1o dia da primeira competencia ate o fim do 2o mes apos a ultima (prazos
 * do tipo "N dias uteis apos o fim do mes" com N grande podem transbordar).
 */
export function calendarRange(first: Competence, last: Competence): { from: IsoDate; to: IsoDate } {
  const end = shiftCompetence(last, 2);
  return {
    from: isoDate(first.year, first.month, 1),
    to: isoDate(end.year, end.month, daysInMonth(end.year, end.month)),
  };
}

export async function loadSlaCalendar(
  first: Competence,
  last: Competence,
  considerStateHolidays: boolean,
): Promise<{ calendar: BusinessCalendar; holidays: SlaHolidayInput[] }> {
  const range = calendarRange(first, last);
  const holidays = await loadSlaHolidays(range.from, range.to);
  return { calendar: slaCalendarFromHolidays(holidays, considerStateHolidays), holidays };
}

const APPROVAL_CHUNK = 1000;

/**
 * Dados brutos de uma competencia para `buildSlaFacts`. `labels: false` (caminho
 * do historico/job sem nomes) pula as leituras de nomes de consultor/gestor/
 * cliente — a avaliacao so precisa de ids, datas e status.
 */
export async function loadSlaRawData(
  competence: Competence,
  { labels = true }: { labels?: boolean } = {},
): Promise<SlaRawData> {
  const empty: SlaRawData = {
    competence,
    consultants: {},
    projects: {},
    allocations: [],
    entries: [],
    operationClosings: [],
    revenueClosings: [],
    payments: [],
  };
  if (!isDatabaseConfigured()) return empty;

  const { year, month } = competence;
  const monthStart = new Date(`${isoDate(year, month, 1)}T00:00:00.000Z`);
  const next = nextCompetence(competence);
  const nextStart = new Date(`${isoDate(next.year, next.month, 1)}T00:00:00.000Z`);

  const [allocations, entries, operationClosings, revenueClosings, payments] = await Promise.all([
    prisma.allocation.findMany({
      where: {
        status: { in: ["ACTIVE", "ENDED"] },
        startDate: { lt: nextStart },
        OR: [{ endDate: null }, { endDate: { gte: monthStart } }],
      },
      select: { consultantId: true, projectId: true, startDate: true, endDate: true },
    }),
    prisma.timeEntry.findMany({
      where: { date: { gte: monthStart, lt: nextStart } },
      select: {
        id: true,
        consultantId: true,
        projectId: true,
        date: true,
        status: true,
        billable: true,
        submittedAt: true,
        updatedAt: true,
      },
    }),
    prisma.operationClosing.findMany({
      where: { month, year },
      select: { projectId: true, status: true, closedAt: true, updatedAt: true },
    }),
    prisma.revenueClosing.findMany({
      where: { month, year },
      select: { clientId: true, projectId: true, status: true, closedAt: true, updatedAt: true },
    }),
    prisma.consultantPayment.findMany({
      where: { month, year },
      select: {
        id: true,
        consultantId: true,
        contractType: true,
        status: true,
        peopleReleasedAt: true,
        invoiceRequestSentAt: true,
        invoiceReceivedAt: true,
        invoiceValidatedAt: true,
        approvedAt: true,
        confirmedPaidAt: true,
        updatedAt: true,
      },
    }),
  ]);

  // Instante da aprovacao: Approval APPROVED mais recente por lancamento.
  const approvedIds = entries
    .filter((e) => e.status === "APPROVED" || e.status === "CLOSED")
    .map((e) => e.id);
  const approvedAt = new Map<string, string>();
  const chunks: string[][] = [];
  for (let i = 0; i < approvedIds.length; i += APPROVAL_CHUNK) {
    chunks.push(approvedIds.slice(i, i + APPROVAL_CHUNK));
  }
  const approvalRows = await Promise.all(
    chunks.map((ids) =>
      prisma.approval.findMany({
        where: { entityType: "TIME_ENTRY", status: "APPROVED", entityId: { in: ids } },
        select: { entityId: true, createdAt: true },
      }),
    ),
  );
  for (const rows of approvalRows) {
    for (const r of rows) {
      const at = r.createdAt.toISOString();
      const prev = approvedAt.get(r.entityId);
      if (!prev || at > prev) approvedAt.set(r.entityId, at);
    }
  }

  const projectIds = new Set<string>();
  const consultantIds = new Set<string>();
  for (const a of allocations) {
    projectIds.add(a.projectId);
    consultantIds.add(a.consultantId);
  }
  for (const e of entries) {
    projectIds.add(e.projectId);
    consultantIds.add(e.consultantId);
  }
  for (const c of operationClosings) projectIds.add(c.projectId);
  for (const c of revenueClosings) if (c.projectId) projectIds.add(c.projectId);
  for (const p of payments) consultantIds.add(p.consultantId);

  const [projects, consultants] = await Promise.all([
    labels
      ? prisma.project.findMany({
          where: { id: { in: [...projectIds] } },
          select: {
            id: true,
            name: true,
            clientId: true,
            managerUserId: true,
            dailyEntryRequired: true,
            client: { select: { name: true } },
          },
        })
      : prisma.project
          .findMany({
            where: { id: { in: [...projectIds] } },
            select: { id: true, clientId: true, dailyEntryRequired: true },
          })
          .then((rows) =>
            rows.map((r) => ({ ...r, name: "", managerUserId: null as string | null, client: null })),
          ),
    labels
      ? prisma.consultant.findMany({
          where: { id: { in: [...consultantIds] } },
          select: { id: true, name: true },
        })
      : Promise.resolve([] as Array<{ id: string; name: string }>),
  ]);
  const managerIds = [...new Set(projects.map((p) => p.managerUserId).filter((v): v is string => !!v))];
  const managers = managerIds.length
    ? await prisma.user.findMany({ where: { id: { in: managerIds } }, select: { id: true, name: true } })
    : [];
  const managerName = new Map(managers.map((m) => [m.id, m.name]));

  return {
    competence,
    consultants: Object.fromEntries(consultants.map((c) => [c.id, c.name])),
    projects: Object.fromEntries(
      projects.map((p) => [
        p.id,
        {
          id: p.id,
          name: p.name,
          clientId: p.clientId,
          clientName: p.client?.name ?? "—",
          managerName: p.managerUserId ? (managerName.get(p.managerUserId) ?? null) : null,
          dailyEntryRequired: p.dailyEntryRequired,
        },
      ]),
    ),
    allocations: allocations.map((a) => ({
      consultantId: a.consultantId,
      projectId: a.projectId,
      startDate: day(a.startDate),
      endDate: a.endDate ? day(a.endDate) : null,
    })),
    entries: entries.map((e) => ({
      id: e.id,
      consultantId: e.consultantId,
      projectId: e.projectId,
      date: day(e.date),
      status: e.status,
      billable: e.billable,
      submittedAt: iso(e.submittedAt),
      updatedAt: e.updatedAt.toISOString(),
      approvedAt: approvedAt.get(e.id) ?? null,
    })),
    operationClosings: operationClosings.map((c) => ({
      projectId: c.projectId,
      status: c.status,
      closedAt: iso(c.closedAt),
      updatedAt: c.updatedAt.toISOString(),
    })),
    revenueClosings: revenueClosings.map((c) => ({
      clientId: c.clientId,
      projectId: c.projectId,
      status: c.status,
      closedAt: iso(c.closedAt),
      updatedAt: c.updatedAt.toISOString(),
    })),
    payments: payments.map((p) => ({
      id: p.id,
      consultantId: p.consultantId,
      contractType: p.contractType,
      status: p.status,
      peopleReleasedAt: iso(p.peopleReleasedAt),
      invoiceRequestSentAt: iso(p.invoiceRequestSentAt),
      invoiceReceivedAt: iso(p.invoiceReceivedAt),
      invoiceValidatedAt: iso(p.invoiceValidatedAt),
      approvedAt: iso(p.approvedAt),
      confirmedPaidAt: iso(p.confirmedPaidAt),
      updatedAt: p.updatedAt.toISOString(),
    })),
  };
}

/** Avalia os dois processos de uma competencia. */
export async function evaluateCompetence(input: {
  competence: Competence;
  config: SlaConfig;
  calendar: BusinessCalendar;
  today: IsoDate;
  labels?: boolean;
}): Promise<Record<SlaProcessKey, SlaProcessEvaluation>> {
  const raw = await loadSlaRawData(input.competence, { labels: input.labels ?? true });
  const facts = buildSlaFacts(raw, input.calendar);
  const out = {} as Record<SlaProcessKey, SlaProcessEvaluation>;
  for (const process of SLA_PROCESSES) {
    out[process] = evaluateProcess({
      process,
      competence: input.competence,
      config: input.config,
      calendar: input.calendar,
      today: input.today,
      facts,
    });
  }
  return out;
}

export const SLA_HISTORY_MONTHS = 6;

/** Revalidacao do digest de competencias ainda "vivas" (algum prazo futuro). */
export const SLA_DIGEST_REVALIDATE_SECONDS = 600;
/** Competencias com todos os prazos vencidos mudam pouco: cache mais longo. */
export const SLA_SETTLED_DIGEST_REVALIDATE_SECONDS = 6 * 3600;

/** Hash curto e estavel (djb2) para chaves de cache. */
function shortHash(value: string): string {
  let h = 5381;
  for (let i = 0; i < value.length; i++) h = ((h << 5) + h + value.charCodeAt(i)) | 0;
  return (h >>> 0).toString(36);
}

/** "Versao" da configuracao + calendario: muda a chave do cache ao salvar. */
export function slaConfigVersion(config: SlaConfig, calendar: BusinessCalendar): string {
  return shortHash(JSON.stringify(config) + "|" + [...calendar.holidays].sort().join(","));
}

/** Todos os prazos da competencia ja venceram (status nao depende mais de hoje). */
export function isCompetenceSettled(
  competence: Competence,
  config: SlaConfig,
  calendar: BusinessCalendar,
  today: IsoDate,
): boolean {
  return config.stages.every(
    (stage) => computeStageDeadline(stage, competence, config.settings, calendar) < today,
  );
}

/**
 * Digest (status por item, sem nomes) de uma competencia, cacheado com
 * unstable_cache. Chave = competencia + versao da config/calendario (+ dia,
 * enquanto houver prazo futuro, pois PENDENTE vira ATRASADO com o tempo).
 * Fora do runtime do Next (testes/scripts) cai na leitura direta.
 */
export async function loadCompetenceDigest(input: {
  competence: Competence;
  config: SlaConfig;
  calendar: BusinessCalendar;
  today: IsoDate;
}): Promise<SlaCompetenceDigest> {
  const compute = async () =>
    digestEvaluations(
      input.competence,
      await evaluateCompetence({ ...input, labels: false }),
    );
  const settled = isCompetenceSettled(input.competence, input.config, input.calendar, input.today);
  const keyParts = [
    "sla-digest",
    competenceKey(input.competence),
    slaConfigVersion(input.config, input.calendar),
    settled ? "settled" : input.today,
  ];
  try {
    return await unstable_cache(compute, keyParts, {
      revalidate: settled ? SLA_SETTLED_DIGEST_REVALIDATE_SECONDS : SLA_DIGEST_REVALIDATE_SECONDS,
      tags: ["sla"],
    })();
  } catch (error) {
    // Sem incrementalCache (fora de request Next): calcula direto.
    if (error instanceof Error && /incrementalCache|static generation store/i.test(error.message)) {
      return compute();
    }
    throw error;
  }
}

const BROAD_SLA_ROLES = new Set(["ADMIN", "AREA_MANAGER", "FINANCE", "PEOPLE"]);

/**
 * Escopo do visualizador da tela. `canSeePayments` vem da matriz
 * (PAGAMENTOS view). PROJECT_MANAGER sem papel amplo (ADMIN/AREA_MANAGER/
 * FINANCE/PEOPLE) ve apenas itens operacionais dos projetos que gerencia
 * (Project.managerUserId) — mesmo criterio de lib/project-risk/visibility.ts.
 * Sem usuario persistido => conjunto vazio (nunca vaza outro time).
 */
export async function resolveSlaViewerScope(
  user: AppUser,
  canSeePayments: boolean,
): Promise<SlaViewerScope> {
  if (user.roles.some((r) => BROAD_SLA_ROLES.has(r))) {
    return { canSeePayments, managedProjectIds: null };
  }
  if (!user.roles.includes("PROJECT_MANAGER")) {
    return { canSeePayments, managedProjectIds: null };
  }
  if (!isDatabaseConfigured()) return { canSeePayments, managedProjectIds: new Set() };
  const dbUser = await resolveDbUser(user);
  if (!dbUser) return { canSeePayments, managedProjectIds: new Set() };
  const projects = await prisma.project.findMany({
    where: { managerUserId: dbUser.id },
    select: { id: true },
  });
  return { canSeePayments, managedProjectIds: new Set(projects.map((p) => p.id)) };
}

export interface SlaDashboardData {
  config: SlaConfig;
  today: IsoDate;
  competence: Competence;
  /** Ja com o escopo do visualizador aplicado. */
  evaluations: Record<SlaProcessKey, SlaProcessEvaluation>;
  history: Record<SlaProcessKey, SlaHistory>;
  /** Feriados globais (todos os escopos) do intervalo: calendario + previa. */
  holidays: SlaHolidayInput[];
}

/**
 * Tudo que a tela /app/sla precisa. A competencia selecionada e avaliada por
 * completo (com nomes, sem cache — e o que o usuario esta acompanhando). O
 * historico das {@link SLA_HISTORY_MONTHS} - 1 competencias anteriores usa o
 * digest sem nomes, em paralelo e cacheado. O escopo do visualizador
 * (pagamentos / projetos do gestor) e aplicado no fim, sobre dados completos.
 */
export async function loadSlaDashboard(input: {
  competence: Competence;
  now: Date;
  scope: SlaViewerScope;
}): Promise<SlaDashboardData> {
  const config = await loadSlaConfig();
  const today = isoDateInSaoPaulo(input.now);
  const first = shiftCompetence(input.competence, -(SLA_HISTORY_MONTHS - 1));
  // O intervalo de feriados cobre o historico, a competencia selecionada e a
  // previa da configuracao (competencia corrente + 2).
  const current = competenceOf(today);
  const previewLast = shiftCompetence(current, 2);
  const rangeFirst = competenceKey(current) < competenceKey(first) ? current : first;
  const rangeLast =
    competenceKey(previewLast) > competenceKey(input.competence) ? previewLast : input.competence;
  const { calendar, holidays } = await loadSlaCalendar(
    rangeFirst,
    rangeLast,
    config.settings.considerStateHolidays,
  );

  const [selected, previous] = await Promise.all([
    evaluateCompetence({ competence: input.competence, config, calendar, today }),
    Promise.all(
      Array.from({ length: SLA_HISTORY_MONTHS - 1 }, (_, i) =>
        loadCompetenceDigest({ competence: shiftCompetence(first, i), config, calendar, today }),
      ),
    ),
  ]);
  const digests = [...previous, digestEvaluations(input.competence, selected)];

  const evaluations = {} as Record<SlaProcessKey, SlaProcessEvaluation>;
  const history = {} as Record<SlaProcessKey, SlaHistory>;
  for (const process of SLA_PROCESSES) {
    evaluations[process] = scopeProcessEvaluation(selected[process], input.scope);
    history[process] = buildHistoryFromDigests(digests, process, input.scope);
  }
  return { config, today, competence: input.competence, evaluations, history, holidays };
}
