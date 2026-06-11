import type { AppUser } from "./types";
import type { RoleName } from "./roles";

/**
 * Pure RBAC primitives and the central route → roles map.
 * No server-only imports, so this is safe to unit test and to import on the
 * edge. Async guards (requireUser/requireRole) live in `guards.ts`.
 */

/** `"ALL"` means any authenticated user may access. */
export type RouteAccess = RoleName[] | "ALL";

/**
 * Roles allowed to see financial fields (valor hora, custo hora, budget) and
 * the Financeiro module. Single source of truth so route guards and in-page
 * field masking (e.g. Projetos) never drift apart.
 */
export const FINANCIAL_ROLES: RoleName[] = ["ADMIN", "AREA_MANAGER", "FINANCE"];

interface RouteRule {
  prefix: string;
  access: RouteAccess;
}

/**
 * Central access map for operational routes. Order matters: more specific
 * prefixes must come before the broad `/app` rule.
 *
 * NOTE: this round, the middleware only enforces authentication for `/app/*`.
 * Per-route role enforcement is applied where it matters (e.g. financeiro via
 * `requireRole`) and this map is the single source of truth as enforcement
 * expands.
 */
export const routePermissions: RouteRule[] = [
  { prefix: "/app/financeiro", access: FINANCIAL_ROLES },
  // Operational automation (auto-approval admin/observability). Management
  // only — PROJECT_MANAGER read-only access is deferred to a later round.
  { prefix: "/app/automacoes", access: ["ADMIN", "AREA_MANAGER"] },
  {
    // FINANCE participates in the expense approval chain (finance stage),
    // so it has access to the queue alongside the manager roles.
    prefix: "/app/aprovacoes",
    access: ["ADMIN", "AREA_MANAGER", "PROJECT_MANAGER", "FINANCE"],
  },
  // Despesas are open to any authenticated user (consultants log their own).
  // Payment-status changes are gated in-page by FINANCIAL_ROLES, not here.
  { prefix: "/app/despesas", access: "ALL" },
  // Relatorios are open to any authenticated user; the REAL scope (own data
  // for consultants, managed projects for PMs, broad for gestao/finance) is
  // applied by the read functions in `lib/db/reports.ts`, not by this route.
  { prefix: "/app/relatorios", access: "ALL" },
  { prefix: "/app", access: "ALL" },
];

/** Resolve the access requirement for a pathname. */
export function accessForPath(pathname: string): RouteAccess {
  const rule = routePermissions.find(
    (r) => pathname === r.prefix || pathname.startsWith(`${r.prefix}/`),
  );
  return rule ? rule.access : "ALL";
}

/** Whether a user holds at least one of the required roles. */
export function hasRole(
  user: AppUser | null,
  roles: RoleName | RoleName[],
): boolean {
  if (!user) return false;
  const required = Array.isArray(roles) ? roles : [roles];
  if (required.length === 0) return true;
  return required.some((role) => user.roles.includes(role));
}

/** Whether a user satisfies an access requirement. */
export function canAccess(user: AppUser | null, access: RouteAccess): boolean {
  if (!user) return false;
  if (access === "ALL") return true;
  return hasRole(user, access);
}

/** Whether a user may access a given path, per the route map. */
export function canAccessPath(user: AppUser | null, pathname: string): boolean {
  return canAccess(user, accessForPath(pathname));
}
