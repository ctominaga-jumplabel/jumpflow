/**
 * Role catalog for RBAC. Mirrors `docs/modelo-dados.md` (entidade Role).
 * Pure module (no server-only imports) so it is safe on the edge and in tests.
 */
export const ROLE_NAMES = [
  "ADMIN",
  "CONSULTANT",
  "PROJECT_MANAGER",
  "AREA_MANAGER",
  "FINANCE",
  "PEOPLE",
  "SALES",
] as const;

export type RoleName = (typeof ROLE_NAMES)[number];

/** Human-readable labels (pt-BR) for display in the UI. */
export const roleLabels: Record<RoleName, string> = {
  ADMIN: "Administrador",
  CONSULTANT: "Consultor",
  PROJECT_MANAGER: "Gestor de Projeto",
  AREA_MANAGER: "Gestor de Área",
  FINANCE: "Financeiro",
  PEOPLE: "RH / People",
  SALES: "Comercial",
};

/**
 * Roles allowed to see financial fields (valor hora, custo hora, budget) and
 * the Financeiro module. Single source of truth so route guards and in-page
 * field masking (e.g. Projetos) never drift apart.
 *
 * Vive AQUI, no módulo folha, e não em `route-permissions.ts`, para quebrar um
 * ciclo de import real: cada módulo de visibilidade (`lib/<modulo>/visibility`)
 * precisa desta lista, e `route-permissions` importa desses mesmos módulos para
 * montar `routePermissions`. Com a constante lá, a inicialização de um
 * visibility ANTES de route-permissions resolvia o binding como `undefined` e a
 * regra de rota do módulo nascia SEM `access`. `route-permissions` reexporta o
 * símbolo, então todos os consumidores históricos seguem funcionando.
 */
export const FINANCIAL_ROLES: RoleName[] = ["ADMIN", "AREA_MANAGER", "FINANCE"];

export function isRoleName(value: unknown): value is RoleName {
  return (
    typeof value === "string" &&
    (ROLE_NAMES as readonly string[]).includes(value)
  );
}

/** Label of the first role, used for a compact role hint in the topbar. */
export function primaryRoleLabel(roles: RoleName[]): string {
  return roles.length > 0 ? roleLabels[roles[0]] : "Sem perfil";
}
