import { createHash, randomBytes } from "node:crypto";
import { Prisma, prisma } from "@jumpflow/database";
import { isRoleName, type RoleName } from "@/lib/auth/roles";
import { hashPassword } from "@/lib/auth/password";
import { buildAuditEventData } from "@/lib/db/audit";

/**
 * Invitation + access-management domain layer (Round 5, auth-foundation §11.4
 * to §11.8). Node-only (`node:crypto`, Prisma): NEVER import from
 * `auth.config.ts` or `proxy.ts` (edge). Every public function assumes a
 * database is configured — callers must guard with `isDatabaseConfigured()`.
 *
 * SECURITY invariants enforced here (not just in the UI):
 *  - The plaintext invite token is generated once, returned to the caller in
 *    memory, and NEVER persisted nor logged. Only its sha256 digest is stored.
 *  - Acceptance re-hashes the token, validates status + expiry in a single
 *    transaction, and is single-use.
 *  - The last active ADMIN can never be demoted or deactivated
 *    (`countActiveAdminsExcluding` inside the mutation transaction).
 */

/** Mirrors the Prisma `UserStatus` enum (not re-exported by the db package). */
export type UserStatus = "ACTIVE" | "INACTIVE";

/** Domain error codes surfaced to server actions (mapped to ActionResult). */
export type InvitationErrorCode =
  | "ALREADY_HAS_ACCESS"
  | "INVALID_INPUT"
  | "NOT_FOUND"
  | "INVITE_INVALID"
  | "WEAK_PASSWORD"
  | "LAST_ADMIN";

/** Thrown by the domain layer; server actions map `.code` to an ErrorCode. */
export class InvitationError extends Error {
  constructor(
    public readonly code: InvitationErrorCode,
    message: string,
  ) {
    super(message);
    this.name = "InvitationError";
  }
}

const MIN_PASSWORD_LENGTH = 10;

function inviteTtlMs(): number {
  const hours = Number(process.env.INVITE_TOKEN_TTL_HOURS);
  const safe = Number.isFinite(hours) && hours > 0 ? hours : 72;
  return safe * 60 * 60 * 1000;
}

function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

/** sha256 digest (hex) of the high-entropy plaintext token. */
function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

/** Generate a fresh plaintext token (>=256 bits) and its stored digest. */
function generateToken(): { token: string; tokenHash: string } {
  const token = randomBytes(32).toString("base64url");
  return { token, tokenHash: hashToken(token) };
}

/**
 * Validate and dedupe a requested role set. Must be a non-empty subset of the
 * known catalog; duplicates are removed, order preserved by first appearance.
 */
function sanitizeRoles(roles: unknown): RoleName[] {
  if (!Array.isArray(roles)) {
    throw new InvitationError("INVALID_INPUT", "Grupos de acesso inválidos.");
  }
  const seen = new Set<RoleName>();
  for (const value of roles) {
    if (!isRoleName(value)) {
      throw new InvitationError("INVALID_INPUT", "Grupo de acesso desconhecido.");
    }
    seen.add(value);
  }
  if (seen.size === 0) {
    throw new InvitationError(
      "INVALID_INPUT",
      "Selecione ao menos um grupo de acesso.",
    );
  }
  return [...seen];
}

/**
 * Count ACTIVE users holding the ADMIN role, EXCLUDING `userId`. Used inside
 * mutation transactions to guard the last-admin invariant. Pass a transaction
 * client (`tx`) so the count is consistent with the mutation.
 */
async function countActiveAdminsExcluding(
  tx: Prisma.TransactionClient,
  userId: string,
): Promise<number> {
  return tx.user.count({
    where: {
      id: { not: userId },
      status: "ACTIVE",
      roles: { some: { role: { name: "ADMIN" } } },
    },
  });
}

// ---------------------------------------------------------------------------
// Create invitation
// ---------------------------------------------------------------------------

export interface CreateInvitationInput {
  email: string;
  name: string;
  roles: RoleName[];
  /** Real persisted cuid of the acting ADMIN (from `resolveDbUser`). */
  invitedByDbUserId: string;
}

export interface CreatedInvitation {
  id: string;
  email: string;
  name: string;
  roles: RoleName[];
  expiresAt: Date;
}

export interface CreateInvitationResult {
  invitation: CreatedInvitation;
  /** Plaintext token — returned ONCE, never persisted/logged. */
  token: string;
}

