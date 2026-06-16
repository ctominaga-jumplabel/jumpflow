import { prisma } from "@jumpflow/database";
import { isRoleName, type RoleName } from "@/lib/auth/roles";
import type { AppUser } from "@/lib/auth/types";

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
 * Default seniority for a Consultant auto-created from an authenticated login.
 * `Seniority` has no schema default and is required, so a sensible mid value is
 * chosen; admins can refine it later. Kept as a const so tests and callers
 * share the same expectation.
 */
export const DEFAULT_CONSULTANT_SENIORITY = "MID_LEVEL" as const;

/**
 * Idempotently guarantee a `Consultant` profile for an authenticated identity.
 *
 * Every user that logs in gets a Consultant profile by default so they show up
 * in the Consultores directory. The function is idempotent and only writes when
 * the profile is missing:
 *
 * - User already has a linked consultant (its `userId` was returned): no-op.
 * - A consultant exists for the same email with `userId === null`: link it
 *   (covers seeds and pre-registered emails). No duplicate row is created.
 * - A consultant exists for the email but is linked to ANOTHER user: leave it
 *   untouched and log — never steal an existing link.
 * - No consultant for the email: create one (ACTIVE, default seniority).
 *
 * This MUST NOT be fatal: roles/RBAC and login do not depend on it. Callers
 * should still wrap it defensively, but errors here are caught and logged.
 *
 * @param db Prisma client (or transaction) — keeps it testable.
 * @param hasLinkedConsultant Whether the user already owns a consultant, taken
 *   from the user upsert `include`. Avoids an extra query on the common path.
 */
export async function ensureConsultantForUser(
  db: typeof prisma,
  input: { userId: string; email: string; name: string },
  hasLinkedConsultant: boolean,
): Promise<void> {
  // Common path: the user already owns a consultant. Read-only, nothing to do.
  if (hasLinkedConsultant) return;

  const existing = await db.consultant.findUnique({
    where: { email: input.email },
    select: { id: true, userId: true },
  });

  if (existing) {
    if (existing.userId === null) {
      // Pre-registered / seeded consultant: attach this user to it.
      await db.consultant.update({
        where: { id: existing.id },
        data: { userId: input.userId },
      });
      return;
    }
    if (existing.userId !== input.userId) {
      // Email belongs to a consultant linked to another user — do not touch.
      console.warn(
        `[ensureConsultantForUser] consultant ${existing.id} for ${input.email} is linked to a different user; skipping`,
      );
    }
    return;
  }

  await db.consultant.create({
    data: {
      userId: input.userId,
      name: input.name,
      email: input.email,
      status: "ACTIVE",
      seniority: DEFAULT_CONSULTANT_SENIORITY,
    },
  });
}

/**
 * Idempotently sync the authenticated identity into the `User` table and
 * return the persisted user together with its roles. Email is the natural key
 * (unique). Existing rows have their display name refreshed; roles are NOT
 * granted here — role provisioning is a separate, audited admin action.
 *
 * As a side effect, every authenticated identity is guaranteed a `Consultant`
 * profile (see {@link ensureConsultantForUser}). That step is non-fatal: if it
 * fails, login still succeeds and the persisted user is returned.
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
    include: {
      roles: { include: { role: true } },
      consultant: { select: { id: true } },
    },
  });

  try {
    await ensureConsultantForUser(
      prisma,
      { userId: user.id, email: user.email, name: user.name },
      user.consultant !== null,
    );
  } catch (error) {
    // Non-fatal: auth must never break because of consultant provisioning.
    console.error(
      `[syncUserFromAuth] failed to ensure consultant for ${user.email}`,
      error,
    );
  }

  return {
    id: user.id,
    name: user.name,
    email: user.email,
    roles: mapPersistedRoles(user.roles),
  };
}

/**
 * Resolve the persisted `User` row behind a session {@link AppUser}.
 *
 * Constraint: in dev mode the session id is the synthetic "dev-user", which
 * never exists in the database, while the seeded data is linked to the REAL
 * cuid of the same email. So we try the id first (production path) and fall
 * back to the unique email. Use the returned id whenever a REAL FK is needed
 * (e.g. `Approval.approverUserId`, `AuditEvent.actorUserId`) — never the
 * session id.
 */
export async function resolveDbUser(
  user: AppUser,
): Promise<{ id: string; name: string; email: string } | null> {
  const byId = await prisma.user.findUnique({
    where: { id: user.id },
    select: { id: true, name: true, email: true },
  });
  if (byId) return byId;
  return prisma.user.findUnique({
    where: { email: user.email.trim().toLowerCase() },
    select: { id: true, name: true, email: true },
  });
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
