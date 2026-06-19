import { Prisma, prisma } from "@jumpflow/database";
import type { AppUser } from "@/lib/auth/types";
import { getConsultantForUser } from "@/lib/db/timesheet";
import { resolveDbUser } from "@/lib/db/users";
import {
  computeCell,
  resolveApplicableProfile,
  type ResolvableProfile,
} from "@/lib/competencies/gap";
import { skillLevelWeight, type SkillLevel } from "@/lib/competencies/types";
import { computePlanProgress, isoDay } from "@/lib/development/progress";
import { suggestActionsFromGap } from "@/lib/development/suggest";
import {
  canManagePlan,
  resolveDevelopmentScope,
  type DevelopmentScope,
  type DevelopmentViewer,
} from "@/lib/development/visibility";
import type {
  ConsultantOption,
  DevelopmentActionStatus,
  DevelopmentActionType,
  DevelopmentActionView,
  DevelopmentPlanStatus,
  DevelopmentPlanView,
  GapSkillInput,
  SuggestedAction,
} from "@/lib/development/types";
import { isDatabaseConfigured } from "./config";

/**
 * Prisma reads for the PDI module (EP17).
 *
 * RBAC + LGPD scope is applied HERE, in the query `where` and per-row gating —
 * never trust the client and never filter only in the UI. The pure per-row
 * visibility comes from `lib/development/visibility.ts` (unit-tested); this file
 * translates it into Prisma, shapes the read-models and reuses
 * `lib/competencies/gap.ts` for the gap that seeds the suggestions.
 */

