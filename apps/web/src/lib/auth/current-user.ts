import { cookies } from "next/headers";
import { auth } from "@/auth";
import type { AppUser } from "./types";
import { isRoleName, type RoleName } from "./roles";
import { DEV_LOGOUT_COOKIE, DEV_USER, isDevAuthEnabled } from "./dev";

/**
 * Single source for "who is the current user", decoupled from the provider.
 * In dev mode returns the {@link DEV_USER}; otherwise maps the Auth.js session
 * into an {@link AppUser}. Returns null when there is no authenticated user.
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

  const roles: RoleName[] = Array.isArray(sessionUser.roles)
    ? sessionUser.roles.filter(isRoleName)
    : [];

  return {
    // Prefer the stable provider subject id; fall back to email until roles
    // and users are persisted.
    id: sessionUser.id ?? sessionUser.email,
    name: sessionUser.name ?? sessionUser.email,
    email: sessionUser.email,
    roles,
  };
}
