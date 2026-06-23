import { Prisma, prisma } from "@jumpflow/database";
import {
  aggregateRolePermissions,
  MANAGE_PERMISSIONS_CODE,
  type PermissionMatrix,
} from "@/lib/auth/permission-codes";
import { recordAuditEvent } from "./audit";

/**
 * Persistence + domain rules for the configurable permission matrix.
 *
 * - Permission resolution is keyed on the user's role ROWS (roleId), never on
 *   the RoleName enum, so dynamically-created groups grant permissions too.
 * - All mutations are audited via `recordAuditEvent` (before/after JSON) and
 *   guard the "last administrative permission" invariant.
 *
 * Callers must guard with `isDatabaseConfigured()` before invoking — these
 * functions assume a database is configured.
 */

/** Domain error codes surfaced to server actions (mapped to ActionResult). */
export type PermissionErrorCode =
  | "INVALID_INPUT"
  | "NOT_FOUND"
  | "LAST_ADMIN_PERMISSION"
  | "SYSTEM_ROLE_PROTECTED"
  | "DUPLICATE_CODE";

/** Thrown by the domain layer; server actions map `.code` to an ErrorCode. */
export class PermissionError extends Error {
  constructor(
    public readonly code: PermissionErrorCode,
    message: string,
  ) {
    super(message);
    this.name = "PermissionError";
  }
}

// ---------------------------------------------------------------------------
// Resolution (used by the auth layer)
// ---------------------------------------------------------------------------

/**
 * Load the effective permission matrix for a persisted user id. Joins the
 * user's ACTIVE roles to their RolePermission rows on ACTIVE permissions and
 * aggregates with a UNION rule. Returns an empty matrix for an unknown user.
 */
export async function loadPermissionMatrixForUser(
  dbUserId: string,
): Promise<PermissionMatrix> {
  const rows = await prisma.rolePermission.findMany({
    where: {
      role: { active: true, users: { some: { userId: dbUserId } } },
      permission: { active: true },
    },
    select: {
      canView: true,
      canCreate: true,
      canEdit: true,
      canDelete: true,
      permission: { select: { code: true } },
    },
  });

  return aggregateRolePermissions(
    rows.map((r) => ({
      code: r.permission.code,
      canView: r.canView,
      canCreate: r.canCreate,
      canEdit: r.canEdit,
      canDelete: r.canDelete,
    })),
  );
}

// ---------------------------------------------------------------------------
// Reads for the admin matrix screen
// ---------------------------------------------------------------------------

export interface RoleView {
  id: string;
  key: string;
  name: string | null;
  label: string;
  description: string | null;
  active: boolean;
  isSystem: boolean;
}

export interface PermissionView {
  id: string;
  code: string;
  name: string;
  module: string;
  description: string | null;
  active: boolean;
  parentId: string | null;
  sortOrder: number;
}

export interface RolePermissionCell {
  permissionId: string;
  canView: boolean;
  canCreate: boolean;
  canEdit: boolean;
  canDelete: boolean;
}

/** Human label for a role, falling back to key when no label is set. */
function roleLabelOf(row: {
  key: string;
  label: string | null;
}): string {
  return row.label?.trim() || row.key;
}

/** List every access group (active + inactive), system groups first. */
export async function listRoles(): Promise<RoleView[]> {
  const rows = await prisma.role.findMany({
    orderBy: [{ isSystem: "desc" }, { key: "asc" }],
  });
  return rows.map((r) => ({
    id: r.id,
    key: r.key,
    name: r.name,
    label: roleLabelOf(r),
    description: r.description,
    active: r.active,
    isSystem: r.isSystem,
  }));
}

/** List the full permission catalog (active + inactive), ordered for display. */
export async function listPermissions(): Promise<PermissionView[]> {
  const rows = await prisma.permission.findMany({
    orderBy: [{ module: "asc" }, { sortOrder: "asc" }, { name: "asc" }],
  });
  return rows.map((r) => ({
    id: r.id,
    code: r.code,
    name: r.name,
    module: r.module,
    description: r.description,
    active: r.active,
    parentId: r.parentId,
    sortOrder: r.sortOrder,
  }));
}

/** The matrix cells for a single role, keyed by permissionId. */
export async function listRoleMatrix(
  roleId: string,
): Promise<RolePermissionCell[]> {
  const rows = await prisma.rolePermission.findMany({
    where: { roleId },
    select: {
      permissionId: true,
      canView: true,
      canCreate: true,
      canEdit: true,
      canDelete: true,
    },
  });
  return rows;
}

