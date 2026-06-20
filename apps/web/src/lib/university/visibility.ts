import type { RoleName } from "@/lib/auth/roles";

/**
 * RBAC puro da Universidade Jump (EP 7.3). Sem I/O. Fonte única de "quem cura o
 * catálogo", "quem vê o ranking agregado" e a porta de entrada da rota. O escopo
 * por linha da matrícula (o consultor só mexe nas PRÓPRIAS) é aplicado no
 * servidor (lib/db/university.ts + actions), nunca só na UI.
 *
 * Decisões de visibilidade:
 * - Catálogo: visível a TODOS os autenticados (rota "ALL"). Consultor navega e se
 *   matricula.
 * - Curadoria (CRUD de trilha/curso): PEOPLE/ADMIN (UNIVERSITY_CURATE_ROLES).
 * - Matrícula/progresso: o PRÓPRIO consultor nas próprias matrículas (gate por
 *   linha no servidor, comparando consultantId).
 * - Ranking agregado (lista com nomes): gestão de talentos
 *   (ADMIN/PEOPLE/AREA_MANAGER). O CONSULTANT vê APENAS a SUA posição/pontos
 *   (não a lista com nomes de terceiros), evitando expor desempenho alheio.
 */

/** Papéis que CURAM o catálogo (criar/editar/inativar trilha e curso). */
export const UNIVERSITY_CURATE_ROLES: RoleName[] = ["ADMIN", "PEOPLE"];

/** Papéis que veem o RANKING AGREGADO (lista com nomes). */
export const UNIVERSITY_RANKING_ROLES: RoleName[] = [
  "ADMIN",
  "PEOPLE",
  "AREA_MANAGER",
];

function intersects(roles: readonly RoleName[], allowed: readonly RoleName[]) {
  return roles.some((r) => allowed.includes(r));
}

/** Pode curar o catálogo (PEOPLE/ADMIN). */
export function canCurate(roles: readonly RoleName[]): boolean {
  return intersects(roles, UNIVERSITY_CURATE_ROLES);
}

/** Pode ver o ranking agregado com nomes (gestão de talentos). */
export function canViewRanking(roles: readonly RoleName[]): boolean {
  return intersects(roles, UNIVERSITY_RANKING_ROLES);
}
