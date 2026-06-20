import { Prisma, prisma } from "@jumpflow/database";
import type { AppUser } from "@/lib/auth/types";
import { resolveDbUser } from "@/lib/db/users";
import { getConsultantForUser } from "@/lib/db/timesheet";
import { computeConsultantScores } from "@/lib/consultant-score/engine";
import {
  includeFinancialForViewer,
  resolveConsultantScoreScope,
  type ConsultantScoreScope,
  type ConsultantScoreViewer,
} from "@/lib/consultant-score/visibility";
import type {
  ScoreConsultantInput,
  ScoreResult,
} from "@/lib/consultant-score/types";
import type { ConsultantScoreQueryInput } from "@/lib/consultant-score/schemas";
import { isDatabaseConfigured } from "./config";
import { buildConsultantScoreMock } from "./consultant-score.mock";

/**
 * Prisma reads for the Score do Consultor (§8.4). RBAC scope (quais consultores)
 * e o gate financeiro (includeFinancial) são aplicados AQUI — nunca confie no
 * cliente. O cálculo puro vive em lib/consultant-score/engine.ts; este módulo só
 * busca/molda rows e degrada para um mock quando o DB não está configurado
 * (docs/p3-inteligencia-design.md §5/§6). Sem novo schema — tudo é derivado sob
 * demanda dos dados existentes.
 *
 * LGPD: o saldo de feedback é obtido como CONTAGEM (positivos vs CONCERN) sem
 * jamais expor o conteúdo; feedbacks PRIVATE entram apenas para escopos de gestão
 * (all/manager), nunca para o próprio consultor, espelhando a regra de
 * `lib/feedback/visibility.ts`.
 */

/** Janela (dias) considerada para horas, feedback, cursos e realização. */
export const SCORE_WINDOW_DAYS = 90;

/** Jornada nominal diária (horas) usada para estimar as horas esperadas. */
export const DAILY_NOMINAL_HOURS = 8;

const DAY_MS = 24 * 60 * 60 * 1000;

function decimalToNumber(value: Prisma.Decimal | null | undefined): number | null {
  return value === null || value === undefined ? null : Number(value);
}

/** Conta os dias úteis (seg–sex) entre duas datas, inclusivo. */
function businessDaysBetween(start: Date, end: Date): number {
  if (end.getTime() < start.getTime()) return 0;
  let count = 0;
  const cursor = new Date(start.getTime());
  cursor.setHours(0, 0, 0, 0);
  const last = new Date(end.getTime());
  last.setHours(0, 0, 0, 0);
  while (cursor.getTime() <= last.getTime()) {
    const day = cursor.getDay();
    if (day !== 0 && day !== 6) count += 1;
    cursor.setTime(cursor.getTime() + DAY_MS);
  }
  return count;
}

export interface ConsultantScoreResultBundle {
  /** Score por consultor, ordenado por score desc (pode estar vazio). */
  results: ScoreResult[];
  /** true quando o fator de realização financeira entrou (FINANCIAL_ROLES). */
  financialIncluded: boolean;
  /** Consultor selecionado para o detalhe, quando há. */
  selectedConsultantId: string | null;
  /** true quando o resultado veio do mock (DB indisponível). */
  fromMock: boolean;
}

/** Resolve a identidade do espectador (User id + Consultant id vinculados). */
async function resolveViewer(user: AppUser): Promise<ConsultantScoreViewer> {
  const [dbUser, consultant] = await Promise.all([
    resolveDbUser(user),
    getConsultantForUser(user),
  ]);
  return {
    roles: user.roles,
    userId: dbUser?.id ?? null,
    consultantId: consultant?.id ?? null,
  };
}

/** Traduz o escopo de RBAC num `where` de Consultant. `null` = sem universo. */
function consultantWhereForScope(
  scope: ConsultantScoreScope,
): Prisma.ConsultantWhereInput | null {
  // Consultores inativos não entram no score ativo (também descartados pela
  // engine); o detalhe por id ainda pode trazê-los explicitamente via AND id.
  const base: Prisma.ConsultantWhereInput = {
    status: { in: ["ACTIVE", "ON_LEAVE"] },
  };
  if (scope.kind === "all") return base;
  if (scope.kind === "manager") {
    return {
      ...base,
      allocations: {
        some: { project: { managerUserId: scope.managerUserId } },
      },
    };
  }
  if (scope.kind === "self") {
    return { ...base, id: scope.consultantId };
  }
  return null;
}

/**
 * Computa o score dos consultores no escopo do requisitante, aplicando RBAC e o
 * gate financeiro no servidor. Degradação graciosa: sem DB → mock (mesma engine).
 */