/**
 * Every role's matrix cells in one query, grouped by roleId. Lets the admin
 * screen switch between groups instantly without a round-trip per group.
 */
export async function listAllRoleMatrices(): Promise<
  Record<string, RolePermissionCell[]>
> {
  const rows = await prisma.rolePermission.findMany({
    select: {
      roleId: true,
      permissionId: true,
      canView: true,
      canCreate: true,
      canEdit: true,
      canDelete: true,
    },
  });
  const byRole: Record<string, RolePermissionCell[]> = {};
  for (const r of rows) {
    (byRole[r.roleId] ??= []).push({
      permissionId: r.permissionId,
      canView: r.canView,
      canCreate: r.canCreate,
      canEdit: r.canEdit,
      canDelete: r.canDelete,
    });
  }
  return byRole;
}

// ---------------------------------------------------------------------------
// Invariant: there must always be a way to manage permissions
// ---------------------------------------------------------------------------

/**
 * Count ACTIVE roles that retain `view` + `edit` on the manage-permissions
 * permission, OPTIONALLY excluding one role (whose new values are simulated by
 * the caller). Run inside the mutation transaction so the count is consistent.
 */
async function countRolesWithManageAuthority(
  tx: Prisma.TransactionClient,
  excludeRoleId?: string,
): Promise<number> {
  return tx.rolePermission.count({
    where: {
      canView: true,
      canEdit: true,
      role: { active: true, ...(excludeRoleId ? { id: { not: excludeRoleId } } : {}) },
      permission: { code: MANAGE_PERMISSIONS_CODE, active: true },
    },
  });
}

// ---------------------------------------------------------------------------
// Mutations (audited)
// ---------------------------------------------------------------------------

export interface MatrixCellUpdate {
  permissionId: string;
  canView: boolean;
  canCreate: boolean;
  canEdit: boolean;
  canDelete: boolean;
}

export interface SetRolePermissionsInput {
  roleId: string;
  updates: MatrixCellUpdate[];
  /** Real persisted cuid of the acting ADMIN (audit actor). */
  actorDbUserId: string;
}

/**
 * Replace the matrix cells listed in `updates` for a role (upsert per cell).
 * Audits `PERMISSION_MATRIX_UPDATED` with the before/after of the touched
 * cells. Enforces the last-admin-permission invariant inside the transaction:
 * a change that would leave zero active roles able to manage permissions is
 * rejected.
 */
export async function setRolePermissions(
  input: SetRolePermissionsInput,
): Promise<{ roleId: string; changed: number }> {
  const { roleId, updates, actorDbUserId } = input;

  if (updates.length === 0) return { roleId, changed: 0 };

  const role = await prisma.role.findUnique({ where: { id: roleId } });
  if (!role) throw new PermissionError("NOT_FOUND", "Grupo não encontrado.");

  const permissionIds = updates.map((u) => u.permissionId);

  await prisma.$transaction(async (tx) => {
    // Snapshot the affected cells BEFORE the change for the audit trail.
    const beforeRows = await tx.rolePermission.findMany({
      where: { roleId, permissionId: { in: permissionIds } },
      select: {
        permissionId: true,
        canView: true,
        canCreate: true,
        canEdit: true,
        canDelete: true,
        permission: { select: { code: true } },
      },
    });
    const beforeByPermission = new Map(
      beforeRows.map((r) => [r.permissionId, r]),
    );

    for (const u of updates) {
      const data = {
        canView: u.canView,
        canCreate: u.canCreate,
        canEdit: u.canEdit,
        canDelete: u.canDelete,
      };
      await tx.rolePermission.upsert({
        where: { roleId_permissionId: { roleId, permissionId: u.permissionId } },
        update: data,
        create: { roleId, permissionId: u.permissionId, ...data },
      });
    }

    // Guard: after applying, at least one active role must retain authority to
    // manage permissions. The check runs post-write inside the tx; if violated
    // the throw rolls everything back.
    const remaining = await countRolesWithManageAuthority(tx);
    if (remaining === 0) {
      throw new PermissionError(
        "LAST_ADMIN_PERMISSION",
        "Esta alteração removeria a última permissão administrativa do sistema. Mantenha ao menos um grupo com acesso à Matriz de Permissões.",
      );
    }

    // Resolve permission codes for the audit payload (touched cells only).
    const perms = await tx.permission.findMany({
      where: { id: { in: permissionIds } },
      select: { id: true, code: true },
    });
    const codeById = new Map(perms.map((p) => [p.id, p.code]));

    const before = updates.map((u) => {
      const prev = beforeByPermission.get(u.permissionId);
      return {
        code: codeById.get(u.permissionId) ?? u.permissionId,
        canView: prev?.canView ?? false,
        canCreate: prev?.canCreate ?? false,
        canEdit: prev?.canEdit ?? false,
        canDelete: prev?.canDelete ?? false,
      };
    });
    const after = updates.map((u) => ({
      code: codeById.get(u.permissionId) ?? u.permissionId,
      canView: u.canView,
      canCreate: u.canCreate,
      canEdit: u.canEdit,
      canDelete: u.canDelete,
    }));

    await recordAuditEvent({
      actorUserId: actorDbUserId,
      entityType: "RolePermission",
      entityId: roleId,
      action: "PERMISSION_MATRIX_UPDATED",
      before: { roleKey: role.key, cells: before },
      after: { roleKey: role.key, cells: after },
    });
  });

  return { roleId, changed: updates.length };
}