/** Resolve a identidade do espectador (User id + Consultant id vinculados). */
export async function resolveDevelopmentViewer(
  user: AppUser,
): Promise<DevelopmentViewer> {
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

// ── Escopo → Prisma where ───────────────────────────────────────────────────

/** Constrói o Prisma `where` de DevelopmentPlan a partir do escopo. */
function planWhereForScope(
  scope: DevelopmentScope,
): Prisma.DevelopmentPlanWhereInput | null {
  switch (scope.kind) {
    case "all":
      return {};
    case "manager":
      return {
        consultant: {
          allocations: {
            some: { project: { managerUserId: scope.managerUserId } },
          },
        },
      };
    case "subject":
      return { consultantId: scope.subjectConsultantId };
    case "none":
      return null;
  }
}

/**
 * managerUserId "responsável" de um consultor para a decisão de gestão por
 * linha (canManagePlan no escopo manager). Como o MVP não tem vínculo formal
 * gestor→consultor, usamos o mesmo critério dos outros módulos: o gestor de
 * algum projeto em que o consultor está alocado. Aqui só precisamos saber SE o
 * managerUserId do escopo gerencia o consultor — então confirmamos a
 * existência da alocação. Para o read em lote, isso já vem do `where`.
 */

// ── Gap → sugestões (US17.01) ───────────────────────────────────────────────

/**
 * Resolve o gap de competências de um consultor (reusando lib/competencies/gap)
 * e devolve as skills com lacuna positiva, prontas para a geração de sugestões.
 * Retorna { gapSkills: [], profileName: null } quando não há perfil aplicável —
 * gap indefinido, não erro (US14.02 / US13.03).
 */
async function resolveGapSkillsForConsultant(consultant: {
  seniority: string;
  area: string | null;
  jobTitle: string | null;
  skills: { skillId: string; level: string }[];
}): Promise<{ gapSkills: GapSkillInput[]; profileName: string | null }> {
  const profileRows = await prisma.competencyProfile.findMany({
    where: { status: "ACTIVE" },
    select: {
      id: true,
      name: true,
      scope: true,
      referenceKey: true,
      status: true,
      items: { select: { skillId: true, requiredLevel: true } },
    },
  });
  const profiles: ResolvableProfile[] = profileRows.map((p) => ({
    id: p.id,
    name: p.name,
    scope: p.scope as ResolvableProfile["scope"],
    referenceKey: p.referenceKey,
    status: p.status as "ACTIVE" | "INACTIVE",
  }));
  const profile = resolveApplicableProfile(
    { seniority: consultant.seniority, area: consultant.area, jobTitle: consultant.jobTitle },
    profiles,
  );
  if (!profile) return { gapSkills: [], profileName: null };

  const row = profileRows.find((p) => p.id === profile.id);
  const required = new Map<string, SkillLevel>(
    (row?.items ?? []).map((i) => [i.skillId, i.requiredLevel as SkillLevel]),
  );
  const current = new Map<string, SkillLevel>(
    consultant.skills.map((s) => [s.skillId, s.level as SkillLevel]),
  );

  const relevantIds = [...required.keys()];
  if (relevantIds.length === 0) return { gapSkills: [], profileName: profile.name };
  const skillRows = await prisma.skill.findMany({
    where: { id: { in: relevantIds } },
    select: { id: true, name: true, type: true },
  });
  const nameById = new Map(skillRows.map((s) => [s.id, s]));

  const gapSkills: GapSkillInput[] = [];
  for (const skillId of relevantIds) {
    const cell = computeCell(
      skillId,
      required.get(skillId) ?? null,
      current.get(skillId) ?? null,
      true,
    );
    // Só lacunas positivas viram insumo de sugestão (US17.01).
    if (cell.status !== "GAP" || cell.requiredLevel === null) continue;
    const meta = nameById.get(skillId);
    if (!meta) continue;
    gapSkills.push({
      skillId,
      skillName: meta.name,
      skillType: meta.type as "TECHNICAL" | "BEHAVIORAL",
      requiredLevel: cell.requiredLevel,
      currentLevel: cell.currentLevel,
      gap: cell.gap ?? skillLevelWeight(cell.requiredLevel),
    });
  }
  return { gapSkills, profileName: profile.name };
}

export interface GapSuggestionResult {
  consultantId: string;
  consultantName: string;
  profileName: string | null;
  gapSkills: GapSkillInput[];
  suggestions: SuggestedAction[];
}

/**
 * Sugestões de ações para um consultor a partir do gap (US17.01). Aplica RBAC:
 * o solicitante precisa poder GERENCIAR um PDI desse consultor (gestor com
 * escopo ou ADMIN/PEOPLE). Retorna null fora do escopo (nunca vaza gap de outro
 * time). Nada é persistido aqui — é um rascunho revisável.
 */
export async function getGapSuggestions(
  user: AppUser,
  consultantId: string,
): Promise<GapSuggestionResult | null> {
  if (!isDatabaseConfigured()) return null;
  const viewer = await resolveDevelopmentViewer(user);
  const scope = resolveDevelopmentScope(viewer);
  if (scope.kind === "none" || scope.kind === "subject") return null;

  const consultant = await prisma.consultant.findUnique({
    where: { id: consultantId },
    select: {
      id: true,
      name: true,
      seniority: true,
      area: true,
      jobTitle: true,
      skills: { select: { skillId: true, level: true } },
      allocations: { select: { project: { select: { managerUserId: true } } } },
    },
  });
  if (!consultant) return null;

  const managerUserId =
    consultant.allocations.find((a) => a.project.managerUserId)?.project
      .managerUserId ?? null;
  if (!canManagePlan(scope, { subjectConsultantId: consultant.id, managerUserId })) {
    // Gestor de outro time não vê o gap deste consultor.
    return null;
  }

  const { gapSkills, profileName } = await resolveGapSkillsForConsultant({
    seniority: consultant.seniority,
    area: consultant.area,
    jobTitle: consultant.jobTitle,
    skills: consultant.skills,
  });
  return {
    consultantId: consultant.id,
    consultantName: consultant.name,
    profileName,
    gapSkills,
    suggestions: suggestActionsFromGap(gapSkills),
  };
}

// ── Listagem de planos (US17.01/02/03) ──────────────────────────────────────

function toActionView(action: {
  id: string;
  type: string;
  targetSkillId: string | null;
  targetSkill: { name: string } | null;
  description: string;
  dueAt: Date | null;
  status: string;
  evidenceNote: string | null;
}): DevelopmentActionView {
  return {
    id: action.id,
    type: action.type as DevelopmentActionType,
    targetSkillId: action.targetSkillId,
    targetSkillName: action.targetSkill?.name ?? null,
    description: action.description,
    dueAt: action.dueAt ? isoDay(action.dueAt) : null,
    status: action.status as DevelopmentActionStatus,
    evidenceNote: action.evidenceNote,
  };
}

/**
 * Lista os PDIs visíveis ao espectador (escopo por papel), com ações,
 * progresso e as flags do que ELE pode fazer (gerenciar estrutura / atualizar
 * progresso). O escopo já garante que nenhum plano fora do papel chega aqui; a
 * flag canManage refina por linha (gestor só gerencia o do seu time).
 */
export async function listDevelopmentPlans(
  user: AppUser,
): Promise<DevelopmentPlanView[]> {
  if (!isDatabaseConfigured()) return [];
  const viewer = await resolveDevelopmentViewer(user);
  const scope = resolveDevelopmentScope(viewer);
  const where = planWhereForScope(scope);
  if (where === null) return [];

  const today = isoDay(new Date());
  const rows = await prisma.developmentPlan.findMany({
    where,
    select: {
      id: true,
      consultantId: true,
      consultant: {
        select: {
          name: true,
          allocations: {
            select: { project: { select: { managerUserId: true } } },
          },
        },
      },
      cycleId: true,
      cycle: { select: { name: true } },
      ownerUserId: true,
      owner: { select: { name: true } },
      status: true,
      periodStart: true,
      periodEnd: true,
      actions: {
        select: {
          id: true,
          type: true,
          targetSkillId: true,
          targetSkill: { select: { name: true } },
          description: true,
          dueAt: true,
          status: true,
          evidenceNote: true,
        },
        orderBy: { createdAt: "asc" },
      },
    },
    orderBy: [{ periodEnd: "desc" }, { createdAt: "desc" }],
    take: 500,
  });

  return rows.map((row) => {
    const managerUserId =
      row.consultant.allocations.find((a) => a.project.managerUserId)?.project
        .managerUserId ?? null;
    const planRef = { subjectConsultantId: row.consultantId, managerUserId };
    const canManage = canManagePlan(scope, planRef);
    const isOwnerConsultant =
      scope.kind === "subject" &&
      row.consultantId === scope.subjectConsultantId;
    const actions = row.actions.map(toActionView);
    return {
      id: row.id,
      consultantId: row.consultantId,
      consultantName: row.consultant.name,
      cycleId: row.cycleId,
      cycleName: row.cycle?.name ?? null,
      ownerUserId: row.ownerUserId,
      ownerName: row.owner?.name ?? null,
      status: row.status as DevelopmentPlanStatus,
      periodStart: isoDay(row.periodStart),
      periodEnd: isoDay(row.periodEnd),
      actions,
      progress: computePlanProgress(
        actions.map((a) => ({ status: a.status, dueAt: a.dueAt })),
        today,
      ),
      canManage,
      // Gestor com escopo gerencia (e portanto atualiza); o consultor dono
      // atualiza só o progresso das próprias ações.
      canUpdateProgress: canManage || isOwnerConsultant,
    };
  });
}

// ── Opções para o seletor de criação (gestão) ───────────────────────────────

/**
 * Consultores que o solicitante pode gerenciar (alvos de novo PDI). ADMIN/PEOPLE
 * veem todos os ativos; gestores veem só os do seu escopo. CONSULTANT não cria
 * PDI, então recebe lista vazia.
 */
export async function listManageableConsultants(
  user: AppUser,
): Promise<ConsultantOption[]> {
  if (!isDatabaseConfigured()) return [];
  const viewer = await resolveDevelopmentViewer(user);
  const scope = resolveDevelopmentScope(viewer);

  let where: Prisma.ConsultantWhereInput;
  if (scope.kind === "all") {
    where = { status: "ACTIVE" };
  } else if (scope.kind === "manager") {
    where = {
      status: "ACTIVE",
      allocations: { some: { project: { managerUserId: scope.managerUserId } } },
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

// ── Helper de escrita: managerUserId de um consultor (escopo de gestão) ──────

/**
 * O managerUserId responsável por um consultor (gestor de algum projeto alocado)
 * usado pelos server actions para reaplicar canManagePlan no servidor antes de
 * gravar. Retorna null quando não há gestor designado.
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
