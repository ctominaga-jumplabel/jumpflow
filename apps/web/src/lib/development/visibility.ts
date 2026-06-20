import type { RoleName } from "@/lib/auth/roles";
import type { DevelopmentActionStatus } from "./types";

/**
 * Pure RBAC + LGPD visibility logic for the PDI — Plano de Desenvolvimento
 * Individual (EP17).
 *
 * No I/O. The DB read/write layer (`lib/db/development.ts` + the server actions)
 * build their Prisma `where` and gate writes from these helpers, so per-row
 * visibility and the consultant's narrow self-edit are enforced in the server,
 * never only in the UI. Single source of truth for "who manages plans", "who
 * sees which plan" and "what the consultant may change on its own actions".
 * Unit-tested directly (docs/backlog-talentos.md §2 matrix line "PDI", §3 LGPD).
 */

// ── Quem gerencia PDIs (criar/editar estrutura, US17.01/02, §2) ─────────────

/**
 * Roles that may CREATE plans and EDIT the structure (add/edit/remove actions,
 * change plan status). PEOPLE/ADMIN gerenciam todos; AREA_MANAGER/
 * PROJECT_MANAGER gerenciam o do seu time/projeto (escopo por linha aplicado
 * abaixo). O CONSULTANT não gerencia a estrutura — só atualiza o progresso das
 * próprias ações (ver canConsultantUpdateAction).
 */
export const DEVELOPMENT_MANAGE_ROLES: RoleName[] = [
  "ADMIN",
  "PEOPLE",
  "AREA_MANAGER",
  "PROJECT_MANAGER",
];

/**
 * Roles that may READ the PDI management surface (`/app/pdi`). CONSULTANT também
 * alcança a rota para ver e atualizar o PRÓPRIO PDI; o escopo REAL por linha é
 * aplicado pelas funções de read, não pela rota.
 */
export const DEVELOPMENT_READ_ROLES: RoleName[] = [
  "ADMIN",
  "PEOPLE",
  "AREA_MANAGER",
  "PROJECT_MANAGER",
  "CONSULTANT",
];

function intersects(roles: readonly RoleName[], allowed: readonly RoleName[]) {
  return roles.some((r) => allowed.includes(r));
}

/** Papéis de gestão de talentos com visão ampla (todos os PDIs). */
export function isBroadManager(roles: readonly RoleName[]): boolean {
  return intersects(roles, ["ADMIN", "PEOPLE"]);
}

// ── Identidade do espectador ────────────────────────────────────────────────

export interface DevelopmentViewer {
  roles: readonly RoleName[];
  /** Real persisted User id (FK usado por ownerUserId / project.managerUserId). */
  userId: string | null;
  /** Consultant id vinculado, quando o espectador tem perfil de consultor. */
  consultantId: string | null;
}

// ── Escopo de leitura/gestão de PDI (§2) ────────────────────────────────────

/**
 * Escopo que descreve exatamente quais PDIs o espectador alcança. O DB layer
 * traduz em Prisma `where`.
 *
 * - `all`: ADMIN/PEOPLE gerenciam/veem todos os planos.
 * - `manager`: AREA_MANAGER/PROJECT_MANAGER veem/gerenciam os planos dos
 *   consultores do seu time/projeto (resolvido por alocação →
 *   project.managerUserId, mesmo critério da matriz/gap, feedback e avaliação).
 * - `subject`: CONSULTANT vê só o PRÓPRIO PDI (e só atualiza o progresso das
 *   próprias ações — a estrutura/owner é de gestão).
 * - `none`: sem universo → vazio (nunca vaza dados de outro time).
 */
export type DevelopmentScope =
  | { kind: "all" }
  | { kind: "manager"; managerUserId: string }
  | { kind: "subject"; subjectConsultantId: string }
  | { kind: "none" };

/**
 * Resolve o escopo do espectador. O papel mais forte vence (broad → narrow),
 * consistente com Competências/Feedback/Avaliação.
 */
export function resolveDevelopmentScope(
  viewer: DevelopmentViewer,
): DevelopmentScope {
  const { roles, userId, consultantId } = viewer;
  if (isBroadManager(roles)) {
    return { kind: "all" };
  }
  if (intersects(roles, ["AREA_MANAGER", "PROJECT_MANAGER"]) && userId) {
    return { kind: "manager", managerUserId: userId };
  }
  if (roles.includes("CONSULTANT") && consultantId) {
    return { kind: "subject", subjectConsultantId: consultantId };
  }
  return { kind: "none" };
}

