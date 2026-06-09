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
 * Dev auth is active ONLY when explicitly enabled (`AUTH_DEV_MODE=true`).
 *
 * Outside production this is enough. In production it stays OFF — there is no
 * silent fallback — UNLESS a separate, explicit escape hatch
 * (`ALLOW_DEV_AUTH_IN_PRODUCTION=true`) is also set. That hatch exists only to
 * support a deliberate, provider-less PREVIEW/validation deployment.
 *
 * WARNING: when the hatch is on, anyone reaching the deployment is signed in as
 * the all-roles {@link DEV_USER}. NEVER enable it on a deployment that holds
 * real data, real users, or a connected production database.
 */
export function isDevAuthEnabled(): boolean {
  if (process.env.AUTH_DEV_MODE !== "true") return false;
  if (process.env.NODE_ENV !== "production") return true;
  return process.env.ALLOW_DEV_AUTH_IN_PRODUCTION === "true";
}
