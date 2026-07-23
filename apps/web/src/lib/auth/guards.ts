import { redirect } from "next/navigation";
import type { AppUser } from "./types";
import type { RoleName } from "./roles";
import type { PermissionAction } from "./permission-codes";
import { getCurrentUser } from "./current-user";
import { hasRole } from "./route-permissions";
import { can } from "./permissions";

export { hasRole } from "./route-permissions";

/**
 * Require an authenticated user. Redirects to `/login` when there is none.
 * Use in server components / actions for any private operation.
 */
export async function requireUser(): Promise<AppUser> {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  return user;
}

/**
 * Require an authenticated user holding at least one of `roles`.
 * Redirects to `/login` if unauthenticated, or `/access-denied` if the user
 * lacks the required role(s).
 */
export async function requireRole(
  roles: RoleName | RoleName[],
): Promise<AppUser> {
  const user = await requireUser();
  if (!hasRole(user, roles)) redirect("/access-denied");
  return user;
}

/**
 * Require an authenticated user whose effective permission matrix grants
 * `action` on `code`. Redirects to `/login` if unauthenticated, or
 * `/access-denied` (403) if the matrix does not grant the permission.
 *
 * This is the configurable, database-driven counterpart to {@link requireRole}.
 * It is wired centrally in the app layout for route protection and may be used
 * directly in server actions/components for finer gating.
 */
export async function requirePermission(
  code: string,
  action: PermissionAction = "view",
): Promise<AppUser> {
  const user = await requireUser();
  if (!(await can(code, action))) redirect("/access-denied");
  return user;
}

/**
 * Require an authenticated user who EITHER holds one of `roles` OR is granted
 * `action` on the matrix `code`. This is the additive bridge between the static
 * role lists and the configurable matrix: the static roles keep their historical
 * access and the matrix can widen it to additional roles (e.g. granting People
 * access to consultant compensation without adding them to FINANCIAL_ROLES).
 * Redirects to `/login` if unauthenticated, `/access-denied` if neither holds.
 */
export async function requireRoleOrPermission(
  roles: RoleName | RoleName[],
  code: string,
  action: PermissionAction = "view",
): Promise<AppUser> {
  const user = await requireUser();
  if (hasRole(user, roles)) return user;
  if (await can(code, action)) return user;
  redirect("/access-denied");
}

/**
 * Boolean, non-redirecting counterpart to {@link requireRoleOrPermission}: true
 * if `user` holds one of `roles` OR the matrix grants `action` on `code`. Use for
 * in-page/in-action field masking where lacking access degrades gracefully (e.g.
 * skipping a financial field) rather than blocking the whole operation.
 */
export async function hasRoleOrPermission(
  user: AppUser | null,
  roles: RoleName | RoleName[],
  code: string,
  action: PermissionAction = "view",
): Promise<boolean> {
  if (hasRole(user, roles)) return true;
  return can(code, action);
}
