import { redirect } from "next/navigation";
import type { AppUser } from "./types";
import type { RoleName } from "./roles";
import { getCurrentUser } from "./current-user";
import { hasRole } from "./route-permissions";

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
