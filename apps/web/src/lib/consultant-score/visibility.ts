import type { RoleName } from "@/lib/auth/roles";
import { FINANCIAL_ROLES } from "@/lib/auth/route-permissions";

/**
 * Pure RBAC + LGPD helpers for the Score do Consultor (§8.4). No I/O. The page
 * guard and the DB read use these so "quem vê o score", "de quais consultores" e
 * "quem vê o fator financeiro" vivem numa única fonte de verdade, aplicada no
 * servidor (docs/p3-inteligencia-design.md §5; roadmap §8.4 e §10 LGPD).
 */

/**
 * Papéis que ACESSAM a rota do Score do Consultor. Alinhado ao design §5:
 * gestão de pessoas (PEOPLE/ADMIN — todos), AREA_MANAGER (seu time) e CONSULTANT
 * (o próprio). O escopo POR LINHA (quais consultores) é aplicado pela função de
 * read no servidor, não pela rota. FINANCE entra para que o fator de realização
 * financeira possa compor (ótica de custo/realização), com o mesmo escopo amplo.
 */
export const CONSULTANT_SCORE_READ_ROLES: RoleName[] = [
  "ADMIN",
  "PEOPLE",
  "AREA_MANAGER",
  "FINANCE",
  "CONSULTANT",
];

/**
 * O fator de realização financeira só é computado e exibido para FINANCIAL_ROLES
 * (ADMIN/AREA_MANAGER/FINANCE). Para os demais (PEOPLE, o próprio CONSULTANT), a
 * engine roda sem o fator — não é mascarar a saída, o servidor nem busca o dado
 * financeiro (design §5). O consultor vê o próprio score SEM o componente
 * financeiro mesmo que seja, por acaso, FINANCE: ver `includeFinancialForViewer`.
 */
export function includeFinancialFactor(roles: readonly RoleName[]): boolean {
  return roles.some((r) => FINANCIAL_ROLES.includes(r));
}

/**
 * Escopo de leitura por linha (LGPD). O papel mais amplo vence (broad → narrow),
 * consistente com Avaliações/Feedback/Competências.
 *
 * - `all`: ADMIN/PEOPLE/FINANCE veem o score de todos os consultores.
 * - `manager`: AREA_MANAGER vê o score dos consultores do seu time (resolvido por
 *   alocação → project.managerUserId, mesmo critério da matriz/gap e do feedback).
 * - `self`: CONSULTANT vê SÓ o próprio score.
 * - `none`: sem universo → vazio (nunca vaza score de outro time).
 */
export type ConsultantScoreScope =
  | { kind: "all" }
  | { kind: "manager"; managerUserId: string }
  | { kind: "self"; consultantId: string }
  | { kind: "none" };

export interface ConsultantScoreViewer {
  roles: readonly RoleName[];
  /** Real persisted User id (FK usado por project.managerUserId). */
  userId: string | null;
  /** Consultant id vinculado, quando o espectador tem perfil de consultor. */
  consultantId: string | null;
}

function intersects(roles: readonly RoleName[], allowed: readonly RoleName[]) {
  return roles.some((r) => allowed.includes(r));
}

export function resolveConsultantScoreScope(
  viewer: ConsultantScoreViewer,
): ConsultantScoreScope {
  const { roles, userId, consultantId } = viewer;
  if (intersects(roles, ["ADMIN", "PEOPLE", "FINANCE"])) {
    return { kind: "all" };
  }
  if (roles.includes("AREA_MANAGER") && userId) {
    return { kind: "manager", managerUserId: userId };
  }
  if (roles.includes("CONSULTANT") && consultantId) {
    return { kind: "self", consultantId };
  }
  return { kind: "none" };
}

/**
 * Decisão FINAL do fator financeiro considerando o escopo: um CONSULTANT vendo o
 * PRÓPRIO score nunca recebe o componente financeiro (design §5 — "consultor vê o
 * próprio score sem o componente financeiro"), mesmo que detenha papel financeiro
 * por acaso. Para escopos de gestão (all/manager), vale o gate de papel.
 */
export function includeFinancialForViewer(
  scope: ConsultantScoreScope,
  roles: readonly RoleName[],
): boolean {
  if (scope.kind === "self") return false;
  return includeFinancialFactor(roles);
}
