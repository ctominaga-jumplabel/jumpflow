import { Prisma, prisma } from "@jumpflow/database";
import type { AppUser } from "@/lib/auth/types";
import { getConsultantForUser } from "@/lib/db/timesheet";
import { resolveDbUser } from "@/lib/db/users";
import {
  resolveApplicableProfile,
  type ResolvableProfile,
} from "@/lib/competencies/gap";
import type { SkillLevel } from "@/lib/competencies/types";
import {
  buildGap,
  buildHistory,
  buildRadar,
  type AnswerInput,
  type HistoryInput,
} from "@/lib/evaluations/radar";
import {
  canViewResult,
  redactResultForViewer,
  resolveResultScope,
  type EvaluationResultScope,
  type EvaluationViewer,
} from "@/lib/evaluations/visibility";
import type {
  EvaluationAssignment,
  EvaluationCycleStatus,
  EvaluationCycleSummary,
  EvaluationRelationship,
  EvaluationResult,
  EvaluationType,
  HistorySeries,
} from "@/lib/evaluations/types";
import { isDatabaseConfigured } from "./config";

/**
 * Prisma reads for the Avaliação de Desempenho module (EP16).
 *
 * RBAC + LGPD scope is applied HERE, in the query `where` and result gating —
 * never trust the client and never filter only in the UI. The per-row
 * visibility and peer-anonymity come from `lib/evaluations/visibility.ts`
 * (pure, unit-tested); this file translates it into Prisma and shapes the
 * read-models, and reuses `lib/competencies/gap.ts` for profile resolution.
 */

