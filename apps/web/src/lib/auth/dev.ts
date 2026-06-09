import type { AppUser } from "./types";
import { ROLE_NAMES } from "./roles";

/**
 * Development auth helpers. Edge-safe (only reads `process.env`) and free of
 * server-only imports, so it can be used by middleware and unit tests.
 */

/** Cookie that marks an explicit logout while in dev mode. */
export const DEV_LOGOUT_COOKIE = "jf_dev_logout";

/**
 * Dev-only user. Holds every role so all screens are reachable while building
 * locally. Used ONLY when {@link isDevAuthEnabled} is true.
 */
export const DEV_USER: AppUser = {
  id: "dev-user",
  name: "Ana Martins",
  email: "ana.martins@jumplabel.com.br",
  roles: [...ROLE_NAMES],
};

/**
 * Dev auth is active ONLY when explicitly enabled AND not in production.
 * Gating on NODE_ENV guarantees the mocked user can never authenticate a
 * production build — there is no silent fallback.
 */
export function isDevAuthEnabled(): boolean {
  return (
    process.env.AUTH_DEV_MODE === "true" &&
    process.env.NODE_ENV !== "production"
  );
}
