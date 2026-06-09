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
