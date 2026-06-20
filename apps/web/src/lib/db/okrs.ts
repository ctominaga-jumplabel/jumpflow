import { Prisma, prisma } from "@jumpflow/database";
import type { AppUser } from "@/lib/auth/types";
import { getConsultantForUser } from "@/lib/db/timesheet";
import { resolveDbUser } from "@/lib/db/users";
import {
  autoSourceBillableOnly,
  isAutoSourceApplicable,
  isKnownAutoSource,
  type AutoSourceKey,
} from "@/lib/okrs/auto-source";
import {
  computeKeyResultProgress,
  computeObjectiveProgress,
} from "@/lib/okrs/progress";
import {
  canManageObjective,
  canUpdateKeyResultValue,
  type ObjectiveRef,
  type OkrViewer,
} from "@/lib/okrs/visibility";
import type {
  ConsultantOption,
  KeyResultMetric,
  KeyResultView,
  ObjectiveScope,
  ObjectiveStatus,
  ObjectiveView,
  ProjectOption,
} from "@/lib/okrs/types";
import { isDatabaseConfigured } from "./config";

/**
 * Prisma reads/derivations for Metas e OKRs (EP 7.2).
 *
 * RBAC scope is applied HERE (per-row gating) using the pure helpers from
 * lib/okrs/visibility.ts — never trust the client and never filter only in the
 * UI. Progress is DERIVED (lib/okrs/progress.ts), never persisted. The auto-update
 * hook (resolveAutoSourceValue) reads real operational data (TimeEntry) for known
 * autoSources; unknown → manual.
 */

function decimalToNumber(value: Prisma.Decimal): number {
  return Number(value);
}

function isoDay(date: Date): string {
  return date.toISOString().slice(0, 10);
}

