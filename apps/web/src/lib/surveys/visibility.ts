import type { RoleName } from "@/lib/auth/roles";
import type { SurveyStatus } from "./types";

/**
 * Pure RBAC for the Pesquisa de Clima / NPS module (EP 7.1).
 *
 * No I/O. The server actions and the DB read layer call these helpers so the
 * authorization boundary lives on the server, never only in the UI. Unit
 * tested directly.
 *
 * RBAC (docs/backlog-talentos.md §2/§3, roadmap §7.1):
 *  - Gestão (criar/abrir/fechar pesquisa): PEOPLE / ADMIN.
 *  - Dashboards agregados: PEOPLE / ADMIN / AREA_MANAGER (visão de time, mas o
 *    agregado é anônimo e respeita o piso mínimo — não há linha por consultor).
 *  - Responder: CONSULTANT convidado vê/responde APENAS os próprios convites;
 *    nunca respostas de terceiros (garantido pelo escopo da query por convite).
 */

export const SURVEY_MANAGE_ROLES: RoleName[] = ["ADMIN", "PEOPLE"];

/**
 * Quem alcança a superfície de dashboards agregados. AREA_MANAGER acompanha o
 * clima do time (agregado anônimo). FINANCE/SALES não participam do clima.
 */
export const SURVEY_DASHBOARD_ROLES: RoleName[] = [
  "ADMIN",
  "PEOPLE",
  "AREA_MANAGER",
];

/**
 * Quem alcança a rota `/app/clima`. Inclui CONSULTANT, que só vê/responde os
 * próprios convites (escopo por linha aplicado pela função de read). Regra
 * específica antes da `/app` ampla.
 */
export const SURVEY_READ_ROLES: RoleName[] = [
  "ADMIN",
  "PEOPLE",
  "AREA_MANAGER",
  "CONSULTANT",
];

function intersects(roles: readonly RoleName[], allowed: readonly RoleName[]) {
  return roles.some((r) => allowed.includes(r));
}

export function canManageSurveys(roles: readonly RoleName[]): boolean {
  return intersects(roles, SURVEY_MANAGE_ROLES);
}

export function canViewSurveyDashboards(roles: readonly RoleName[]): boolean {
  return intersects(roles, SURVEY_DASHBOARD_ROLES);
}

// ── Transição de status (DRAFT → OPEN → CLOSED) ─────────────────────────────

/**
 * Transições válidas: DRAFT → OPEN → CLOSED. Nunca retrocede de CLOSED nem
 * pula etapas. Pura para teste direto e reuso pelo server action.
 */
export function isValidSurveyTransition(
  from: SurveyStatus,
  to: SurveyStatus,
): boolean {
  if (from === "DRAFT") return to === "OPEN";
  if (from === "OPEN") return to === "CLOSED";
  return false;
}
