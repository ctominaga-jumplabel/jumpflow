import type { RoleName } from "@/lib/auth/roles";
import type { ObjectiveScope } from "./types";

/**
 * Pure RBAC visibility logic for Metas e OKRs (EP 7.2).
 *
 * No I/O. The DB read/write layer (lib/db/okrs.ts + the server actions) build
 * their Prisma `where` and gate writes from these helpers, so per-row visibility
 * and the consultant's narrow self-edit are enforced in the server, never only
 * in the UI. Single source of truth for "who manages which objective", "who sees
 * which objective" and "what the consultant may change on its own KRs".
 *
 * Regra por escopo (resumo):
 * - COMPANY / AREA: gestão = ADMIN/AREA_MANAGER. PEOPLE tem visão de pessoas.
 * - PROJECT: gestão = gestor do projeto (project.managerUserId) + ADMIN/AREA_MANAGER.
 * - CONSULTANT: o próprio consultor vê e atualiza currentValue dos próprios KRs;
 *   a estrutura é criada/editada pela gestão (ADMIN/AREA_MANAGER/PEOPLE, ou o
 *   gestor do consultor via projeto alocado).
 */

// ── Papéis de rota (discoverability + porta de entrada) ─────────────────────

/**
 * Roles that may READ the OKR surface (`/app/metas`). O escopo REAL por linha é
 * aplicado pelas funções de read, não pela rota. CONSULTANT alcança a rota para
 * ver e atualizar os PRÓPRIOS OKRs.
 */
export const OKR_READ_ROLES: RoleName[] = [
  "ADMIN",
  "PEOPLE",
  "AREA_MANAGER",
  "PROJECT_MANAGER",
  "CONSULTANT",
];

/**
 * Roles that may CREATE/EDIT objective structure (porta de entrada). A fronteira
 * fina por escopo/linha é aplicada por canManageObjective. CONSULTANT não
 * gerencia estrutura — só atualiza currentValue dos próprios KRs.
 */
export const OKR_MANAGE_ROLES: RoleName[] = [
  "ADMIN",
  "PEOPLE",
  "AREA_MANAGER",
  "PROJECT_MANAGER",
];

function intersects(roles: readonly RoleName[], allowed: readonly RoleName[]) {
  return roles.some((r) => allowed.includes(r));
}

/** Gestão ampla de talentos/empresa: ADMIN ou AREA_MANAGER. */
export function isBroadManager(roles: readonly RoleName[]): boolean {
  return intersects(roles, ["ADMIN", "AREA_MANAGER"]);
}

/** PEOPLE tem visão de pessoas (OKRs de consultor e estrutura organizacional). */
export function isPeople(roles: readonly RoleName[]): boolean {
  return roles.includes("PEOPLE");
}

// ── Identidade do espectador ────────────────────────────────────────────────

export interface OkrViewer {
  roles: readonly RoleName[];
  /** Real persisted User id (FK usado por ownerUserId / project.managerUserId). */
  userId: string | null;
  /** Consultant id vinculado, quando o espectador tem perfil de consultor. */
  consultantId: string | null;
}

// ── Referência por objetivo (insumo das decisões por linha) ─────────────────

/**
 * Dados mínimos de um objetivo para decidir gestão/visão por linha. `managerUserId`
 * é o gestor responsável: do projeto (escopo PROJECT) ou do consultor via
 * alocação (escopo CONSULTANT). null quando não há gestor designado.
 */
export interface ObjectiveRef {
  scope: ObjectiveScope;
  consultantId: string | null;
  projectId: string | null;
  managerUserId: string | null;
}

// ── Gestão de estrutura por linha (criar/editar/status, RBAC) ───────────────