/**
 * Create a PENDING invitation for `email`.
 *
 * Dedup decision: if a PENDING invitation already exists for the email, the
 * OLD one is REVOKED (status REVOKED, audited) and a NEW invitation with a new
 * token/expiry is created. Rationale: re-inviting is a deliberate admin action
 * and the old link must stop working immediately (single active digest), so we
 * never silently reuse a token whose plaintext the admin no longer holds.
 *
 * Blocks the invite when an ACTIVE user already owns the email (already has
 * access) — re-granting roles is done through `setUserRoles`, not a new invite.
 */
export async function createInvitation(
  input: CreateInvitationInput,
): Promise<CreateInvitationResult> {
  const email = normalizeEmail(input.email);
  const name = input.name.trim();
  if (!email || !name) {
    throw new InvitationError("INVALID_INPUT", "Nome e e-mail são obrigatórios.");
  }
  const roles = sanitizeRoles(input.roles);

  const existingUser = await prisma.user.findUnique({
    where: { email },
    select: { status: true },
  });
  if (existingUser?.status === "ACTIVE") {
    throw new InvitationError(
      "ALREADY_HAS_ACCESS",
      "Este e-mail já possui acesso ativo. Ajuste os grupos pela lista de usuários.",
    );
  }

  const { token, tokenHash } = generateToken();
  const expiresAt = new Date(Date.now() + inviteTtlMs());

  const invitation = await prisma.$transaction(async (tx) => {
    // Revoke any prior PENDING invitations for this email (old links die).
    const stalePending = await tx.userInvitation.findMany({
      where: { email, status: "PENDING" },
      select: { id: true },
    });
    if (stalePending.length > 0) {
      await tx.userInvitation.updateMany({
        where: { id: { in: stalePending.map((s) => s.id) } },
        data: { status: "REVOKED" },
      });
      for (const stale of stalePending) {
        await tx.auditEvent.create({
          data: buildAuditEventData({
            actorUserId: input.invitedByDbUserId,
            entityType: "UserInvitation",
            entityId: stale.id,
            action: "INVITATION_REVOKED",
            before: { status: "PENDING" },
            after: { status: "REVOKED", reason: "superseded" },
          }),
        });
      }
    }

    const created = await tx.userInvitation.create({
      data: {
        email,
        name,
        tokenHash,
        status: "PENDING",
        roles,
        expiresAt,
        invitedByUserId: input.invitedByDbUserId,
      },
      select: { id: true, email: true, name: true, roles: true, expiresAt: true },
    });

    await tx.auditEvent.create({
      data: buildAuditEventData({
        actorUserId: input.invitedByDbUserId,
        entityType: "UserInvitation",
        entityId: created.id,
        action: "INVITATION_CREATED",
        after: { email, roles, expiresAt },
      }),
    });

    return created;
  });

  return {
    invitation: {
      id: invitation.id,
      email: invitation.email,
      name: invitation.name,
      roles: invitation.roles as RoleName[],
      expiresAt: invitation.expiresAt,
    },
    token,
  };
}

// ---------------------------------------------------------------------------
// Find / validate by token (public acceptance flow)
// ---------------------------------------------------------------------------

export interface ValidInvitation {
  id: string;
  email: string;
  name: string;
  roles: RoleName[];
}

/**
 * Resolve an invitation by its PLAINTEXT token. Returns the invitation only
 * when it is PENDING and not expired. An expired PENDING invitation is marked
 * EXPIRED (best-effort) and treated as invalid. Returns null for any other
 * case (unknown, revoked, accepted) — callers MUST surface a single neutral
 * message and never reveal which case occurred.
 */
export async function findValidInvitationByToken(
  token: string,
): Promise<ValidInvitation | null> {
  if (typeof token !== "string" || token.length === 0) return null;

  const tokenHash = hashToken(token);
  const invitation = await prisma.userInvitation.findUnique({
    where: { tokenHash },
    select: { id: true, email: true, name: true, roles: true, status: true, expiresAt: true },
  });

  if (!invitation || invitation.status !== "PENDING") return null;

  if (invitation.expiresAt.getTime() <= Date.now()) {
    // Best-effort: flip to EXPIRED so the row reflects reality. Swallow errors
    // (e.g. a race that already accepted it) — the invite is invalid either way.
    try {
      await prisma.userInvitation.updateMany({
        where: { id: invitation.id, status: "PENDING" },
        data: { status: "EXPIRED" },
      });
    } catch {
      // ignore — still invalid
    }
    return null;
  }

  return {
    id: invitation.id,
    email: invitation.email,
    name: invitation.name,
    roles: invitation.roles as RoleName[],
  };
}

