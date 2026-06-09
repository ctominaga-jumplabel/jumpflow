import { prisma } from "@jumpflow/database";
import { isRoleName, type RoleName } from "@/lib/auth/roles";

/**
 * User persistence + persisted RBAC.
 *
 * Bridges the auth provider (Auth.js session) with the `User`/`Role` tables,
 * without coupling business rules to the provider. All functions here assume a
 * database is configured — callers must guard with `isDatabaseConfigured()`.
 */

export interface SyncUserInput {
  /** Stable provider subject id, when available (e.g. Entra `oid`). */
  providerId?: string | null;
  email: string;
  name?: string | null;
}

export interface PersistedUser {
  id: string;
  name: string;
  email: string;
  roles: RoleName[];
}

/**
 * Pure mapper: turn persisted role rows into the app's `RoleName[]`, dropping
 * any value that is not a known role. Kept pure so it is trivially testable
 * and free of Prisma. Duplicates are removed.
 */
export function mapPersistedRoles(
  rows: ReadonlyArray<{ role: { name: string } }>,
): RoleName[] {
  const seen = new Set<RoleName>();
  for (const row of rows) {
    const name = row.role?.name;
    if (isRoleName(name)) seen.add(name);
  }
  return [...seen];
}

/**
 * Idempotently sync the authenticated identity into the `User` table and
 * return the persisted user together with its roles. Email is the natural key
 * (unique). Existing rows have their display name refreshed; roles are NOT
 * granted here — role provisioning is a separate, audited admin action.
 */
export async function syncUserFromAuth(
  input: SyncUserInput,
): Promise<PersistedUser> {
  const email = input.email.trim().toLowerCase();
  const name = input.name?.trim() || email;

  const user = await prisma.user.upsert({
    where: { email },
    update: { name },
    create: { email, name },
    include: { roles: { include: { role: true } } },
  });

  return {
    id: user.id,
    name: user.name,
    email: user.email,
    roles: mapPersistedRoles(user.roles),
  };
}

/**
 * Load persisted roles for an email. Returns `[]` when the user is unknown.
 * The persisted roles are the authoritative source for RBAC in production.
 */
export async function loadUserRoles(email: string): Promise<RoleName[]> {
  const user = await prisma.user.findUnique({
    where: { email: email.trim().toLowerCase() },
    select: { roles: { include: { role: true } } },
  });
  return user ? mapPersistedRoles(user.roles) : [];
}
