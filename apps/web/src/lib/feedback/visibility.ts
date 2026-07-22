import type { RoleName } from "@/lib/auth/roles";

/**
 * Pure RBAC + LGPD visibility logic for Feedback Contínuo (EP15).
 *
 * No I/O. The DB read layer (`lib/db/feedback.ts`) builds its Prisma `where`
 * from {@link resolveFeedbackReadScope} so the per-row visibility is enforced
 * in the query — never only in the UI. This module is the single source of
 * truth for "who can write" and "who can read which feedback", and is unit
 * tested directly (docs/backlog-talentos.md §2 matrix and §3 LGPD rules).
 */

// ── Quem escreve (US15.01) ──────────────────────────────────────────────────

/**
 * Roles that may CREATE feedback. Gestores dão feedback. Per the backlog matrix
 * (§2, linha "Feedback (criar)"): ADMIN/PEOPLE em qualquer um, AREA_MANAGER no
 * seu time, PROJECT_MANAGER no seu projeto. CONSULTANT/SALES/FINANCE não criam
 * feedback avulso aqui (CONSULTANT só como peer dentro de ciclo 360 — EP16, fora
 * deste módulo). O escopo por consultor-alvo é validado no servidor à parte.
 */
export const FEEDBACK_WRITE_ROLES: RoleName[] = [
  "ADMIN",
  "PEOPLE",
  "AREA_MANAGER",
  "PROJECT_MANAGER",
];

/**
 * Roles that may READ the management feedback surface (`/app/feedback`).
 * CONSULTANT reaches its OWN timeline too, but only sees SHARED feedbacks of
 * itself plus the ones it authored — enforced by the read scope below, not the
 * route. PRIVATE feedback never leaks to the subject consultant.
 */
export const FEEDBACK_READ_ROLES: RoleName[] = [
  "ADMIN",
  "PEOPLE",
  "AREA_MANAGER",
  "PROJECT_MANAGER",
  "CONSULTANT",
];

/** Roles that may always manage (edit/visibility/inativar) ANY feedback. */
export const FEEDBACK_MANAGE_ROLES: RoleName[] = ["ADMIN", "PEOPLE"];

function intersects(roles: readonly RoleName[], allowed: readonly RoleName[]) {
  return roles.some((r) => allowed.includes(r));
}

export function canWriteFeedback(roles: readonly RoleName[]): boolean {
  return intersects(roles, FEEDBACK_WRITE_ROLES);
}

/**
 * Whether the viewer has BROAD write scope (ADMIN/PEOPLE): any ACTIVE consultant
 * is a valid target. AREA_MANAGER/PROJECT_MANAGER are narrow (only consultants
 * allocated to projects they manage).
 */
export function hasBroadFeedbackScope(roles: readonly RoleName[]): boolean {
  return intersects(roles, ["ADMIN", "PEOPLE"]);
}

/**
 * Honest empty-state copy explaining WHY there is no consultant to give feedback
 * to, and WHAT to do. Pure (no I/O) so it is unit tested. Returns null when the
 * scope is non-empty (there ARE targets). This is the fix for "não consegui
 * incluir para testar": the block was almost always an empty write scope for a
 * manager with no managed project — never a silent failure.
 */
export function feedbackWriteScopeNote(input: {
  /** ADMIN/PEOPLE → broad scope. */
  broadScope: boolean;
  /** How many consultants are in the caller's write scope. */
  consultantCount: number;
}): string | null {
  if (input.consultantCount > 0) return null;
  if (input.broadScope) {
    return "Nenhum consultor ativo cadastrado ainda. Cadastre consultores em Pessoas › Consultores para registrar feedback.";
  }
  return "Você não gerencia nenhum projeto com consultores ativos alocados. O feedback só pode ser registrado para consultores de projetos onde você é o gestor. Peça a People para associá-lo como gestor de um projeto, ou solicite que a People registre o feedback.";
}

// ── Quem lê: escopo por linha (US15.02, §3 LGPD) ────────────────────────────

/**
 * Identity of the viewer resolved against the DB (real `User.id` and, when the
 * viewer is also a consultant, the linked `Consultant.id`).
 */
export interface FeedbackViewer {
  roles: readonly RoleName[];
  /** Real persisted User id (FK used by authorUserId / managerUserId). */
  userId: string | null;
  /** Linked Consultant id, when the viewer is/has a consultant profile. */
  consultantId: string | null;
}

/**
 * Read scope describing exactly which rows the viewer may see. The DB layer
 * turns this into a Prisma `where`. The shape is intentionally explicit (no
 * "trust me" booleans without data) so it is testable in isolation.
 *
 * - `all`: ADMIN/PEOPLE see every feedback (any visibility).
 * - `managerUserId`: AREA_MANAGER/PROJECT_MANAGER see feedbacks of consultants
 *   in their team/project (resolved by allocation→project.managerUserId) AND
 *   feedbacks they authored. They see PRIVATE within scope (gestor responsável).
 * - `subjectConsultantId`: a plain CONSULTANT sees ONLY its own SHARED
 *   feedbacks plus any it authored. PRIVATE about itself is hidden.
 * - `authorUserId`: always allows the author to see their own rows.
 * - `none`: no universe → empty (never leaks another team's data).
 */
export type FeedbackReadScope =
  | { kind: "all" }
  | {
      kind: "manager";
      managerUserId: string;
      authorUserId: string | null;
    }
  | {
      kind: "subject";
      subjectConsultantId: string;
      authorUserId: string | null;
    }
  | { kind: "author"; authorUserId: string }
  | { kind: "none" };

/**
 * Resolve the read scope for a viewer. The most powerful role wins. A user can
 * hold several roles; we check from broad to narrow.
 */
export function resolveFeedbackReadScope(
  viewer: FeedbackViewer,
): FeedbackReadScope {
  const { roles, userId, consultantId } = viewer;
  if (intersects(roles, FEEDBACK_MANAGE_ROLES)) {
    return { kind: "all" };
  }
  if (intersects(roles, ["AREA_MANAGER", "PROJECT_MANAGER"]) && userId) {
    // AREA_MANAGER, no MVP, não tem vínculo formal gestor→área; ambos os papéis
    // são resolvidos via projetos que o usuário gerencia (Project.managerUserId),
    // consistente com a matriz/gap de Competências. Refino por área é pendência.
    return { kind: "manager", managerUserId: userId, authorUserId: userId };
  }
  if (roles.includes("CONSULTANT") && consultantId) {
    return {
      kind: "subject",
      subjectConsultantId: consultantId,
      authorUserId: userId,
    };
  }
  if (userId) {
    // Papel de escrita sem time (ex.: PROJECT_MANAGER sem userId resolvido cai
    // acima; aqui cobrimos um autor genérico): vê apenas o que autorou.
    return { kind: "author", authorUserId: userId };
  }
  return { kind: "none" };
}

// ── Quem gerencia uma linha específica (US15.03) ────────────────────────────

/**
 * Whether a viewer may edit / change visibility / inativar a SPECIFIC feedback.
 * Apenas autor, PEOPLE ou ADMIN (US15.03). Pure: caller passes the row's author.
 */
export function canManageFeedback(
  viewer: Pick<FeedbackViewer, "roles" | "userId">,
  feedbackAuthorUserId: string | null,
): boolean {
  if (intersects(viewer.roles, FEEDBACK_MANAGE_ROLES)) return true;
  return (
    viewer.userId !== null &&
    feedbackAuthorUserId !== null &&
    viewer.userId === feedbackAuthorUserId
  );
}