// ---------------------------------------------------------------------------
// Accept invitation (public)
// ---------------------------------------------------------------------------

export interface AcceptInvitationInput {
  token: string;
  password: string;
  /** Optional display name override; falls back to the invitation's name. */
  name?: string;
}

/**
 * Accept an invitation: create/activate the User with the chosen password,
 * grant the invitation's roles and mark it ACCEPTED — all in one transaction
 * that REVALIDATES status + expiry, so a concurrent revoke/accept cannot slip
 * through. Single-use: the @unique status guard on the update makes a second
 * acceptance fail. The plaintext token is never logged.
 */
export async function acceptInvitation(
  input: AcceptInvitationInput,
): Promise<{ ok: true }> {
  const { token } = input;
  if (typeof token !== "string" || token.length === 0) {
    throw new InvitationError("INVITE_INVALID", "Convite inválido ou expirado.");
  }
  if (typeof input.password !== "string" || input.password.length < MIN_PASSWORD_LENGTH) {
    throw new InvitationError(
      "WEAK_PASSWORD",
      `A senha deve ter ao menos ${MIN_PASSWORD_LENGTH} caracteres.`,
    );
  }

  const tokenHash = hashToken(token);
  // Hash the password OUTSIDE the transaction (scrypt is CPU-heavy; keep the
  // transaction short). It is discarded if the invite turns out invalid.
  const passwordHash = await hashPassword(input.password);

  await prisma.$transaction(async (tx) => {
    const invitation = await tx.userInvitation.findUnique({
      where: { tokenHash },
      select: { id: true, email: true, name: true, roles: true, status: true, expiresAt: true },
    });

    if (
      !invitation ||
      invitation.status !== "PENDING" ||
      invitation.expiresAt.getTime() <= Date.now()
    ) {
      throw new InvitationError("INVITE_INVALID", "Convite inválido ou expirado.");
    }

    const email = invitation.email;
    const name = input.name?.trim() || invitation.name;
    const now = new Date();

    // Create or activate the user with the chosen password.
    const user = await tx.user.upsert({
      where: { email },
      update: { name, passwordHash, emailVerifiedAt: now, status: "ACTIVE" },
      create: { email, name, passwordHash, emailVerifiedAt: now, status: "ACTIVE" },
      select: { id: true },
    });

    // Grant the invitation's roles (idempotent via composite PK upsert).
    const grantedRoles = invitation.roles as RoleName[];
    const roleRows = await tx.role.findMany({
      where: { name: { in: grantedRoles } },
      select: { id: true, name: true },
    });
    for (const role of roleRows) {
      await tx.userRole.upsert({
        where: { userId_roleId: { userId: user.id, roleId: role.id } },
        update: {},
        create: { userId: user.id, roleId: role.id },
      });
    }

    // Mark ACCEPTED — the @unique PENDING guard makes a double-accept fail.
    const accepted = await tx.userInvitation.updateMany({
      where: { id: invitation.id, status: "PENDING" },
      data: { status: "ACCEPTED", acceptedAt: now, createdUserId: user.id },
    });
    if (accepted.count !== 1) {
      // Lost a race: another request accepted/revoked it first.
      throw new InvitationError("INVITE_INVALID", "Convite inválido ou expirado.");
    }

    await tx.auditEvent.create({
      data: buildAuditEventData({
        // Actor of the acceptance is the invited user themselves.
        actorUserId: user.id,
        entityType: "UserInvitation",
        entityId: invitation.id,
        action: "INVITATION_ACCEPTED",
        after: { email, invitationId: invitation.id },
      }),
    });
    await tx.auditEvent.create({
      data: buildAuditEventData({
        actorUserId: user.id,
        entityType: "User",
        entityId: user.id,
        action: "ROLE_GRANTED",
        after: { roles: grantedRoles, via: "invitation", invitationId: invitation.id },
      }),
    });
  });

  return { ok: true };
}

// ---------------------------------------------------------------------------
// Revoke / regenerate
// ---------------------------------------------------------------------------

