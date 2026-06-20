import { prisma } from "@jumpflow/database";
import type { AppUser } from "@/lib/auth/types";
import { hasRole } from "@/lib/auth/route-permissions";
import { getConsultantForUser } from "@/lib/db/timesheet";
import { resolveDbUser } from "@/lib/db/users";
import {
  aggregateTeamGap,
  computeCell,
  resolveApplicableProfile,
  type ResolvableProfile,
} from "@/lib/competencies/gap";
import type {
  CompetencyMatrix,
  CompetencyProfileView,
  MatrixCell,
  MatrixConsultantRow,
  MatrixSkillColumn,
  SkillCatalogItem,
  SkillLevel,
  SkillOption,
  SkillType,
  TeamGapRow,
} from "@/lib/competencies/types";
import { isDatabaseConfigured } from "./config";

/**
 * Prisma reads for the Competências module (catálogo, perfis, matriz/gap).
 * RBAC scope is applied here — never trust client hints. All functions assume
 * the caller already gated route access; per-row visibility lives here.
 */

// ── Catálogo (EP12) ──────────────────────────────────────────────────────

/** Catálogo completo (ativas + inativas) com contagens, para o admin. */
export async function listSkillCatalog(): Promise<SkillCatalogItem[]> {
  if (!isDatabaseConfigured()) return [];
  const rows = await prisma.skill.findMany({
    select: {
      id: true,
      name: true,
      category: true,
      type: true,
      status: true,
      _count: { select: { consultants: true, competencyItems: true } },
    },
    orderBy: [{ status: "asc" }, { name: "asc" }],
  });
  return rows.map((row) => ({
    id: row.id,
    name: row.name,
    category: row.category,
    type: row.type as SkillType,
    status: row.status as "ACTIVE" | "INACTIVE",
    consultantCount: row._count.consultants,
    profileItemCount: row._count.competencyItems,
  }));
}

/** Skills ativas para selects (perfis, itens). */
export async function listActiveSkillOptions(): Promise<SkillOption[]> {
  if (!isDatabaseConfigured()) return [];
  const rows = await prisma.skill.findMany({
    where: { status: "ACTIVE" },
    select: { id: true, name: true, category: true, type: true },
    orderBy: [{ name: "asc" }],
  });
  return rows.map((row) => ({
    id: row.id,
    name: row.name,
    category: row.category,
    type: row.type as SkillType,
  }));
}

// ── Perfis (EP13) ──────────────────────────────────────────────────────────

export async function listCompetencyProfiles(): Promise<
  CompetencyProfileView[]
> {
  if (!isDatabaseConfigured()) return [];
  const rows = await prisma.competencyProfile.findMany({
    select: {
      id: true,
      name: true,
      scope: true,
      referenceKey: true,
      status: true,
      items: {
        select: {
          id: true,
          skillId: true,
          requiredLevel: true,
          skill: { select: { name: true, type: true } },
        },
      },
    },
    orderBy: [{ status: "asc" }, { scope: "asc" }, { referenceKey: "asc" }],
  });
  return rows.map((row) => ({
    id: row.id,
    name: row.name,
    scope: row.scope as CompetencyProfileView["scope"],
    referenceKey: row.referenceKey,
    status: row.status as "ACTIVE" | "INACTIVE",
    items: row.items
      .map((item) => ({
        id: item.id,
        skillId: item.skillId,
        skillName: item.skill.name,
        skillType: item.skill.type as SkillType,
        requiredLevel: item.requiredLevel as SkillLevel,
      }))
      .sort((a, b) => a.skillName.localeCompare(b.skillName, "pt-BR")),
  }));
}

// ── Matriz com gap (EP14) ──────────────────────────────────────────────────

interface MatrixScope {
  /** ADMIN/PEOPLE/AREA_MANAGER/SALES: todos os consultores ativos. */
  broad: boolean;
  /** PROJECT_MANAGER: apenas consultores alocados em projetos que gerencia. */
  managerUserId?: string;
  /** CONSULTANT sem papel de gestão: apenas o próprio. */
  ownConsultantId?: string;
}

/**
 * Escopo de visibilidade da matriz (docs/backlog-talentos.md §2). União de
 * papéis: o mais amplo vence. AREA_MANAGER vê seu time — como o MVP não tem
 * vínculo formal gestor→área, AREA_MANAGER recebe escopo amplo (igual a PEOPLE);
 * o refinamento por área fica como pendência. PROJECT_MANAGER vê quem está
 * alocado em seus projetos. CONSULTANT vê só o próprio (via /app/skills).
 */
export async function resolveMatrixScope(user: AppUser): Promise<MatrixScope> {
  if (hasRole(user, ["ADMIN", "PEOPLE", "AREA_MANAGER", "SALES"])) {
    return { broad: true };
  }
  if (hasRole(user, "PROJECT_MANAGER")) {
    const dbUser = await resolveDbUser(user);
    return { broad: false, managerUserId: dbUser?.id };
  }
  const consultant = await getConsultantForUser(user);
  return { broad: false, ownConsultantId: consultant?.id };
}

type ConsultantWhere = {
  status?: "ACTIVE";
  id?: string;
  allocations?: { some: { project: { managerUserId: string } } };
};

function consultantWhereForScope(scope: MatrixScope): ConsultantWhere | null {
  if (scope.broad) return { status: "ACTIVE" };
  if (scope.managerUserId) {
    return {
      status: "ACTIVE",
      allocations: { some: { project: { managerUserId: scope.managerUserId } } },
    };
  }
  if (scope.ownConsultantId) return { id: scope.ownConsultantId };
  return null; // sem universo: matriz vazia (não vaza dados de outro time)
}

