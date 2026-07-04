import type { RoleName } from "@/lib/auth/roles";

/**
 * Pure RBAC + LGPD/confiança visibility logic for Checkpoint / 1-on-1 (Melhoria
 * #4). No I/O. Espelha o módulo de Feedback (`lib/feedback/visibility.ts`): este
 * arquivo é a única fonte da verdade para "quem registra" e "quem lê qual
 * checkpoint". A camada de leitura (`lib/db/checkpoint.ts`) monta o Prisma
 * `where` a partir de {@link resolveCheckpointReadScope}, então a visibilidade
 * por linha é enforced NA QUERY — nunca só na UI. Testado em isolamento.
 *
 * Decisões (FATIA 2):
 * - SÓ GESTOR registra (ADMIN/PEOPLE/AREA_MANAGER/PROJECT_MANAGER).
 * - O checkpoint nasce PRIVATE: o consultor avaliado NÃO vê (nem transcrição,
 *   nem insights, nem o próprio registro).
 * - Quando SHARED, o consultor vê apenas um resumo (sem transcrição crua nem
 *   candidatos PENDING). A redução de campos vive no read-model do DB layer; o
 *   gate de existência da linha vive aqui.
 */

// ── Quem registra ───────────────────────────────────────────────────────────

/**
 * Roles that may CREATE/registrar a checkpoint. SÓ GESTOR registra (decisão da
 * melhoria): ADMIN/PEOPLE em qualquer consultor, AREA_MANAGER/PROJECT_MANAGER no
 * seu time/projeto. CONSULTANT/SALES/FINANCE NÃO registram. O escopo por
 * consultor-alvo é validado no servidor à parte (canTargetConsultant).
 */
export const CHECKPOINT_WRITE_ROLES: RoleName[] = [
  "ADMIN",
  "PEOPLE",
  "AREA_MANAGER",
  "PROJECT_MANAGER",
];

/**
 * Roles that may READ the management surface (`/app/checkpoints`). Inclui
 * CONSULTANT porque o consultor alcança a PRÓPRIA timeline — mas só os SHARED
 * sobre si (e sem transcrição/candidatos crus), enforced pelo read scope, NÃO
 * pela rota. PRIVATE nunca vaza para o consultor avaliado.
 */
export const CHECKPOINT_READ_ROLES: RoleName[] = [
  "ADMIN",
  "PEOPLE",
  "AREA_MANAGER",
  "PROJECT_MANAGER",
  "CONSULTANT",
];

/** Roles that may always manage (editar/visibilidade/arquivar) QUALQUER checkpoint. */
export const CHECKPOINT_MANAGE_ROLES: RoleName[] = ["ADMIN", "PEOPLE"];

function intersects(roles: readonly RoleName[], allowed: readonly RoleName[]) {
  return roles.some((r) => allowed.includes(r));
}

export function canRegisterCheckpoint(roles: readonly RoleName[]): boolean {
  return intersects(roles, CHECKPOINT_WRITE_ROLES);
}

// ── Quem lê: escopo por linha ───────────────────────────────────────────────

/**
 * Viewer identity resolved against the DB (real `User.id` and, quando o viewer
 * também é consultor, o `Consultant.id` vinculado).
 */
export interface CheckpointViewer {
  roles: readonly RoleName[];
  /** Real persisted User id (FK usado por managerUserId / autoria). */
  userId: string | null;
  /** Consultant id vinculado, quando o viewer tem perfil de consultor. */
  consultantId: string | null;
}

/**
 * Read scope: exatamente quais linhas o viewer pode ver. O DB layer traduz para
 * Prisma `where`. Shape explícito (sem booleanos "confie em mim") para ser
 * testável em isolamento.
 *
 * - `all`: ADMIN/PEOPLE veem todo checkpoint (qualquer visibilidade).
 * - `manager`: AREA_MANAGER/PROJECT_MANAGER veem checkpoints de consultores do
 *   seu time/projeto (por allocation→project.managerUserId) E os que registraram
 *   (managerUserId). Veem PRIVATE dentro do escopo (gestor responsável).
 * - `subject`: CONSULTANT avaliado vê SOMENTE os PRÓPRIOS checkpoints SHARED.
 *   PRIVATE sobre si fica oculto; não há "autoria" porque consultor não registra.
 * - `none`: sem universo → vazio (nunca vaza dado de outro time).
 */
export type CheckpointReadScope =
  | { kind: "all" }
  | {
      kind: "manager";
      managerUserId: string;
    }
  | {
      kind: "subject";
      subjectConsultantId: string;
    }
  | { kind: "none" };

/**
 * Resolve o read scope de um viewer. O papel mais forte vence; checamos do amplo
 * ao restrito.
 */
export function resolveCheckpointReadScope(
  viewer: CheckpointViewer,
): CheckpointReadScope {
  const { roles, userId, consultantId } = viewer;
  if (intersects(roles, CHECKPOINT_MANAGE_ROLES)) {
    return { kind: "all" };
  }
  if (intersects(roles, ["AREA_MANAGER", "PROJECT_MANAGER"]) && userId) {
    // Como no Feedback, AREA_MANAGER/PROJECT_MANAGER resolvem o time via projetos
    // que o usuário gerencia (Project.managerUserId). Refino por área é pendência.
    return { kind: "manager", managerUserId: userId };
  }
  if (roles.includes("CONSULTANT") && consultantId) {
    return { kind: "subject", subjectConsultantId: consultantId };
  }
  return { kind: "none" };
}

// ── Quem gerencia uma linha específica ──────────────────────────────────────

/**
 * Whether a viewer may editar / mudar visibilidade / arquivar um checkpoint
 * ESPECÍFICO. Apenas o autor (managerUserId), PEOPLE ou ADMIN. Puro: o caller
 * passa o managerUserId da linha (o "autor"/gestor que registrou).
 */
export function canManageCheckpoint(
  viewer: Pick<CheckpointViewer, "roles" | "userId">,
  checkpointManagerUserId: string | null,
): boolean {
  if (intersects(viewer.roles, CHECKPOINT_MANAGE_ROLES)) return true;
  return (
    viewer.userId !== null &&
    checkpointManagerUserId !== null &&
    viewer.userId === checkpointManagerUserId
  );
}

/**
 * Whether a viewer may see the RAW/sensitive payload of a checkpoint
 * (transcrição crua, notas internas, candidatos PENDING). Apenas gestão/autor;
 * o consultor avaliado NUNCA vê o cru, mesmo quando SHARED (vê só um resumo).
 * Espelha a regra de PRIVATE do Feedback (LGPD/confiança).
 */
export function canViewCheckpointRaw(
  viewer: Pick<CheckpointViewer, "roles" | "userId" | "consultantId">,
  checkpoint: {
    managerUserId: string | null;
    subjectConsultantId: string;
    managedInScope?: boolean;
  },
): boolean {
  // ADMIN/PEOPLE e o autor sempre veem o cru.
  if (canManageCheckpoint(viewer, checkpoint.managerUserId)) return true;
  // Gestor responsável dentro do escopo (resolvido no DB layer) também vê o cru.
  if (
    checkpoint.managedInScope &&
    intersects(viewer.roles, ["AREA_MANAGER", "PROJECT_MANAGER"])
  ) {
    return true;
  }
  // Caso contrário (notadamente o consultor avaliado): NÃO vê o cru.
  return false;
}
