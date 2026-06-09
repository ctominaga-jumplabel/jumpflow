import { cookies } from "next/headers";
import { auth } from "@/auth";
import type { AppUser } from "./types";
import { isRoleName, type RoleName } from "./roles";
import { DEV_LOGOUT_COOKIE, DEV_USER, isDevAuthEnabled } from "./dev";
import { isDatabaseConfigured } from "@/lib/db/config";

/**
 * Single source for "who is the current user", decoupled from the provider.
 *
 * - Dev mode: returns the {@link DEV_USER}; never touches the database.
 * - Real session, no database configured: maps the Auth.js session into an
 *   {@link AppUser} using session-provided roles (auth foundation behavior).
 * - Real session, database configured: syncs the identity into `User` and uses
 *   the PERSISTED roles as the authoritative source for RBAC.
 *
 * Returns null when there is no authenticated user.
 */
export async function getCurrentUser(): Promise<AppUser | null> {
  if (isDevAuthEnabled()) {
    const jar = await cookies();
    if (jar.get(DEV_LOGOUT_COOKIE)?.value === "1") return null;
    return DEV_USER;
  }

  const session = await auth();
  const sessionUser = session?.user;
  if (!sessionUser?.email) return null;

  const email = sessionUser.email;
  const name = sessionUser.name ?? email;
  // Prefer the stable provider subject id; fall back to email.
  const providerId = sessionUser.id ?? null;

  const sessionRoles: RoleName[] = Array.isArray(sessionUser.roles)
    ? sessionUser.roles.filter(isRoleName)
    : [];

  // Progressive integration: only touch the database when one is configured.
  // Until then we keep the session-derived identity (auth foundation behavior).
  if (!isDatabaseConfigured()) {
    return { id: providerId ?? email, name, email, roles: sessionRoles };
  }

  try {
    // Lazy import so Prisma is never loaded on code paths without a database.
    const { syncUserFromAuth } = await import("@/lib/db/users");
    const persisted = await syncUserFromAuth({ providerId, email, name });
    // Persisted roles are authoritative for RBAC in production.
    return {
      id: persisted.id,
      name: persisted.name,
      email: persisted.email,
      roles: persisted.roles,
    };
  } catch (error) {
    // Fail closed: a configured-but-unreachable database must NEVER grant broad
    // access. Authenticate the user with NO roles instead of falling back to
    // session roles.
    console.error(
      "[auth] failed to resolve persisted user; failing closed",
      error,
    );
    return { id: providerId ?? email, name, email, roles: [] };
  }
}