/** Resolve a identidade do espectador (User id + Consultant id vinculados). */
export async function resolveOkrViewer(user: AppUser): Promise<OkrViewer> {
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

// ── managerUserId responsável (escopo de gestão) ────────────────────────────

/**
 * managerUserId responsável por um consultor: o gestor de algum projeto em que
 * ele está alocado (mesmo critério dos demais módulos de talentos). null quando
 * não há gestor designado.
 */
export async function resolveConsultantManagerUserId(
  consultantId: string,
): Promise<string | null> {
  const allocation = await prisma.allocation.findFirst({
    where: { consultantId, project: { managerUserId: { not: null } } },
    select: { project: { select: { managerUserId: true } } },
  });
  return allocation?.project.managerUserId ?? null;
}

/** managerUserId de um projeto. null quando não há gestor designado. */
export async function resolveProjectManagerUserId(
  projectId: string,
): Promise<string | null> {
  const project = await prisma.project.findUnique({
    where: { id: projectId },
    select: { managerUserId: true },
  });
  return project?.managerUserId ?? null;
}

// ── Read-model shaping ──────────────────────────────────────────────────────

interface ObjectiveRow {
  id: string;
  scope: string;
  referenceKey: string | null;
  title: string;
  description: string | null;
  periodStart: Date;
  periodEnd: Date;
  status: string;
  ownerUserId: string | null;
  owner: { name: string } | null;
  consultantId: string | null;
  consultant: {
    name: string;
    allocations: { project: { managerUserId: string | null } }[];
  } | null;
  projectId: string | null;
  project: { name: string; managerUserId: string | null } | null;
  keyResults: {
    id: string;
    title: string;
    metricType: string;
    startValue: Prisma.Decimal;
    targetValue: Prisma.Decimal;
    currentValue: Prisma.Decimal;
    unit: string | null;
    autoSource: string | null;
  }[];
}

function toKeyResultView(kr: ObjectiveRow["keyResults"][number]): KeyResultView {
  const startValue = decimalToNumber(kr.startValue);
  const targetValue = decimalToNumber(kr.targetValue);
  const currentValue = decimalToNumber(kr.currentValue);
  const metricType = kr.metricType as KeyResultMetric;
  return {
    id: kr.id,
    title: kr.title,
    metricType,
    startValue,
    targetValue,
    currentValue,
    unit: kr.unit,
    autoSource: kr.autoSource,
    progress: computeKeyResultProgress({
      metricType,
      startValue,
      targetValue,
      currentValue,
    }),
  };
}

/** Constrói o ObjectiveRef (insumo das decisões por linha) a partir da row. */
function objectiveRefOf(row: ObjectiveRow): ObjectiveRef {
  const scope = row.scope as ObjectiveScope;
  let managerUserId: string | null = null;
  if (scope === "PROJECT") {
    managerUserId = row.project?.managerUserId ?? null;
  } else if (scope === "CONSULTANT") {
    managerUserId =
      row.consultant?.allocations.find((a) => a.project.managerUserId)?.project
        .managerUserId ?? null;
  }
  return {
    scope,
    consultantId: row.consultantId,
    projectId: row.projectId,
    managerUserId,
  };
}

function toObjectiveView(row: ObjectiveRow, viewer: OkrViewer): ObjectiveView {
  const keyResults = row.keyResults.map(toKeyResultView);
  const ref = objectiveRefOf(row);
  const canManage = canManageObjective(viewer, ref);
  const canUpdateProgress = canUpdateKeyResultValue(viewer, ref);
  return {
    id: row.id,
    scope: ref.scope,
    referenceKey: row.referenceKey,
    title: row.title,
    description: row.description,
    periodStart: isoDay(row.periodStart),
    periodEnd: isoDay(row.periodEnd),
    status: row.status as ObjectiveStatus,
    ownerUserId: row.ownerUserId,
    ownerName: row.owner?.name ?? null,
    consultantId: row.consultantId,
    consultantName: row.consultant?.name ?? null,
    projectId: row.projectId,
    projectName: row.project?.name ?? null,
    keyResults,
    progress: computeObjectiveProgress(keyResults),
    canManage,
    canUpdateProgress,
  };
}

const OBJECTIVE_SELECT = {
  id: true,
  scope: true,
  referenceKey: true,
  title: true,
  description: true,
  periodStart: true,
  periodEnd: true,
  status: true,
  ownerUserId: true,
  owner: { select: { name: true } },
  consultantId: true,
  consultant: {
    select: {
      name: true,
      allocations: {
        select: { project: { select: { managerUserId: true } } },
      },
    },
  },
  projectId: true,
  project: { select: { name: true, managerUserId: true } },
  keyResults: {
    select: {
      id: true,
      title: true,
      metricType: true,
      startValue: true,
      targetValue: true,
      currentValue: true,
      unit: true,
      autoSource: true,
    },
    orderBy: { createdAt: "asc" as const },
  },
} satisfies Prisma.ObjectiveSelect;

// ── Escopo → Prisma where ───────────────────────────────────────────────────

/**
 * Prisma `where` que materializa o universo visível ao espectador. Espelha as
 * regras puras de visibility.ts:
 * - ADMIN/AREA_MANAGER/PEOPLE: tudo.
 * - PROJECT_MANAGER: OKR de PROJECT que ele gere + OKR de CONSULTANT do seu time.
 * - CONSULTANT: o PRÓPRIO OKR (escopo CONSULTANT).
 * - sem identidade/papel: null → vazio.
 *
 * A flag por linha (canManage/canUpdateProgress) é refinada depois; o where só
 * garante que nada fora do papel chega na memória.
 */
function objectiveWhereForViewer(
  viewer: OkrViewer,
): Prisma.ObjectiveWhereInput | null {
  const { roles, userId, consultantId } = viewer;
  if (
    roles.includes("ADMIN") ||
    roles.includes("AREA_MANAGER") ||
    roles.includes("PEOPLE")
  ) {
    return {};
  }
  if (roles.includes("PROJECT_MANAGER") && userId) {
    return {
      OR: [
        { scope: "PROJECT", project: { managerUserId: userId } },
        {
          scope: "CONSULTANT",
          consultant: {
            allocations: { some: { project: { managerUserId: userId } } },
          },
        },
      ],
    };
  }
  if (roles.includes("CONSULTANT") && consultantId) {
    return { scope: "CONSULTANT", consultantId };
  }
  return null;
}

/** Lista os objetivos visíveis ao espectador, com KRs e progresso derivado. */
export async function listObjectives(user: AppUser): Promise<ObjectiveView[]> {
  if (!isDatabaseConfigured()) return [];
  const viewer = await resolveOkrViewer(user);
  const where = objectiveWhereForViewer(viewer);
  if (where === null) return [];

  const rows = await prisma.objective.findMany({
    where,
    select: OBJECTIVE_SELECT,
    orderBy: [{ periodEnd: "desc" }, { createdAt: "desc" }],
    take: 500,
  });
  return rows.map((row) => toObjectiveView(row as ObjectiveRow, viewer));
}

// ── Opções para os seletores de criação ─────────────────────────────────────

/**
 * Consultores-alvo de um OKR de escopo CONSULTANT. ADMIN/AREA_MANAGER/PEOPLE
 * veem todos os ativos; PROJECT_MANAGER vê só os do seu time; CONSULTANT não cria
 * estrutura → vazio.
 */
export async function listOkrConsultantOptions(
  user: AppUser,
): Promise<ConsultantOption[]> {
  if (!isDatabaseConfigured()) return [];
  const viewer = await resolveOkrViewer(user);
  const { roles, userId } = viewer;

  let where: Prisma.ConsultantWhereInput;
  if (
    roles.includes("ADMIN") ||
    roles.includes("AREA_MANAGER") ||
    roles.includes("PEOPLE")
  ) {
    where = { status: "ACTIVE" };
  } else if (roles.includes("PROJECT_MANAGER") && userId) {
    where = {
      status: "ACTIVE",
      allocations: { some: { project: { managerUserId: userId } } },
    };
  } else {
    return [];
  }

  const rows = await prisma.consultant.findMany({
    where,
    select: { id: true, name: true, seniority: true },
    orderBy: { name: "asc" },
  });
  return rows.map((r) => ({ id: r.id, name: r.name, seniority: r.seniority }));
}

/**
 * Projetos-alvo de um OKR de escopo PROJECT. ADMIN/AREA_MANAGER/PEOPLE veem
 * todos; PROJECT_MANAGER vê só os que gere. CONSULTANT não cria estrutura → vazio.
 */
export async function listOkrProjectOptions(
  user: AppUser,
): Promise<ProjectOption[]> {
  if (!isDatabaseConfigured()) return [];
  const viewer = await resolveOkrViewer(user);
  const { roles, userId } = viewer;

  let where: Prisma.ProjectWhereInput;
  if (
    roles.includes("ADMIN") ||
    roles.includes("AREA_MANAGER") ||
    roles.includes("PEOPLE")
  ) {
    where = {};
  } else if (roles.includes("PROJECT_MANAGER") && userId) {
    where = { managerUserId: userId };
  } else {
    return [];
  }

  const rows = await prisma.project.findMany({
    where,
    select: { id: true, name: true },
    orderBy: { name: "asc" },
    take: 500,
  });
  return rows.map((r) => ({ id: r.id, name: r.name }));
}

// ── Auto-update operacional (gancho real, US OKR.04) ────────────────────────

/**
 * Resolve o currentValue de um KR a partir do seu autoSource, lendo dado
 * operacional REAL (TimeEntry) no período/escopo do objetivo. Retorna null
 * quando a fonte é desconhecida ou não aplicável ao escopo (KR fica manual) — não
 * inventamos dados.
 *
 * Fontes implementadas (lib/okrs/auto-source.ts):
 * - hours_total: soma de horas APROVADAS no período (consultor ou projeto).
 * - hours_billable: idem, apenas faturáveis.
 *
 * Extensível: novas fontes (ex.: 'margin') entram com um case aqui + entrada no
 * catálogo. Margem exigiria papel financeiro e não está habilitada.
 */
export async function resolveAutoSourceValue(args: {
  autoSource: string | null;
  scope: ObjectiveScope;
  consultantId: string | null;
  projectId: string | null;
  periodStart: Date;
  periodEnd: Date;
}): Promise<number | null> {
  const { autoSource, scope, consultantId, projectId, periodStart, periodEnd } =
    args;
  if (!isKnownAutoSource(autoSource)) return null;
  if (!isAutoSourceApplicable(autoSource, scope)) return null;

  const key = autoSource as AutoSourceKey;

  // Âncora operacional: consultor (escopo CONSULTANT) ou projeto (escopo PROJECT).
  const entryWhere: Prisma.TimeEntryWhereInput = {
    status: "APPROVED",
    date: { gte: periodStart, lte: periodEnd },
  };
  if (scope === "CONSULTANT") {
    if (!consultantId) return null;
    entryWhere.consultantId = consultantId;
  } else if (scope === "PROJECT") {
    if (!projectId) return null;
    entryWhere.projectId = projectId;
  } else {
    return null;
  }
  if (autoSourceBillableOnly(key)) {
    entryWhere.billable = true;
  }

  const agg = await prisma.timeEntry.aggregate({
    where: entryWhere,
    _sum: { hours: true },
  });
  return agg._sum.hours ? Number(agg._sum.hours) : 0;
}

/**
 * Carrega o ObjectiveRef + período de um KR pelo seu id (para reaplicar RBAC e
 * resolver autoSource nos server actions). null se o KR não existe.
 */
export async function loadKeyResultContext(keyResultId: string): Promise<{
  keyResultId: string;
  objectiveId: string;
  autoSource: string | null;
  ref: ObjectiveRef;
  periodStart: Date;
  periodEnd: Date;
  currentValue: number;
} | null> {
  const kr = await prisma.keyResult.findUnique({
    where: { id: keyResultId },
    select: {
      id: true,
      objectiveId: true,
      autoSource: true,
      currentValue: true,
      objective: {
        select: {
          scope: true,
          consultantId: true,
          projectId: true,
          periodStart: true,
          periodEnd: true,
          project: { select: { managerUserId: true } },
          consultant: {
            select: {
              allocations: {
                select: { project: { select: { managerUserId: true } } },
              },
            },
          },
        },
      },
    },
  });
  if (!kr) return null;
  const o = kr.objective;
  const scope = o.scope as ObjectiveScope;
  let managerUserId: string | null = null;
  if (scope === "PROJECT") {
    managerUserId = o.project?.managerUserId ?? null;
  } else if (scope === "CONSULTANT") {
    managerUserId =
      o.consultant?.allocations.find((a) => a.project.managerUserId)?.project
        .managerUserId ?? null;
  }
  return {
    keyResultId: kr.id,
    objectiveId: kr.objectiveId,
    autoSource: kr.autoSource,
    ref: {
      scope,
      consultantId: o.consultantId,
      projectId: o.projectId,
      managerUserId,
    },
    periodStart: o.periodStart,
    periodEnd: o.periodEnd,
    currentValue: Number(kr.currentValue),
  };
}