// ---------------------------------------------------------------------------
// Catalog management (dynamic permissions)
// ---------------------------------------------------------------------------

const CODE_RE = /^[A-Z][A-Z0-9_]*$/;

export interface UpsertPermissionInput {
  /** Omit to create; provide to update an existing permission. */
  id?: string;
  code: string;
  name: string;
  module: string;
  description?: string | null;
  parentId?: string | null;
  sortOrder?: number;
  actorDbUserId: string;
}

export async function upsertPermission(
  input: UpsertPermissionInput,
): Promise<PermissionView> {
  const code = input.code.trim().toUpperCase();
  if (!CODE_RE.test(code)) {
    throw new PermissionError(
      "INVALID_INPUT",
      "Código inválido. Use letras maiúsculas, números e underscore (ex.: HORAS_RELATORIOS).",
    );
  }
  const name = input.name.trim();
  const moduleName = input.module.trim();
  if (!name || !moduleName) {
    throw new PermissionError("INVALID_INPUT", "Nome e módulo são obrigatórios.");
  }

  // Uniqueness of code (excluding self on update).
  const existing = await prisma.permission.findUnique({ where: { code } });
  if (existing && existing.id !== input.id) {
    throw new PermissionError("DUPLICATE_CODE", "Já existe uma funcionalidade com este código.");
  }

  const data = {
    code,
    name,
    module: moduleName,
    description: input.description?.trim() || null,
    parentId: input.parentId || null,
    sortOrder: input.sortOrder ?? 0,
  };

  const saved = input.id
    ? await prisma.permission.update({ where: { id: input.id }, data })
    : await prisma.permission.create({ data });

  await recordAuditEvent({
    actorUserId: input.actorDbUserId,
    entityType: "Permission",
    entityId: saved.id,
    action: input.id ? "PERMISSION_UPDATED" : "PERMISSION_CREATED",
    before: existing
      ? { code: existing.code, name: existing.name, module: existing.module, active: existing.active }
      : null,
    after: { code: saved.code, name: saved.name, module: saved.module, active: saved.active },
  });

  return {
    id: saved.id,
    code: saved.code,
    name: saved.name,
    module: saved.module,
    description: saved.description,
    active: saved.active,
    parentId: saved.parentId,
    sortOrder: saved.sortOrder,
  };
}

export async function setPermissionActive(input: {
  permissionId: string;
  active: boolean;
  actorDbUserId: string;
}): Promise<{ id: string; active: boolean }> {
  const perm = await prisma.permission.findUnique({
    where: { id: input.permissionId },
  });
  if (!perm) throw new PermissionError("NOT_FOUND", "Funcionalidade não encontrada.");

  // Never disable the permission that governs matrix management — it would lock
  // every admin out of this screen.
  if (perm.code === MANAGE_PERMISSIONS_CODE && !input.active) {
    throw new PermissionError(
      "LAST_ADMIN_PERMISSION",
      "Não é possível desativar a funcionalidade que controla a Matriz de Permissões.",
    );
  }

  const saved = await prisma.permission.update({
    where: { id: input.permissionId },
    data: { active: input.active },
  });

  await recordAuditEvent({
    actorUserId: input.actorDbUserId,
    entityType: "Permission",
    entityId: saved.id,
    action: input.active ? "PERMISSION_ACTIVATED" : "PERMISSION_DEACTIVATED",
    before: { active: perm.active },
    after: { active: saved.active },
  });

  return { id: saved.id, active: saved.active };
}