/** Revoke a PENDING invitation. Idempotent-ish: a non-PENDING invite errors. */
export async function revokeInvitation(
  id: string,
  actorDbUserId: string,
): Promise<{ ok: true }> {
  await prisma.$transaction(async (tx) => {
    const invitation = await tx.userInvitation.findUnique({
      where: { id },
      select: { id: true, status: true },
    });
    if (!invitation) {
      throw new InvitationError("NOT_FOUND", "Convite não encontrado.");
    }
    if (invitation.status !== "PENDING") {
      throw new InvitationError("INVITE_INVALID", "Convite não está pendente.");
    }
    const revoked = await tx.userInvitation.updateMany({
      where: { id: invitation.id, status: "PENDING" },
      data: { status: "REVOKED" },
    });
    if (revoked.count !== 1) {
      throw new InvitationError("INVITE_INVALID", "Convite não está pendente.");
    }
    await tx.auditEvent.create({
      data: buildAuditEventData({
        actorUserId: actorDbUserId,
        entityType: "UserInvitation",
        entityId: invitation.id,
        action: "INVITATION_REVOKED",
        before: { status: "PENDING" },
        after: { status: "REVOKED" },
      }),
    });
  });
  return { ok: true };
}

/**
 * Regenerate an invitation: revoke the existing PENDING one and create a fresh
 * invitation (new token, new expiry) for the same email/roles/name. Returns the
 * new plaintext token ONCE.
 */
export async function regenerateInvitation(
  id: string,
  actorDbUserId: string,
): Promise<CreateInvitationResult> {
  const existing = await prisma.userInvitation.findUnique({
    where: { id },
    select: { email: true, name: true, roles: true, status: true },
  });
  if (!existing) {
    throw new InvitationError("NOT_FOUND", "Convite não encontrado.");
  }
  if (existing.status !== "PENDING") {
    throw new InvitationError("INVITE_INVALID", "Convite não está pendente.");
  }
  // createInvitation revokes any prior PENDING for the email and audits both.
  return createInvitation({
    email: existing.email,
    name: existing.name,
    roles: existing.roles as RoleName[],
    invitedByDbUserId: actorDbUserId,
  });
}

// ---------------------------------------------------------------------------
// Listings
// ---------------------------------------------------------------------------

export interface AccessUserView {
  id: string;
  name: string;
  email: string;
  status: UserStatus;
  roles: RoleName[];
  lastLoginAt: Date | null;
}

/** Users with their roles + status + last login, for the admin access screen. */
export async function listAccessUsers(): Promise<AccessUserView[]> {
  const users = await prisma.user.findMany({
    orderBy: { name: "asc" },
    select: {
      id: true,
      name: true,
      email: true,
      status: true,
      lastLoginAt: true,
      roles: { select: { role: { select: { name: true } } } },
    },
  });
  return users.map((u) => ({
    id: u.id,
    name: u.name,
    email: u.email,
    status: u.status,
    lastLoginAt: u.lastLoginAt,
    roles: u.roles
      .map((r) => r.role.name)
      .filter(isRoleName),
  }));
}

export interface PendingInvitationView {
  id: string;
  email: string;
  name: string;
  roles: RoleName[];
  expiresAt: Date;
  invitedByName: string | null;
  createdAt: Date;
}

/** PENDING invitations — the tokenHash is NEVER selected/exposed. */
export async function listPendingInvitations(): Promise<PendingInvitationView[]> {
  const invitations = await prisma.userInvitation.findMany({
    where: { status: "PENDING" },
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      email: true,
      name: true,
      roles: true,
      expiresAt: true,
      createdAt: true,
      invitedBy: { select: { name: true } },
    },
  });
  return invitations.map((i) => ({
    id: i.id,
    email: i.email,
    name: i.name,
    roles: i.roles as RoleName[],
    expiresAt: i.expiresAt,
    invitedByName: i.invitedBy?.name ?? null,
    createdAt: i.createdAt,
  }));
}

// ---------------------------------------------------------------------------
// Role / status mutations (with last-admin guard)
// ---------------------------------------------------------------------------

export interface SetUserRolesInput {
  targetUserId: string;
  roles: RoleName[];
  actorDbUserId: string;
}

/**
 * Replace a user's roles with `roles` (diff-based). Audits ROLE_GRANTED /
 * ROLE_REVOKED with before/after. Guards the last-admin invariant: if the
 * change removes ADMIN and the target is the last active ADMIN, it is rejected.
 */