/** Resolve a identidade do espectador (User id + Consultant id vinculados). */
export async function resolveEvaluationViewer(
  user: AppUser,
): Promise<EvaluationViewer> {
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

// ── Ciclos (US16.01) ────────────────────────────────────────────────────────

/** Lista de ciclos para a gestão (ADMIN/PEOPLE). */
export async function listCycles(): Promise<EvaluationCycleSummary[]> {
  if (!isDatabaseConfigured()) return [];
  const rows = await prisma.evaluationCycle.findMany({
    select: {
      id: true,
      name: true,
      type: true,
      status: true,
      periodStart: true,
      periodEnd: true,
      evaluations: {
        select: {
          id: true,
          responses: { select: { status: true } },
        },
      },
    },
    orderBy: [{ periodEnd: "desc" }, { createdAt: "desc" }],
  });
  return rows.map((row) => {
    const evaluationCount = row.evaluations.length;
    const completedCount = row.evaluations.filter(
      (e) =>
        e.responses.length > 0 &&
        e.responses.every((r) => r.status === "COMPLETED"),
    ).length;
    return {
      id: row.id,
      name: row.name,
      type: row.type as EvaluationType,
      status: row.status as EvaluationCycleStatus,
      periodStart: row.periodStart.toISOString(),
      periodEnd: row.periodEnd.toISOString(),
      evaluationCount,
      completedCount,
    };
  });
}

// ── Caixa de entrada do avaliador (US16.03) ─────────────────────────────────

/**
 * Mapa skillId → nível requerido para o perfil aplicável de um consultor.
 * Reusa a resolução de perfil de Competências (US13.03). Retorna mapa vazio +
 * profileName null quando não há perfil aplicável (gap indefinido, não erro).
 */
async function resolveRequiredForConsultant(consultant: {
  seniority: string;
  area: string | null;
  jobTitle: string | null;
}): Promise<{ requiredBySkill: Map<string, SkillLevel>; profileName: string | null }> {
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
  const profile = resolveApplicableProfile(consultant, profiles);
  if (!profile) return { requiredBySkill: new Map(), profileName: null };
  const row = profileRows.find((p) => p.id === profile.id);
  const requiredBySkill = new Map<string, SkillLevel>(
    (row?.items ?? []).map((i) => [i.skillId, i.requiredLevel as SkillLevel]),
  );
  return { requiredBySkill, profileName: profile.name };
}

/**
 * Skills do formulário de avaliação de um consultor: as skills do perfil
 * aplicável (US16.03). Se o consultor não tem perfil aplicável, cai para as
 * skills que ele declara (ConsultantSkill), para não bloquear a avaliação.
 */
async function formSkillsForConsultant(
  consultantId: string,
  requiredBySkill: ReadonlyMap<string, SkillLevel>,
): Promise<{ skillId: string; skillName: string; skillType: "TECHNICAL" | "BEHAVIORAL" }[]> {
  let skillIds = [...requiredBySkill.keys()];
  if (skillIds.length === 0) {
    const cs = await prisma.consultantSkill.findMany({
      where: { consultantId },
      select: { skillId: true },
    });
    skillIds = cs.map((c) => c.skillId);
  }
  if (skillIds.length === 0) return [];
  const skills = await prisma.skill.findMany({
    where: { id: { in: skillIds } },
    select: { id: true, name: true, type: true },
  });
  return skills
    .map((s) => ({
      skillId: s.id,
      skillName: s.name,
      skillType: s.type as "TECHNICAL" | "BEHAVIORAL",
    }))
    .sort((a, b) => a.skillName.localeCompare(b.skillName, "pt-BR"));
}

/**
 * As avaliações atribuídas ao usuário atual como avaliador (raterUserId ==
 * viewer.userId), com as skills do formulário e as notas já preenchidas
 * (US16.03). Inclui apenas respostas de ciclos OPEN ou CLOSED (DRAFT não abre
 * respostas). O servidor é a fronteira: nunca expõe a resposta de outro rater.
 */
export async function listMyAssignments(
  user: AppUser,
): Promise<EvaluationAssignment[]> {
  if (!isDatabaseConfigured()) return [];
  const dbUser = await resolveDbUser(user);
  if (!dbUser?.id) return [];

  const responses = await prisma.evaluationResponse.findMany({
    where: {
      raterUserId: dbUser.id,
      evaluation: { cycle: { status: { in: ["OPEN", "CLOSED"] } } },
    },
    select: {
      id: true,
      evaluationId: true,
      relationship: true,
      status: true,
      submittedAt: true,
      answers: { select: { skillId: true, score: true, comment: true } },
      evaluation: {
        select: {
          id: true,
          subjectConsultant: {
            select: {
              id: true,
              name: true,
              seniority: true,
              area: true,
              jobTitle: true,
            },
          },
          cycle: { select: { id: true, name: true, status: true } },
        },
      },
    },
    orderBy: { createdAt: "desc" },
  });

  const out: EvaluationAssignment[] = [];
  for (const r of responses) {
    const subject = r.evaluation.subjectConsultant;
    const { requiredBySkill } = await resolveRequiredForConsultant({
      seniority: subject.seniority,
      area: subject.area,
      jobTitle: subject.jobTitle,
    });
    const skills = await formSkillsForConsultant(subject.id, requiredBySkill);
    const answers: EvaluationAssignment["answers"] = {};
    for (const a of r.answers) {
      answers[a.skillId] = { score: a.score, comment: a.comment };
    }
    out.push({
      responseId: r.id,
      evaluationId: r.evaluationId,
      cycleId: r.evaluation.cycle.id,
      cycleName: r.evaluation.cycle.name,
      cycleStatus: r.evaluation.cycle.status as EvaluationCycleStatus,
      relationship: r.relationship as EvaluationRelationship,
      status: r.status as EvaluationAssignment["status"],
      submittedAt: r.submittedAt?.toISOString() ?? null,
      subjectConsultantId: subject.id,
      subjectConsultantName: subject.name,
      skills,
      answers,
    });
  }
  return out;
}

// ── Resultado: radar, gap, histórico (US16.04 / US16.05) ────────────────────

/** Constrói o Prisma `where` de Evaluation a partir do escopo de resultado. */
function evaluationWhereForScope(
  scope: EvaluationResultScope,
): Prisma.EvaluationWhereInput | null {
  switch (scope.kind) {
    case "all":
      return {};
    case "manager":
      return {
        subjectConsultant: {
          allocations: {
            some: { project: { managerUserId: scope.managerUserId } },
          },
        },
      };
    case "subject":
      return { subjectConsultantId: scope.subjectConsultantId };
    case "none":
      return null;
  }
}

export interface EvaluationListItem {
  evaluationId: string;
  cycleId: string;
  cycleName: string;
  cycleType: EvaluationType;
  cycleStatus: EvaluationCycleStatus;
  periodEnd: string;
  subjectConsultantId: string;
  subjectConsultantName: string;
  /** Resultado visível ao espectador agora (depende do estado do ciclo). */
  resultAvailable: boolean;
}

/**
 * Lista das avaliações visíveis ao espectador (escopo por papel), com a flag de
 * disponibilidade de resultado por estado do ciclo (DP-05). Não calcula o radar
 * aqui (só ao abrir o resultado), mantendo a lista barata.
 */
export async function listVisibleEvaluations(
  user: AppUser,
): Promise<EvaluationListItem[]> {
  if (!isDatabaseConfigured()) return [];
  const viewer = await resolveEvaluationViewer(user);
  const scope = resolveResultScope(viewer);
  const where = evaluationWhereForScope(scope);
  if (where === null) return [];

  const isManagementOrManager =
    scope.kind === "all" || scope.kind === "manager";

  const rows = await prisma.evaluation.findMany({
    where,
    select: {
      id: true,
      subjectConsultantId: true,
      subjectConsultant: { select: { name: true } },
      cycle: {
        select: {
          id: true,
          name: true,
          type: true,
          status: true,
          periodEnd: true,
        },
      },
    },
    orderBy: [{ cycle: { periodEnd: "desc" } }],
    take: 500,
  });

  return rows.map((row) => {
    const isSubject =
      scope.kind === "subject" &&
      row.subjectConsultantId === scope.subjectConsultantId;
    return {
      evaluationId: row.id,
      cycleId: row.cycle.id,
      cycleName: row.cycle.name,
      cycleType: row.cycle.type as EvaluationType,
      cycleStatus: row.cycle.status as EvaluationCycleStatus,
      periodEnd: row.cycle.periodEnd.toISOString(),
      subjectConsultantId: row.subjectConsultantId,
      subjectConsultantName: row.subjectConsultant.name,
      resultAvailable: canViewResult({
        cycleStatus: row.cycle.status as EvaluationCycleStatus,
        isSubject,
        isManagementOrManager,
      }),
    };
  });
}

/**
 * Resultado consolidado de uma avaliação (US16.04): radar (média por skill),
 * gap (média convertida × requerido) e contagem de avaliadores por
 * relacionamento (agregada/anonimizada). Aplica RBAC + a regra de fechamento:
 * o sujeito só vê após CLOSED. Retorna null quando o espectador não pode ver.
 */
export async function getEvaluationResult(
  user: AppUser,
  evaluationId: string,
): Promise<EvaluationResult | null> {
  if (!isDatabaseConfigured()) return null;
  const viewer = await resolveEvaluationViewer(user);
  const scope = resolveResultScope(viewer);
  const scopeWhere = evaluationWhereForScope(scope);
  if (scopeWhere === null) return null;

  // O escopo + o id formam a fronteira: se o id não cair no universo do papel,
  // findFirst retorna null e o resultado não vaza.
  const evaluation = await prisma.evaluation.findFirst({
    where: { AND: [scopeWhere, { id: evaluationId }] },
    select: {
      id: true,
      subjectConsultantId: true,
      subjectConsultant: {
        select: {
          name: true,
          seniority: true,
          area: true,
          jobTitle: true,
        },
      },
      cycle: {
        select: {
          id: true,
          name: true,
          type: true,
          status: true,
          periodEnd: true,
        },
      },
      responses: {
        // Só respostas submetidas entram no resultado.
        where: { status: "COMPLETED", submittedAt: { not: null } },
        select: {
          relationship: true,
          answers: {
            select: {
              score: true,
              skill: { select: { id: true, name: true, type: true } },
            },
          },
        },
      },
    },
  });
  if (!evaluation) return null;

  const cycleStatus = evaluation.cycle.status as EvaluationCycleStatus;
  const isSubject =
    scope.kind === "subject" &&
    evaluation.subjectConsultantId === scope.subjectConsultantId;
  const isManagementOrManager =
    scope.kind === "all" || scope.kind === "manager";
  if (!canViewResult({ cycleStatus, isSubject, isManagementOrManager })) {
    return null;
  }

  const answers: AnswerInput[] = [];
  const relationships: EvaluationRelationship[] = [];
  for (const resp of evaluation.responses) {
    relationships.push(resp.relationship as EvaluationRelationship);
    for (const a of resp.answers) {
      answers.push({
        skillId: a.skill.id,
        skillName: a.skill.name,
        skillType: a.skill.type as "TECHNICAL" | "BEHAVIORAL",
        score: a.score,
        relationship: resp.relationship as EvaluationRelationship,
      });
    }
  }

  const radar = buildRadar(answers);
  const { requiredBySkill, profileName } = await resolveRequiredForConsultant({
    seniority: evaluation.subjectConsultant.seniority,
    area: evaluation.subjectConsultant.area,
    jobTitle: evaluation.subjectConsultant.jobTitle,
  });
  const gap = buildGap(radar, requiredBySkill);

  const raterCountByRelationship: Partial<
    Record<EvaluationRelationship, number>
  > = {};
  for (const r of relationships) {
    raterCountByRelationship[r] = (raterCountByRelationship[r] ?? 0) + 1;
  }

  const result: EvaluationResult = {
    evaluationId: evaluation.id,
    cycleId: evaluation.cycle.id,
    cycleName: evaluation.cycle.name,
    cycleType: evaluation.cycle.type as EvaluationType,
    cycleStatus,
    periodEnd: evaluation.cycle.periodEnd.toISOString(),
    subjectConsultantId: evaluation.subjectConsultantId,
    subjectConsultantName: evaluation.subjectConsultant.name,
    profileName,
    radar,
    gap,
    raterCountByRelationship,
  };

  // LGPD/DP-05: para o próprio sujeito, suprime a contagem de PEER e os
  // sampleCount do radar quando há um único par (des-anonimização por exclusão).
  // Gestão (all/manager) recebe o resultado completo.
  return redactResultForViewer(result, {
    isSubject,
    peerCount: raterCountByRelationship.PEER ?? 0,
  });
}

/**
 * Série histórica por competência para um consultor, ao longo dos ciclos
 * FECHADOS (US16.05). Aplica RBAC: o espectador precisa poder ver o resultado
 * do consultor (mesmo escopo de resultado). Retorna [] se fora do escopo.
 */
export async function getConsultantHistory(
  user: AppUser,
  subjectConsultantId: string,
): Promise<HistorySeries[]> {
  if (!isDatabaseConfigured()) return [];
  const viewer = await resolveEvaluationViewer(user);
  const scope = resolveResultScope(viewer);
  const scopeWhere = evaluationWhereForScope(scope);
  if (scopeWhere === null) return [];

  // Confirma que este consultor está no universo do espectador.
  const inScope = await prisma.evaluation.findFirst({
    where: { AND: [scopeWhere, { subjectConsultantId }] },
    select: { id: true },
  });
  if (!inScope) return [];

  const evaluations = await prisma.evaluation.findMany({
    where: {
      subjectConsultantId,
      cycle: { status: "CLOSED" },
    },
    select: {
      cycle: { select: { id: true, name: true, periodEnd: true } },
      responses: {
        where: { status: "COMPLETED", submittedAt: { not: null } },
        select: {
          answers: {
            select: {
              score: true,
              skill: { select: { id: true, name: true, type: true } },
            },
          },
        },
      },
    },
  });

  // Média por (ciclo, skill) → linhas para buildHistory.
  const rows: HistoryInput[] = [];
  for (const ev of evaluations) {
    const bySkill = new Map<
      string,
      { name: string; type: "TECHNICAL" | "BEHAVIORAL"; sum: number; count: number }
    >();
    for (const resp of ev.responses) {
      for (const a of resp.answers) {
        const acc = bySkill.get(a.skill.id) ?? {
          name: a.skill.name,
          type: a.skill.type as "TECHNICAL" | "BEHAVIORAL",
          sum: 0,
          count: 0,
        };
        acc.sum += a.score;
        acc.count += 1;
        bySkill.set(a.skill.id, acc);
      }
    }
    for (const [skillId, acc] of bySkill.entries()) {
      rows.push({
        cycleId: ev.cycle.id,
        cycleName: ev.cycle.name,
        periodEnd: ev.cycle.periodEnd.toISOString(),
        skillId,
        skillName: acc.name,
        skillType: acc.type,
        averageScore: acc.sum / acc.count,
      });
    }
  }
  return buildHistory(rows);
}

// ── Helpers de escrita (usados pelas server actions) ────────────────────────

/** Consultores ativos (alvos de avaliação na abertura do ciclo). */
export async function listActiveConsultantsForCycle(): Promise<
  { id: string; userId: string | null }[]
> {
  if (!isDatabaseConfigured()) return [];
  const rows = await prisma.consultant.findMany({
    where: { status: "ACTIVE" },
    select: { id: true, userId: true },
    orderBy: { name: "asc" },
  });
  return rows.map((r) => ({ id: r.id, userId: r.userId }));
}

/**
 * Resolve o userId do gestor de um consultor (relationship MANAGER): o gestor
 * de algum projeto ativo em que ele está alocado. Retorna o primeiro
 * encontrado, ou null (a resposta MANAGER fica sem rater designado, e PEOPLE
 * pode designar depois — não bloqueia a abertura).
 */
export async function resolveManagerUserId(
  consultantId: string,
): Promise<string | null> {
  if (!isDatabaseConfigured()) return null;
  const allocation = await prisma.allocation.findFirst({
    where: {
      consultantId,
      status: "ACTIVE",
      project: { managerUserId: { not: null } },
    },
    select: { project: { select: { managerUserId: true } } },
  });
  return allocation?.project.managerUserId ?? null;
}