// ---------------------------------------------------------------------------
// Group management (dynamic roles)
// ---------------------------------------------------------------------------

const KEY_RE = /^[a-z][a-z0-9-]*$/;

export interface UpsertRoleInput {
  /** Omit to create a dynamic group; provide to update an existing group. */
  id?: string;
  /** Required on create (slug); ignored on update of system groups. */
  key?: string;
  label: string;
  description?: string | null;
  actorDbUserId: string;
}

export async function upsertRole(input: UpsertRoleInput): Promise<RoleView> {
  const label = input.label.trim();
  if (!label) throw new PermissionError("INVALID_INPUT", "Informe o nome do grupo.");

  if (input.id) {
    const existing = await prisma.role.findUnique({ where: { id: input.id } });
    if (!existing) throw new PermissionError("NOT_FOUND", "Grupo não encontrado.");
    const saved = await prisma.role.update({
      where: { id: input.id },
      data: { label, description: input.description?.trim() || null },
    });
    await recordAuditEvent({
      actorUserId: input.actorDbUserId,
      entityType: "Role",
      entityId: saved.id,
      action: "ROLE_UPDATED",
      before: { label: existing.label, description: existing.description },
      after: { label: saved.label, description: saved.description },
    });
    return toRoleView(saved);
  }

  // Create a NEW dynamic group (no enum name; identified by slug `key`).
  const key = (input.key ?? "").trim().toLowerCase();
  if (!KEY_RE.test(key)) {
    throw new PermissionError(
      "INVALID_INPUT",
      "Identificador inválido. Use letras minúsculas, números e hífen (ex.: auditoria-interna).",
    );
  }
  const clash = await prisma.role.findUnique({ where: { key } });
  if (clash) throw new PermissionError("DUPLICATE_CODE", "Já existe um grupo com este identificador.");

  const saved = await prisma.role.create({
    data: {
      key,
      label,
      description: input.description?.trim() || null,
      isSystem: false,
      active: true,
    },
  });
  await recordAuditEvent({
    actorUserId: input.actorDbUserId,
    entityType: "Role",
    entityId: saved.id,
    action: "ROLE_CREATED",
    before: null,
    after: { key: saved.key, label: saved.label },
  });
  return toRoleView(saved);
}

export async function setRoleActive(input: {
  roleId: string;
  active: boolean;
  actorDbUserId: string;
}): Promise<{ id: string; active: boolean }> {
  const role = await prisma.role.findUnique({ where: { id: input.roleId } });
  if (!role) throw new PermissionError("NOT_FOUND", "Grupo não encontrado.");

  // System groups (especially ADMIN) cannot be deactivated — they anchor RBAC.
  if (role.isSystem && !input.active) {
    throw new PermissionError(
      "SYSTEM_ROLE_PROTECTED",
      "Grupos do sistema não podem ser desativados.",
    );
  }

  const saved = await prisma.$transaction(async (tx) => {
    const updated = await tx.role.update({
      where: { id: input.roleId },
      data: { active: input.active },
    });
    // Deactivating a group must not remove the last manage-permissions authority.
    if (!input.active) {
      const remaining = await countRolesWithManageAuthority(tx);
      if (remaining === 0) {
        throw new PermissionError(
          "LAST_ADMIN_PERMISSION",
          "Não é possível desativar o último grupo com acesso à Matriz de Permissões.",
        );
      }
    }
    return updated;
  });

  await recordAuditEvent({
    actorUserId: input.actorDbUserId,
    entityType: "Role",
    entityId: saved.id,
    action: input.active ? "ROLE_ACTIVATED" : "ROLE_DEACTIVATED",
    before: { active: role.active },
    after: { active: saved.active },
  });

  return { id: saved.id, active: saved.active };
}

function toRoleView(r: {
  id: string;
  key: string;
  name: string | null;
  label: string | null;
  description: string | null;
  active: boolean;
  isSystem: boolean;
}): RoleView {
  return {
    id: r.id,
    key: r.key,
    name: r.name,
    label: roleLabelOf(r),
    description: r.description,
    active: r.active,
    isSystem: r.isSystem,
  };
}
