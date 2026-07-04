import { Prisma, prisma } from "@jumpflow/database";
import type { ActionResult } from "@/lib/actions/result";
import type { AppUser } from "@/lib/auth/types";
import { hasRole } from "@/lib/auth/route-permissions";
import { getConsultantForUser } from "@/lib/db/timesheet";
import { resolveDbUser } from "@/lib/db/users";
import {
  CHECKPOINT_WRITE_ROLES,
  canManageCheckpoint,
  canViewCheckpointRaw,
  resolveCheckpointReadScope,
  type CheckpointReadScope,
  type CheckpointViewer,
} from "@/lib/checkpoint/visibility";
import {
  getCheckpointAudioStorageProvider,
  isStorageConfigured,
} from "@/lib/storage/provider";
import { isDatabaseConfigured } from "./config";

/** Short-lived TTL for a checkpoint-audio signed URL (mirrors the feed). */
const CHECKPOINT_AUDIO_SIGNED_URL_TTL_SECONDS = 300;

/**
 * Prisma reads for Checkpoint / 1-on-1 (Melhoria #4, FATIA 2).
 *
 * RBAC + LGPD/confiança scope is applied HERE, in the query `where` — never
 * trust the client and never filter only in the UI. O escopo por linha vem de
 * `resolveCheckpointReadScope` (puro, testado); este arquivo só traduz para
 * Prisma e modela a leitura. Espelha `lib/db/feedback.ts`.
 *
 * REGRA DE EXPOSIÇÃO: o consultor avaliado só vê SHARED e NUNCA o cru
 * (transcrição/notas/candidatos PENDING). A redução de campos por viewer vive em
 * {@link shapeCheckpoint} via {@link canViewCheckpointRaw}.
 */

export type CheckpointViewModel = {
  id: string;
  consultantId: string;
  consultantName: string;
  managerUserId: string | null;
  managerName: string | null;
  type: "ONE_ON_ONE" | "CHECKPOINT";
  occurredAt: string;
  weekStart: string | null;
  weekEnd: string | null;
  title: string | null;
  relatedProjectId: string | null;
  relatedProjectName: string | null;
  status: "DRAFT" | "RECORDED" | "EXTRACTED" | "ARCHIVED";
  visibility: "PRIVATE" | "SHARED";
  extractionStatus: "NONE" | "PENDING" | "DONE" | "FAILED";
  transcriptionStatus: "NONE" | "PENDING" | "DONE" | "FAILED";
  createdAt: string;
  /** Capacidades do viewer sobre esta linha (UI gating; servidor reconfere). */
  canManage: boolean;
  canViewRaw: boolean;
  /**
   * Campos CRUS só presentes quando `canViewRaw`. O consultor avaliado recebe
   * null aqui mesmo em SHARED (vê só o resumo: título/tipo/projeto/data).
   */
  notes: string | null;
  transcription: string | null;
};