/**
 * Whether the viewer may MANAGE the structure of a plan (criar ações, editar,
 * remover, mudar status do plano). Pura: o caller informa quem é o consultor do
 * plano e o managerUserId resolvido daquele consultor (se aplicável). O
 * CONSULTANT nunca gerencia a estrutura, mesmo do próprio PDI (US17.02).
 */
export function canManagePlan(
  scope: DevelopmentScope,
  plan: { subjectConsultantId: string; managerUserId: string | null },
): boolean {
  switch (scope.kind) {
    case "all":
      return true;
    case "manager":
      return plan.managerUserId === scope.managerUserId;
    case "subject":
      return false;
    case "none":
      return false;
  }
}

/**
 * Whether the viewer may VIEW a plan (leitura). Inclui tudo que pode gerenciar +
 * o consultor dono vê o próprio PDI. Pura.
 */
export function canViewPlan(
  scope: DevelopmentScope,
  plan: { subjectConsultantId: string; managerUserId: string | null },
): boolean {
  switch (scope.kind) {
    case "all":
      return true;
    case "manager":
      return plan.managerUserId === scope.managerUserId;
    case "subject":
      return plan.subjectConsultantId === scope.subjectConsultantId;
    case "none":
      return false;
  }
}

// ── O que o CONSULTANT pode editar (LGPD §3, US17.02) ───────────────────────

/**
 * O consultor dono do PDI pode atualizar o PROGRESSO das PRÓPRIAS ações:
 * status (PLANNED→IN_PROGRESS→DONE/CANCELLED) e evidenceNote. Não pode criar/
 * editar a estrutura (type, descrição, prazo, skill alvo) nem mexer em PDI de
 * outro consultor. Pura: o caller informa o consultor dono do plano.
 *
 * Decisão (escopo do consultor): apenas status + evidência das próprias ações.
 */
export function canConsultantUpdateAction(
  viewer: Pick<DevelopmentViewer, "consultantId">,
  planSubjectConsultantId: string,
): boolean {
  return (
    viewer.consultantId !== null &&
    viewer.consultantId === planSubjectConsultantId
  );
}

/**
 * Resolve se o espectador pode atualizar o progresso (status/evidência) de uma
 * ação de um dado plano — seja por ser gestor com escopo, seja por ser o
 * consultor dono. Combina canManagePlan (gestores) com a auto-atualização do
 * consultor. Pura.
 */
export function canUpdateActionProgress(
  scope: DevelopmentScope,
  viewer: Pick<DevelopmentViewer, "consultantId">,
  plan: { subjectConsultantId: string; managerUserId: string | null },
): boolean {
  if (canManagePlan(scope, plan)) return true;
  return canConsultantUpdateAction(viewer, plan.subjectConsultantId);
}

// ── Transição de status da AÇÃO (US17.02) ───────────────────────────────────

/**
 * Transições válidas da ação: PLANNED → IN_PROGRESS → DONE, com CANCELLED
 * alcançável de qualquer estado não terminal. DONE e CANCELLED são terminais
 * (não retrocedem). Pura, reusada pelo server action.
 */
export function isValidActionTransition(
  from: DevelopmentActionStatus,
  to: DevelopmentActionStatus,
): boolean {
  if (from === to) return false;
  if (from === "DONE" || from === "CANCELLED") return false; // terminais
  if (to === "CANCELLED") return true; // cancela de PLANNED ou IN_PROGRESS
  if (from === "PLANNED") return to === "IN_PROGRESS" || to === "DONE";
  if (from === "IN_PROGRESS") return to === "DONE";
  return false;
}

// ── Transição de status do PLANO (US17.01) ──────────────────────────────────

/**
 * Transições válidas do plano: ACTIVE → COMPLETED | CANCELLED. Estados
 * terminais não retrocedem. Pura.
 */
export function isValidPlanTransition(
  from: "ACTIVE" | "COMPLETED" | "CANCELLED",
  to: "ACTIVE" | "COMPLETED" | "CANCELLED",
): boolean {
  if (from === to) return false;
  return from === "ACTIVE" && (to === "COMPLETED" || to === "CANCELLED");
}