export async function getConsultantScores(
  user: AppUser,
  query: ConsultantScoreQueryInput,
): Promise<ConsultantScoreResultBundle> {
  const selectedConsultantId = query.consultantId ?? null;

  if (!isDatabaseConfigured()) {
    // Sem viewer real: o escopo financeiro segue o gate de papel (o mock não
    // resolve "self"), suficiente para demonstrar a tela.
    const includeFinancial = user.roles.some((r) =>
      ["ADMIN", "AREA_MANAGER", "FINANCE"].includes(r),
    );
    return buildConsultantScoreMock(includeFinancial, selectedConsultantId);
  }

  const viewer = await resolveViewer(user);
  const scope = resolveConsultantScoreScope(viewer);
  const includeFinancial = includeFinancialForViewer(scope, user.roles);

  const where = consultantWhereForScope(scope);
  if (where === null) {
    return {
      results: [],
      financialIncluded: includeFinancial,
      selectedConsultantId,
      fromMock: false,
    };
  }

  const effectiveWhere: Prisma.ConsultantWhereInput = selectedConsultantId
    ? { AND: [where, { id: selectedConsultantId }] }
    : where;

  const consultants = await prisma.consultant.findMany({
    where: effectiveWhere,
    select: {
      id: true,
      name: true,
      seniority: true,
      area: true,
      jobTitle: true,
      status: true,
      certificates: { select: { status: true, expiresAt: true } },
      enrollments: {
        where: { status: "COMPLETED" },
        select: { id: true },
      },
    },
    orderBy: { name: "asc" },
  });

  if (consultants.length === 0) {
    return {
      results: [],
      financialIncluded: includeFinancial,
      selectedConsultantId,
      fromMock: false,
    };
  }

  const consultantIds = consultants.map((c) => c.id);
  const now = new Date();
  const windowStart = new Date(now.getTime() - SCORE_WINDOW_DAYS * DAY_MS);
  const expectedHours =
    businessDaysBetween(windowStart, now) * DAILY_NOMINAL_HOURS;

  // ── Horas APROVADAS por consultor na janela ───────────────────────────────
  const approvedByConsultant = await prisma.timeEntry.groupBy({
    by: ["consultantId"],
    where: {
      consultantId: { in: consultantIds },
      status: "APPROVED",
      date: { gte: windowStart },
    },
    _sum: { hours: true },
  });
  const approvedHoursById = new Map<string, number>();
  for (const row of approvedByConsultant) {
    approvedHoursById.set(
      row.consultantId,
      decimalToNumber(row._sum.hours) ?? 0,
    );
  }

  // Horas faturáveis aprovadas (para a realização financeira) — só financial.
  const billableHoursById = new Map<string, number>();
  if (includeFinancial) {
    const billableByConsultant = await prisma.timeEntry.groupBy({
      by: ["consultantId"],
      where: {
        consultantId: { in: consultantIds },
        status: "APPROVED",
        billable: true,
        date: { gte: windowStart },
      },
      _sum: { hours: true },
    });
    for (const row of billableByConsultant) {
      billableHoursById.set(
        row.consultantId,
        decimalToNumber(row._sum.hours) ?? 0,
      );
    }
  }

  // ── Saldo de feedback por consultor (contagem, sem conteúdo, na janela) ────
  // LGPD: para escopo de gestão (all/manager) contamos qualquer visibilidade;
  // para o próprio consultor (self) só feedbacks SHARED — feedbacks PRIVATE
  // sobre ele nunca compõem o que ele vê (espelha lib/feedback/visibility.ts).
  const feedbackVisibilityFilter: Prisma.FeedbackWhereInput =
    scope.kind === "self" ? { visibility: "SHARED" } : {};
  const feedbackCounts = await prisma.feedback.groupBy({
    by: ["subjectConsultantId", "type"],
    where: {
      subjectConsultantId: { in: consultantIds },
      createdAt: { gte: windowStart },
      ...feedbackVisibilityFilter,
    },
    _count: { _all: true },
  });
  const positiveById = new Map<string, number>();
  const concernById = new Map<string, number>();
  for (const row of feedbackCounts) {
    const count = row._count._all;
    if (row.type === "PRAISE" || row.type === "RECOGNITION") {
      positiveById.set(
        row.subjectConsultantId,
        (positiveById.get(row.subjectConsultantId) ?? 0) + count,
      );
    } else if (row.type === "CONCERN") {
      concernById.set(
        row.subjectConsultantId,
        (concernById.get(row.subjectConsultantId) ?? 0) + count,
      );
    }
  }

  // ── Médias de avaliação por consultor (dois ciclos fechados mais recentes) ─
  const { latestById, previousById } =
    await loadEvaluationAverages(consultantIds);

  // ── Referências financeiras (valor de venda / custo) — só financial ────────
  const { saleRateById, costRateById } = includeFinancial
    ? await loadFinancialRates(consultantIds)
    : { saleRateById: new Map<string, number>(), costRateById: new Map<string, number>() };

  const inputs: ScoreConsultantInput[] = consultants.map((c) => {
    const approvedHours = approvedHoursById.get(c.id) ?? 0;
    const validCertificates = c.certificates.filter(
      (cert) =>
        cert.status === "VALIDATED" &&
        (cert.expiresAt === null || cert.expiresAt.getTime() >= now.getTime()),
    ).length;
    const expiredCertificates = c.certificates.filter(
      (cert) =>
        cert.expiresAt !== null && cert.expiresAt.getTime() < now.getTime(),
    ).length;

    let realizedRevenue: number | null = null;
    let realizedCost: number | null = null;
    if (includeFinancial) {
      const sale = saleRateById.get(c.id) ?? null;
      const cost = costRateById.get(c.id) ?? null;
      const billable = billableHoursById.get(c.id) ?? 0;
      if (sale !== null) realizedRevenue = sale * billable;
      if (cost !== null) realizedCost = cost * approvedHours;
    }

    return {
      consultantId: c.id,
      consultantName: c.name,
      seniority: c.seniority,
      area: c.area,
      jobTitle: c.jobTitle,
      status: c.status as ScoreConsultantInput["status"],
      evaluationAverage: latestById.get(c.id) ?? null,
      previousEvaluationAverage: previousById.get(c.id) ?? null,
      approvedHours,
      expectedHours,
      validCertificates,
      expiredCertificates,
      completedCourses: c.enrollments.length,
      positiveFeedbacks: positiveById.get(c.id) ?? 0,
      concernFeedbacks: concernById.get(c.id) ?? 0,
      realizedRevenue,
      realizedCost,
    };
  });

  const results = computeConsultantScores(inputs, includeFinancial);

  return {
    results,
    financialIncluded: includeFinancial,
    selectedConsultantId,
    fromMock: false,
  };
}