export async function setUserRoles(
  input: SetUserRolesInput,
): Promise<{ ok: true; roles: RoleName[] }> {
  const nextRoles = sanitizeRoles(input.roles);

  await prisma.$transaction(async (tx) => {
    const user = await tx.user.findUnique({
      where: { id: input.targetUserId },
      select: {
        id: true,
        status: true,
        roles: { select: { role: { select: { id: true, name: true } } } },
      },
    });
    if (!user) {
      throw new InvitationError("NOT_FOUND", "Usuário não encontrado.");
    }

    const currentRoles = user.roles
      .map((r) => r.role.name)
      .filter(isRoleName);

    const removingAdmin =
      currentRoles.includes("ADMIN") && !nextRoles.includes("ADMIN");

    // Last-admin guard: only matters when the target is an ACTIVE admin losing
    // ADMIN. Count other active admins inside the same transaction.
    if (removingAdmin && user.status === "ACTIVE") {
      const others = await countActiveAdminsExcluding(tx, user.id);
      if (others === 0) {
        throw new InvitationError(
          "LAST_ADMIN",
          "Não é possível remover o último administrador ativo.",
        );
      }
    }

    const toAdd = nextRoles.filter((r) => !currentRoles.includes(r));
    const toRemove = currentRoles.filter((r) => !nextRoles.includes(r));

    if (toAdd.length === 0 && toRemove.length === 0) {
      return; // no-op: no write, no audit noise
    }

    const roleRows = await tx.role.findMany({
      select: { id: true, name: true },
    });
    const roleIdByName = new Map(
      roleRows.filter((r) => isRoleName(r.name)).map((r) => [r.name, r.id]),
    );

    for (const name of toAdd) {
      const roleId = roleIdByName.get(name);
      if (!roleId) continue;
      await tx.userRole.upsert({
        where: { userId_roleId: { userId: user.id, roleId } },
        update: {},
        create: { userId: user.id, roleId },
      });
    }
    if (toRemove.length > 0) {
      const removeIds = toRemove
        .map((name) => roleIdByName.get(name))
        .filter((id): id is string => Boolean(id));
      await tx.userRole.deleteMany({
        where: { userId: user.id, roleId: { in: removeIds } },
      });
    }

    if (toAdd.length > 0) {
      await tx.auditEvent.create({
        data: buildAuditEventData({
          actorUserId: input.actorDbUserId,
          entityType: "User",
          entityId: user.id,
          action: "ROLE_GRANTED",
          before: { roles: currentRoles },
          after: { roles: nextRoles, granted: toAdd },
        }),
      });
    }
    if (toRemove.length > 0) {
      await tx.auditEvent.create({
        data: buildAuditEventData({
          actorUserId: input.actorDbUserId,
          entityType: "User",
          entityId: user.id,
          action: "ROLE_REVOKED",
          before: { roles: currentRoles },
          after: { roles: nextRoles, revoked: toRemove },
        }),
      });
    }
  });

  return { ok: true, roles: nextRoles };
}

export interface SetUserStatusInput {
  targetUserId: string;
  status: UserStatus;
  actorDbUserId: string;
}

/**
 * Activate/deactivate a user. Audits USER_STATUS_CHANGED. Guards the last-admin
 * invariant: deactivating the last active ADMIN is rejected.
 */
export async function setUserStatus(
  input: SetUserStatusInput,
): Promise<{ ok: true; status: UserStatus }> {
  const nextStatus = input.status;
  if (nextStatus !== "ACTIVE" && nextStatus !== "INACTIVE") {
    throw new InvitationError("INVALID_INPUT", "Status inválido.");
  }

  await prisma.$transaction(async (tx) => {
    const user = await tx.user.findUnique({
      where: { id: input.targetUserId },
      select: {
        id: true,
        status: true,
        roles: { select: { role: { select: { name: true } } } },
      },
    });
    if (!user) {
      throw new InvitationError("NOT_FOUND", "Usuário não encontrado.");
    }

    if (user.status === nextStatus) {
      return; // no-op
    }

    const isAdmin = user.roles.some((r) => r.role.name === "ADMIN");
    if (nextStatus === "INACTIVE" && isAdmin) {
      const others = await countActiveAdminsExcluding(tx, user.id);
      if (others === 0) {
        throw new InvitationError(
          "LAST_ADMIN",
          "Não é possível desativar o último administrador ativo.",
        );
      }
    }

    await tx.user.update({
      where: { id: user.id },
      data: { status: nextStatus },
    });
    await tx.auditEvent.create({
      data: buildAuditEventData({
        actorUserId: input.actorDbUserId,
        entityType: "User",
        entityId: user.id,
        action: "USER_STATUS_CHANGED",
        before: { status: user.status },
        after: { status: nextStatus },
      }),
    });
  });

  return { ok: true, status: nextStatus };
}