/**
 * Monta a matriz requerido × atual por consultor, resolvendo o perfil aplicável
 * de cada um (US13.03) e calculando o gap por célula (US14.02). As colunas são a
 * união das skills ativas usadas em algum perfil aplicável OU declaradas por
 * algum consultor do escopo — assim a matriz mostra requerido e atual juntos.
 */
export async function getCompetencyMatrix(
  user: AppUser,
): Promise<CompetencyMatrix> {
  if (!isDatabaseConfigured()) return { skills: [], consultants: [] };
  const scope = await resolveMatrixScope(user);
  const where = consultantWhereForScope(scope);
  if (!where) return { skills: [], consultants: [] };

  const [consultants, profileRows] = await Promise.all([
    prisma.consultant.findMany({
      where,
      select: {
        id: true,
        name: true,
        seniority: true,
        area: true,
        jobTitle: true,
        skills: { select: { skillId: true, level: true } },
      },
      orderBy: { name: "asc" },
    }),
    prisma.competencyProfile.findMany({
      where: { status: "ACTIVE" },
      select: {
        id: true,
        name: true,
        scope: true,
        referenceKey: true,
        status: true,
        items: { select: { skillId: true, requiredLevel: true } },
      },
    }),
  ]);

  const profiles: ResolvableProfile[] = profileRows.map((p) => ({
    id: p.id,
    name: p.name,
    scope: p.scope as ResolvableProfile["scope"],
    referenceKey: p.referenceKey,
    status: p.status as "ACTIVE" | "INACTIVE",
  }));
  const requiredByProfile = new Map<string, Map<string, SkillLevel>>();
  for (const p of profileRows) {
    requiredByProfile.set(
      p.id,
      new Map(p.items.map((i) => [i.skillId, i.requiredLevel as SkillLevel])),
    );
  }

  // Resolve cada consultor + colete o conjunto de skills relevantes.
  const resolved = consultants.map((c) => ({
    consultant: c,
    profile: resolveApplicableProfile(
      { seniority: c.seniority, area: c.area, jobTitle: c.jobTitle },
      profiles,
    ),
  }));

  const relevantSkillIds = new Set<string>();
  for (const { consultant, profile } of resolved) {
    for (const s of consultant.skills) relevantSkillIds.add(s.skillId);
    if (profile) {
      for (const id of requiredByProfile.get(profile.id)?.keys() ?? [])
        relevantSkillIds.add(id);
    }
  }

  // Nomes/tipos das skills relevantes (catálogo, qualquer status — uma skill
  // inativa ainda referenciada por perfil/consultor deve aparecer na matriz).
  const skillRows =
    relevantSkillIds.size === 0
      ? []
      : await prisma.skill.findMany({
          where: { id: { in: [...relevantSkillIds] } },
          select: { id: true, name: true, type: true },
        });
  const skills: MatrixSkillColumn[] = skillRows
    .map((s) => ({
      skillId: s.id,
      skillName: s.name,
      skillType: s.type as SkillType,
    }))
    .sort((a, b) => a.skillName.localeCompare(b.skillName, "pt-BR"));

  const consultantRows: MatrixConsultantRow[] = resolved.map(
    ({ consultant, profile }) => {
      const currentBySkill = new Map<string, SkillLevel>(
        consultant.skills.map((s) => [s.skillId, s.level as SkillLevel]),
      );
      const required = profile
        ? (requiredByProfile.get(profile.id) ?? new Map())
        : new Map<string, SkillLevel>();
      const cells: MatrixCell[] = skills.map((col) =>
        computeCell(
          col.skillId,
          required.get(col.skillId) ?? null,
          currentBySkill.get(col.skillId) ?? null,
          profile !== null,
        ),
      );
      return {
        consultantId: consultant.id,
        consultantName: consultant.name,
        seniority: consultant.seniority,
        area: consultant.area,
        jobTitle: consultant.jobTitle,
        profileId: profile?.id ?? null,
        profileName: profile?.name ?? null,
        cells,
      };
    },
  );

  return { skills, consultants: consultantRows };
}

/** Visão de time: agregado por skill (US14.03). Reusa o read da matriz. */
export async function getTeamGap(user: AppUser): Promise<TeamGapRow[]> {
  const matrix = await getCompetencyMatrix(user);
  return aggregateTeamGap(matrix.consultants, matrix.skills);
}

// ── Cobertura para a tela Skills (EP12 US12.03) ─────────────────────────────

/** Skill com a distribuição de níveis entre consultores (formato da matriz). */
export interface SkillCoverageItem {
  id: string;
  name: string;
  category: string;
  levels: Record<SkillLevel, number>;
}

/**
 * Catálogo ATIVO com a distribuição de níveis derivada de ConsultantSkill, no
 * formato consumido pela tela Skills (SkillMatrix/SkillCoveragePanel). Substitui
 * o mock por dado persistido (US12.03); sem DB o page degrada de forma honesta.
 */
export async function listSkillCoverage(): Promise<SkillCoverageItem[]> {
  if (!isDatabaseConfigured()) return [];
  const rows = await prisma.skill.findMany({
    where: { status: "ACTIVE" },
    select: {
      id: true,
      name: true,
      category: true,
      consultants: { select: { level: true } },
    },
    orderBy: [{ category: "asc" }, { name: "asc" }],
  });
  return rows.map((row) => {
    const levels: Record<SkillLevel, number> = {
      BASIC: 0,
      INTERMEDIATE: 0,
      ADVANCED: 0,
      SPECIALIST: 0,
    };
    for (const cs of row.consultants) {
      levels[cs.level as SkillLevel] += 1;
    }
    return {
      id: row.id,
      name: row.name,
      category: row.category ?? "Sem categoria",
      levels,
    };
  });
}