/** Resolve a viewer identity (real User id + linked Consultant id). */
export async function resolveCheckpointViewer(
  user: AppUser,
): Promise<CheckpointViewer> {
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
 * Build the Prisma `where` for a read scope. Returns `null` quando o escopo é
 * vazio para o caller curto-circuitar numa lista vazia (sem vazamento).
 * ARCHIVED é ocultado por padrão (soft delete operacional).
 */
function whereForScope(
  scope: CheckpointReadScope,
): Prisma.CheckpointWhereInput | null {
  const notArchived: Prisma.CheckpointWhereInput = {
    status: { not: "ARCHIVED" },
  };
  switch (scope.kind) {
    case "all":
      return notArchived;
    case "manager": {
      // Checkpoints de consultores alocados em projetos que o usuário gerencia
      // (gestor responsável vê PRIVATE no escopo) OU que ele mesmo registrou.
      const inTeam: Prisma.CheckpointWhereInput = {
        consultant: {
          allocations: {
            some: { project: { managerUserId: scope.managerUserId } },
          },
        },
      };
      return {
        AND: [
          notArchived,
          { OR: [inTeam, { managerUserId: scope.managerUserId }] },
        ],
      };
    }
    case "subject": {
      // CONSULTANT avaliado: só os PRÓPRIOS checkpoints SHARED. PRIVATE sobre si
      // NUNCA aparece (LGPD/confiança).
      return {
        AND: [
          notArchived,
          { consultantId: scope.subjectConsultantId, visibility: "SHARED" },
        ],
      };
    }
    case "none":
      return null;
  }
}

interface CheckpointFilters {
  consultantId?: string;
  type?: "ONE_ON_ONE" | "CHECKPOINT";
  relatedProjectId?: string;
  /** Incluir arquivados (apenas gestão; ignorado para consultor). */
  includeArchived?: boolean;
}

const CHECKPOINT_SELECT = {
  id: true,
  consultantId: true,
  consultant: { select: { name: true } },
  managerUserId: true,
  manager: { select: { name: true } },
  type: true,
  occurredAt: true,
  weekStart: true,
  weekEnd: true,
  title: true,
  notes: true,
  transcription: true,
  transcriptionStatus: true,
  extractionStatus: true,
  relatedProjectId: true,
  relatedProject: { select: { name: true, managerUserId: true } },
  status: true,
  visibility: true,
  createdAt: true,
} satisfies Prisma.CheckpointSelect;

type CheckpointRow = Prisma.CheckpointGetPayload<{
  select: typeof CHECKPOINT_SELECT;
}>;

/**
 * Shape a row into the per-viewer view model. O cru (notes/transcription) só sai
 * quando {@link canViewCheckpointRaw} permite. `managedInScope` indica que o
 * viewer é gestor responsável (projeto que gerencia OU registrou) — usado para
 * liberar o cru a AREA_MANAGER/PROJECT_MANAGER dentro do escopo.
 */
function shapeCheckpoint(
  row: CheckpointRow,
  viewer: CheckpointViewer,
): CheckpointViewModel {
  const managedInScope =
    (viewer.userId !== null &&
      (row.managerUserId === viewer.userId ||
        row.relatedProject?.managerUserId === viewer.userId)) ||
    false;
  const canManage = canManageCheckpoint(viewer, row.managerUserId);
  const canRaw = canViewCheckpointRaw(viewer, {
    managerUserId: row.managerUserId,
    subjectConsultantId: row.consultantId,
    managedInScope,
  });
  return {
    id: row.id,
    consultantId: row.consultantId,
    consultantName: row.consultant.name,
    managerUserId: row.managerUserId,
    managerName: row.manager?.name ?? null,
    type: row.type,
    occurredAt: row.occurredAt.toISOString(),
    weekStart: row.weekStart?.toISOString() ?? null,
    weekEnd: row.weekEnd?.toISOString() ?? null,
    title: row.title,
    relatedProjectId: row.relatedProjectId,
    relatedProjectName: row.relatedProject?.name ?? null,
    status: row.status,
    visibility: row.visibility,
    extractionStatus: row.extractionStatus,
    transcriptionStatus: row.transcriptionStatus,
    createdAt: row.createdAt.toISOString(),
    canManage,
    canViewRaw: canRaw,
    notes: canRaw ? row.notes : null,
    transcription: canRaw ? row.transcription : null,
  };
}

/**
 * Timeline de checkpoints visíveis ao viewer, mais recentes primeiro. Os filtros
 * só restringem dentro do universo já escopado — nunca ampliam o que o RBAC
 * permite. Filtros de inclusão de arquivados só valem para gestão (ADMIN/PEOPLE).
 */
export async function listCheckpoints(
  user: AppUser,
  filters: CheckpointFilters = {},
): Promise<CheckpointViewModel[]> {
  if (!isDatabaseConfigured()) return [];
  const viewer = await resolveCheckpointViewer(user);
  const scope = resolveCheckpointReadScope(viewer);
  const scopeWhere = whereForScope(scope);
  if (scopeWhere === null) return [];

  const filterWhere: Prisma.CheckpointWhereInput = {};
  if (filters.consultantId) filterWhere.consultantId = filters.consultantId;
  if (filters.type) filterWhere.type = filters.type;
  if (filters.relatedProjectId)
    filterWhere.relatedProjectId = filters.relatedProjectId;

  // includeArchived só relaxa o filtro de status para gestão; para os demais o
  // notArchived do escopo permanece (subtrai, nunca amplia).
  const allowArchived =
    filters.includeArchived === true && scope.kind === "all";
  const baseWhere = allowArchived
    ? // Remove o filtro de status do escopo "all" (que era notArchived).
      ({} as Prisma.CheckpointWhereInput)
    : scopeWhere;

  const rows = await prisma.checkpoint.findMany({
    where: { AND: [baseWhere, filterWhere] },
    select: CHECKPOINT_SELECT,
    orderBy: { occurredAt: "desc" },
    take: 500,
  });

  return rows.map((row) => shapeCheckpoint(row, viewer));
}

/**
 * Carrega UM checkpoint aplicando o escopo de leitura. Retorna null quando a
 * linha não existe OU está fora do escopo do viewer (fail-closed — não distingue
 * "não existe" de "sem acesso" para não vazar metadado).
 */
export async function getCheckpoint(
  user: AppUser,
  id: string,
): Promise<CheckpointViewModel | null> {
  if (!isDatabaseConfigured()) return null;
  const viewer = await resolveCheckpointViewer(user);
  const scope = resolveCheckpointReadScope(viewer);
  const scopeWhere = whereForScope(scope);
  if (scopeWhere === null) return null;

  const row = await prisma.checkpoint.findFirst({
    where: { AND: [scopeWhere, { id }] },
    select: CHECKPOINT_SELECT,
  });
  if (!row) return null;
  return shapeCheckpoint(row, viewer);
}

/**
 * Consultores que o gestor PODE registrar checkpoint (alvos válidos), já no
 * escopo de escrita: ADMIN/PEOPLE em qualquer ativo; AREA_MANAGER/
 * PROJECT_MANAGER apenas os alocados em projetos que gerencia. Reaproveitado no
 * select do formulário e na validação do servidor. Espelha o Feedback.
 */
export async function listRegistrableConsultants(
  user: AppUser,
): Promise<{ id: string; name: string }[]> {
  if (!isDatabaseConfigured()) return [];
  if (!hasRole(user, CHECKPOINT_WRITE_ROLES)) return [];
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

/** True quando o gestor pode registrar checkpoint para este consultor-alvo. */
export async function canTargetConsultant(
  user: AppUser,
  subjectConsultantId: string,
): Promise<boolean> {
  if (!isDatabaseConfigured()) return false;
  if (!hasRole(user, CHECKPOINT_WRITE_ROLES)) return false;
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

/**
 * Whether `user` can reach a given checkpoint WITHIN their read scope (Melhoria
 * #4). Reusa o MESMO `where` da timeline ({@link whereForScope}) — não confia no
 * client e não inventa um caminho de acesso paralelo. Usado para gatear decisões
 * sobre insights (Opportunity/Case) pela origem: o viewer só decide um insight
 * cuja origem (`sourceCheckpoint`) ele já poderia ver/gerenciar.
 *
 * Anti-enumeração: retorna `false` igual para "fora de escopo" e "inexistente" —
 * o caller responde o MESMO erro nos dois casos (não vaza qual checkpoint existe
 * nem de qual time). ARCHIVED segue oculto (faz parte do `whereForScope`).
 */
export async function canViewCheckpointInScope(
  user: AppUser,
  checkpointId: string,
): Promise<boolean> {
  if (!isDatabaseConfigured()) return false;
  const viewer = await resolveCheckpointViewer(user);
  const scope = resolveCheckpointReadScope(viewer);
  const scopeWhere = whereForScope(scope);
  if (scopeWhere === null) return false;
  const row = await prisma.checkpoint.findFirst({
    where: { AND: [scopeWhere, { id: checkpointId }] },
    select: { id: true },
  });
  return row !== null;
}

/**
 * Short-lived signed URL for a checkpoint's RAW voice recording (Melhoria #4,
 * F3). Fail-closed and LGPD/confiança-aware:
 *
 * - The row is loaded WITHIN the viewer's read scope (same gate as
 *   {@link getCheckpoint}) — a checkpoint outside scope is invisible.
 * - On top of the scope, {@link canViewCheckpointRaw} must allow the RAW
 *   payload: the evaluated CONSULTANT never reaches the raw audio, even on a
 *   SHARED checkpoint. Only gestão/autor (e gestor responsável no escopo) ouvem.
 * - Anti-enumeration: a row that does not exist, is out of scope, has no audio,
 *   or whose raw is not viewable all return the SAME FORBIDDEN — we never reveal
 *   which checkpoints exist or carry audio.
 * - Honest degradation: when storage is not configured -> NO_STORAGE (never a
 *   faked URL).
 *
 * The returned URL must NOT be persisted (it expires).
 */
export async function getCheckpointAudioSignedUrl(
  user: AppUser,
  checkpointId: string,
): Promise<ActionResult<{ url: string }>> {
  const forbidden: ActionResult<{ url: string }> = {
    ok: false,
    error: "FORBIDDEN",
    message: "Voce nao tem acesso ao audio deste checkpoint.",
  };
  if (!isDatabaseConfigured()) return forbidden;

  const viewer = await resolveCheckpointViewer(user);
  const scope = resolveCheckpointReadScope(viewer);
  const scopeWhere = whereForScope(scope);
  if (scopeWhere === null) return forbidden;

  const row = await prisma.checkpoint.findFirst({
    where: { AND: [scopeWhere, { id: checkpointId }] },
    select: {
      audioStorageKey: true,
      managerUserId: true,
      consultantId: true,
      relatedProject: { select: { managerUserId: true } },
    },
  });
  // Missing/out-of-scope/no-audio all collapse to the same FORBIDDEN.
  if (!row || !row.audioStorageKey) return forbidden;

  const managedInScope =
    (viewer.userId !== null &&
      (row.managerUserId === viewer.userId ||
        row.relatedProject?.managerUserId === viewer.userId)) ||
    false;
  // The evaluated consultant NEVER reaches the raw audio (mirrors the notes/
  // transcription redaction in shapeCheckpoint).
  if (
    !canViewCheckpointRaw(viewer, {
      managerUserId: row.managerUserId,
      subjectConsultantId: row.consultantId,
      managedInScope,
    })
  ) {
    return forbidden;
  }

  if (!isStorageConfigured()) {
    return {
      ok: false,
      error: "NO_STORAGE",
      message: "Audio indisponivel: storage nao configurado.",
    };
  }
  const provider = getCheckpointAudioStorageProvider();
  if (!provider) {
    return {
      ok: false,
      error: "NO_STORAGE",
      message: "Audio indisponivel: storage nao configurado.",
    };
  }
  try {
    const url = await provider.getSignedUrl(
      row.audioStorageKey,
      CHECKPOINT_AUDIO_SIGNED_URL_TTL_SECONDS,
    );
    return { ok: true, data: { url } };
  } catch (error) {
    console.error("[checkpoint] failed to sign audio url", error);
    return {
      ok: false,
      error: "UNEXPECTED",
      message: "Nao foi possivel gerar o link do audio.",
    };
  }
}
