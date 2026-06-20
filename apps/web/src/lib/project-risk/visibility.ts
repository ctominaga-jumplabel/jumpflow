import type { RoleName } from "@/lib/auth/roles";
import { FINANCIAL_ROLES } from "@/lib/auth/route-permissions";

/**
 * Pure RBAC helpers for the IA de Risco de Projeto (§8.3). No I/O. The page guard
 * and the DB read use these so "quem vê o risco" and "quem vê o sinal de margem"
 * live in a single source of truth and are enforced on the server
 * (docs/p3-inteligencia-design.md §5).
 */

/**
 * Papéis que ACESSAM a IA de Risco de Projeto. Alinhado ao design §5: gestores de
 * projeto (PROJECT_MANAGER — seu projeto), gestão de área (AREA_MANAGER),
 * plataforma (ADMIN) e FINANCE na ótica de margem. O escopo POR LINHA (quais
 * projetos cada um vê) é aplicado pela função de read no servidor, não pela rota:
 * - ADMIN/AREA_MANAGER/FINANCE: todos os projetos.
 * - PROJECT_MANAGER: apenas os projetos que gerencia (Project.managerUserId).
 */
export const PROJECT_RISK_READ_ROLES: RoleName[] = [
  "ADMIN",
  "AREA_MANAGER",
  "PROJECT_MANAGER",
  "FINANCE",
];

/**
 * O sinal de margem (custo vs receita) só é computado e exibido para
 * FINANCIAL_ROLES (ADMIN/AREA_MANAGER/FINANCE). Para os demais (PROJECT_MANAGER
 * sem papel financeiro), a engine roda sem o sinal — não é mascarar a saída, o
 * servidor nem busca o dado financeiro (design §5).
 */
export function includeFinancialSignal(roles: readonly RoleName[]): boolean {
  return roles.some((r) => FINANCIAL_ROLES.includes(r));
}

/**
 * Escopo de leitura por linha. O papel mais amplo vence. PROJECT_MANAGER sem
 * papel de gestão ampla é restrito aos projetos que gerencia; FINANCE tem visão
 * ampla (acompanha margem de todos). CONSULTANT/SALES/PEOPLE não acessam.
 *
 * - `broad`: ADMIN/AREA_MANAGER/FINANCE veem todos os projetos.
 * - `managerUserId`: PROJECT_MANAGER vê apenas Project.managerUserId === userId.
 * - `none`: sem universo (escopo sem alvo) → lista vazia, nunca vaza outro time.
 */
export type ProjectRiskScope =
  | { kind: "broad" }
  | { kind: "manager"; managerUserId: string }
  | { kind: "none" };

export interface ProjectRiskViewer {
  roles: readonly RoleName[];
  /** Real persisted User id (FK usado por Project.managerUserId). */
  userId: string | null;
}

export function resolveProjectRiskScope(
  viewer: ProjectRiskViewer,
): ProjectRiskScope {
  const { roles, userId } = viewer;
  if (roles.some((r) => ["ADMIN", "AREA_MANAGER", "FINANCE"].includes(r))) {
    return { kind: "broad" };
  }
  if (roles.includes("PROJECT_MANAGER") && userId) {
    return { kind: "manager", managerUserId: userId };
  }
  return { kind: "none" };
}
