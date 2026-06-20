import { Prisma, prisma } from "@jumpflow/database";
import type { AppUser } from "@/lib/auth/types";
import { hasRole } from "@/lib/auth/route-permissions";
import { getConsultantForUser } from "@/lib/db/timesheet";
import { resolveDbUser } from "@/lib/db/users";
import {
  canManageFeedback,
  resolveFeedbackReadScope,
  type FeedbackReadScope,
  type FeedbackViewer,
} from "@/lib/feedback/visibility";
import type {
  ClientOption,
  ConsultantOption,
  FeedbackItem,
  FeedbackSource,
  FeedbackType,
  FeedbackVisibility,
  ProjectOption,
} from "@/lib/feedback/types";
import { isDatabaseConfigured } from "./config";

/**
 * Prisma reads for the Feedback Contínuo module (EP15).
 *
 * RBAC + LGPD scope is applied HERE, in the query `where` — never trust the
 * client and never filter only in the UI. The per-row visibility comes from
 * `resolveFeedbackReadScope` (pure, unit-tested); this file only translates it
 * into Prisma and shapes the read-model.
 */

/** Resolve the viewer identity (real User id + linked Consultant id). */
export async function resolveFeedbackViewer(
  user: AppUser,
): Promise<FeedbackViewer> {
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

/**
 * Build the Prisma `where` for a read scope. Returns `null` when the scope is
 * empty so the caller short-circuits to an empty list (no leak).
 */
function whereForScope(
  scope: FeedbackReadScope,
): Prisma.FeedbackWhereInput | null {
  switch (scope.kind) {
    case "all":
      return {};
    case "manager": {
      // Feedbacks de consultores alocados em projetos que o usuário gerencia
      // (gestor responsável vê PRIVATE no seu escopo) OU feedbacks que autorou.
      const inTeam: Prisma.FeedbackWhereInput = {
        subjectConsultant: {
          allocations: {
            some: { project: { managerUserId: scope.managerUserId } },
          },
        },
      };
      const ors: Prisma.FeedbackWhereInput[] = [inTeam];
      if (scope.authorUserId) {
        ors.push({ authorUserId: scope.authorUserId });
      }
      return { OR: ors };
    }
    case "subject": {
      // CONSULTANT alvo: só os PRÓPRIOS feedbacks SHARED + os que autorou.
      // PRIVATE sobre si mesmo NÃO aparece (LGPD §3).
      const ors: Prisma.FeedbackWhereInput[] = [
        { subjectConsultantId: scope.subjectConsultantId, visibility: "SHARED" },
      ];
      if (scope.authorUserId) {
        ors.push({ authorUserId: scope.authorUserId });
      }
      return { OR: ors };
    }
    case "author":
      return { authorUserId: scope.authorUserId };
    case "none":
      return null;
  }
}

interface FeedbackFilters {
  subjectConsultantId?: string;
  type?: FeedbackType;
  source?: FeedbackSource;
  relatedProjectId?: string;
  relatedClientId?: string;
}

/**
 * Timeline of feedbacks visible to the viewer, newest first (US15.02). Optional
 * filters narrow within the already-scoped universe — they can only ever
 * subtract from what RBAC allows, never widen it.
 */
export async function listFeedbackTimeline(
  user: AppUser,
  filters: FeedbackFilters = {},
): Promise<FeedbackItem[]> {
  if (!isDatabaseConfigured()) return [];
  const viewer = await resolveFeedbackViewer(user);
  const scope = resolveFeedbackReadScope(viewer);
  const scopeWhere = whereForScope(scope);
  if (scopeWhere === null) return [];

  const filterWhere: Prisma.FeedbackWhereInput = {};
  if (filters.subjectConsultantId)
    filterWhere.subjectConsultantId = filters.subjectConsultantId;
  if (filters.type) filterWhere.type = filters.type;
  if (filters.source) filterWhere.source = filters.source;
  if (filters.relatedProjectId)
    filterWhere.relatedProjectId = filters.relatedProjectId;
  if (filters.relatedClientId)
    filterWhere.relatedClientId = filters.relatedClientId;

  const rows = await prisma.feedback.findMany({
    where: { AND: [scopeWhere, filterWhere] },
    select: {
      id: true,
      subjectConsultantId: true,
      subjectConsultant: { select: { name: true } },
      authorUserId: true,
      author: { select: { name: true } },
      type: true,
      source: true,
      visibility: true,
      body: true,
      relatedProjectId: true,
      relatedProject: { select: { name: true } },
      relatedClientId: true,
      relatedClient: { select: { name: true } },
      createdAt: true,
    },
    orderBy: { createdAt: "desc" },
    take: 500,
  });

  return rows.map((row) => ({
    id: row.id,
    subjectConsultantId: row.subjectConsultantId,
    subjectConsultantName: row.subjectConsultant.name,
    type: row.type as FeedbackType,
    source: row.source as FeedbackSource,
    visibility: row.visibility as FeedbackVisibility,
    body: row.body,
    authorName: row.author?.name ?? null,
    authorUserId: row.authorUserId,
    relatedProjectId: row.relatedProjectId,
    relatedProjectName: row.relatedProject?.name ?? null,
    relatedClientId: row.relatedClientId,
    relatedClientName: row.relatedClient?.name ?? null,
    createdAt: row.createdAt.toISOString(),
    canManage: canManageFeedback(viewer, row.authorUserId),
  }));
}

/**
 * Consultores que o autor PODE receber feedback (alvos válidos), já no escopo de
 * escrita: ADMIN/PEOPLE em qualquer ativo; AREA_MANAGER/PROJECT_MANAGER apenas
 * os alocados em projetos que gerencia. Usado tanto no select do formulário
 * quanto reaproveitado na validação do servidor (US15.01).
 */
export async function listWritableConsultantOptions(
  user: AppUser,
): Promise<ConsultantOption[]> {
  if (!isDatabaseConfigured()) return [];
  const where: Prisma.ConsultantWhereInput = { status: "ACTIVE" };
  if (!hasRole(user, ["ADMIN", "PEOPLE"])) {
    const dbUser = await resolveDbUser(user);
    if (!dbUser?.id) return [];
    where.allocations = {
      some: { project: { managerUserId: dbUser.id } },
    };
  }
  const rows = await prisma.consultant.findMany({
    where,
    select: { id: true, name: true },
    orderBy: { name: "asc" },
  });
  return rows.map((row) => ({ id: row.id, name: row.name }));
}

/** True when the author may register feedback for this subject consultant. */
export async function canTargetConsultant(
  user: AppUser,
  subjectConsultantId: string,
): Promise<boolean> {
  if (!isDatabaseConfigured()) return false;
  if (hasRole(user, ["ADMIN", "PEOPLE"])) {
    const exists = await prisma.consultant.findFirst({
      where: { id: subjectConsultantId, status: "ACTIVE" },
      select: { id: true },
    });
    return exists !== null;
  }
  const dbUser = await resolveDbUser(user);
  if (!dbUser?.id) return false;
  const exists = await prisma.consultant.findFirst({
    where: {
      id: subjectConsultantId,
      status: "ACTIVE",
      allocations: { some: { project: { managerUserId: dbUser.id } } },
    },
    select: { id: true },
  });
  return exists !== null;
}

/** Active projects for the related-project select (carries clientId). */
export async function listProjectOptions(): Promise<ProjectOption[]> {
  if (!isDatabaseConfigured()) return [];
  const rows = await prisma.project.findMany({
    where: { status: { not: "CLOSED" } },
    select: {
      id: true,
      name: true,
      clientId: true,
      client: { select: { name: true } },
    },
    orderBy: { name: "asc" },
  });
  return rows.map((row) => ({
    id: row.id,
    name: row.name,
    clientId: row.clientId,
    clientName: row.client.name,
  }));
}

/** Active clients for the related-client select. */
export async function listClientOptions(): Promise<ClientOption[]> {
  if (!isDatabaseConfigured()) return [];
  const rows = await prisma.client.findMany({
    where: { status: "ACTIVE" },
    select: { id: true, name: true },
    orderBy: { name: "asc" },
  });
  return rows.map((row) => ({ id: row.id, name: row.name }));
}