/**
 * Whether the viewer may MANAGE the structure of an objective (criar/editar KRs,
 * mudar status, editar metadados). Pura.
 *
 * - ADMIN/AREA_MANAGER: gerenciam qualquer escopo (gestão ampla).
 * - PEOPLE: gerencia OKRs de pessoas (escopo CONSULTANT) e organizacionais
 *   (AREA/COMPANY); não gerencia OKR de PROJECT (operação) salvo se também for
 *   gestor amplo.
 * - PROJECT_MANAGER: gerencia OKR de PROJECT que ele gere (managerUserId) e OKR
 *   de CONSULTANT do seu time (managerUserId do consultor).
 * - CONSULTANT: nunca gerencia estrutura (nem do próprio OKR).
 */
export function canManageObjective(
  viewer: OkrViewer,
  objective: ObjectiveRef,
): boolean {
  const { roles, userId } = viewer;
  if (isBroadManager(roles)) return true;

  if (isPeople(roles)) {
    // RH cuida de pessoas e organização, não da operação de projeto.
    if (objective.scope === "PROJECT") return false;
    return true;
  }

  if (roles.includes("PROJECT_MANAGER") && userId) {
    if (objective.scope === "PROJECT" || objective.scope === "CONSULTANT") {
      return (
        objective.managerUserId !== null &&
        objective.managerUserId === userId
      );
    }
    return false;
  }

  return false;
}

/**
 * Whether the viewer may VIEW an objective. Inclui tudo que pode gerenciar +
 * o consultor dono vê o PRÓPRIO OKR (escopo CONSULTANT). PEOPLE/ADMIN/AREA_MANAGER
 * veem tudo; PROJECT_MANAGER vê o do seu time/projeto. Pura.
 */
export function canViewObjective(
  viewer: OkrViewer,
  objective: ObjectiveRef,
): boolean {
  const { roles, consultantId } = viewer;
  // Gestão ampla e RH veem tudo (RH inclusive OKR de projeto, para visão de
  // pessoas alocadas — leitura, não gestão).
  if (isBroadManager(roles) || isPeople(roles)) return true;

  if (canManageObjective(viewer, objective)) return true;

  // Consultor dono vê o próprio OKR.
  if (
    objective.scope === "CONSULTANT" &&
    consultantId !== null &&
    objective.consultantId === consultantId
  ) {
    return true;
  }
  return false;
}

// ── Auto-atualização de KR pelo consultor dono ──────────────────────────────

/**
 * O consultor dono de um OKR de escopo CONSULTANT pode atualizar o currentValue
 * dos PRÓPRIOS KRs (sem gerenciar a estrutura). Pura.
 */
export function canConsultantUpdateOwnKr(
  viewer: Pick<OkrViewer, "consultantId">,
  objective: ObjectiveRef,
): boolean {
  return (
    objective.scope === "CONSULTANT" &&
    viewer.consultantId !== null &&
    objective.consultantId === viewer.consultantId
  );
}

/**
 * Resolve se o espectador pode atualizar o currentValue de um KR — seja por
 * gerenciar a estrutura (gestores), seja por ser o consultor dono. Pura.
 */
export function canUpdateKeyResultValue(
  viewer: OkrViewer,
  objective: ObjectiveRef,
): boolean {
  if (canManageObjective(viewer, objective)) return true;
  return canConsultantUpdateOwnKr(viewer, objective);
}

// ── Transição de status do objetivo (DRAFT→ACTIVE→COMPLETED/CANCELLED) ──────

/**
 * Transições válidas do objetivo: DRAFT → ACTIVE → COMPLETED, com CANCELLED
 * alcançável de DRAFT ou ACTIVE. COMPLETED e CANCELLED são terminais. Pura.
 */
export function isValidObjectiveTransition(
  from: "DRAFT" | "ACTIVE" | "COMPLETED" | "CANCELLED",
  to: "DRAFT" | "ACTIVE" | "COMPLETED" | "CANCELLED",
): boolean {
  if (from === to) return false;
  if (from === "COMPLETED" || from === "CANCELLED") return false; // terminais
  if (to === "CANCELLED") return true; // cancela de DRAFT ou ACTIVE
  if (from === "DRAFT") return to === "ACTIVE";
  if (from === "ACTIVE") return to === "COMPLETED";
  return false;
}