/**
 * Média geral de avaliação (escala 1–5) por consultor, dos dois ciclos FECHADOS
 * mais recentes. `latest` é a média do ciclo mais recente; `previous`, do
 * penúltimo (para a tendência). Consolida todas as respostas COMPLETED e todas as
 * competências num único número por (consultor, ciclo).
 */
async function loadEvaluationAverages(consultantIds: string[]): Promise<{
  latestById: Map<string, number>;
  previousById: Map<string, number>;
}> {
  const evaluations = await prisma.evaluation.findMany({
    where: {
      subjectConsultantId: { in: consultantIds },
      cycle: { status: "CLOSED" },
    },
    select: {
      subjectConsultantId: true,
      cycle: { select: { id: true, periodEnd: true } },
      responses: {
        where: { status: "COMPLETED", submittedAt: { not: null } },
        select: { answers: { select: { score: true } } },
      },
    },
  });

  // (consultor → ciclos ordenados por periodEnd desc com a média do ciclo).
  const byConsultant = new Map<
    string,
    { periodEnd: number; average: number }[]
  >();
  for (const ev of evaluations) {
    let sum = 0;
    let count = 0;
    for (const resp of ev.responses) {
      for (const a of resp.answers) {
        sum += a.score;
        count += 1;
      }
    }
    if (count === 0) continue; // ciclo sem nota submetida não conta
    const list = byConsultant.get(ev.subjectConsultantId) ?? [];
    list.push({ periodEnd: ev.cycle.periodEnd.getTime(), average: sum / count });
    byConsultant.set(ev.subjectConsultantId, list);
  }

  const latestById = new Map<string, number>();
  const previousById = new Map<string, number>();
  for (const [consultantId, cycles] of byConsultant.entries()) {
    const ordered = cycles.sort((a, b) => b.periodEnd - a.periodEnd);
    if (ordered[0]) latestById.set(consultantId, ordered[0].average);
    if (ordered[1]) previousById.set(consultantId, ordered[1].average);
  }
  return { latestById, previousById };
}

/**
 * Valor de venda e custo hora de referência por consultor (só FINANCIAL_ROLES).
 * Usa o valor de venda mais recente das alocações do consultor e o custo hora mais
 * recente. Mapas vazios quando não há registro. Campos financeiros protegidos por
 * papel — só chamado quando includeFinancial.
 */
async function loadFinancialRates(consultantIds: string[]): Promise<{
  saleRateById: Map<string, number>;
  costRateById: Map<string, number>;
}> {
  const saleRateById = new Map<string, number>();
  const costRateById = new Map<string, number>();

  const [saleRows, costRows] = await Promise.all([
    prisma.projectSaleRate.findMany({
      where: { consultantId: { in: consultantIds } },
      orderBy: { startsAt: "desc" },
      select: { consultantId: true, hourlyRate: true },
    }),
    prisma.consultantAllocationCostRate.findMany({
      where: { consultantId: { in: consultantIds } },
      orderBy: { startsAt: "desc" },
      select: { consultantId: true, hourlyCost: true },
    }),
  ]);

  for (const row of saleRows) {
    if (row.consultantId === null) continue;
    if (!saleRateById.has(row.consultantId)) {
      const value = decimalToNumber(row.hourlyRate);
      if (value !== null) saleRateById.set(row.consultantId, value);
    }
  }
  for (const row of costRows) {
    if (!costRateById.has(row.consultantId)) {
      const value = decimalToNumber(row.hourlyCost);
      if (value !== null) costRateById.set(row.consultantId, value);
    }
  }
  return { saleRateById, costRateById };
}
