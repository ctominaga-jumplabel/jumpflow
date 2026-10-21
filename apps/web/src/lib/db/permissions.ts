import { Prisma, prisma } from "@jumpflow/database";
import {
  aggregateRolePermissions,
  isSystemPermissionCode,
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
  | "SYSTEM_PERMISSION_PROTECTED"
  | "IN_USE"
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
  /** Users currently assigned to this group (blocks deletion when > 0). */
  userCount: number;
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
  /** Native (seeded) feature: code is immutable and it cannot be deleted. */
  isSystem: boolean;
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
    include: { _count: { select: { users: true } } },
  });
  return rows.map((r) => toRoleView(r, r._count.users));
}

/** List the full permission catalog (active + inactive), ordered for display. */
export async function listPermissions(): Promise<PermissionView[]> {
  const rows = await prisma.permission.findMany({
    orderBy: [{ module: "asc" }, { sortOrder: "asc" }, { name: "asc" }],
  });
  return rows.map(toPermissionView);
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
 * Count ACTIVE roles WITH AT LEAST ONE MEMBER that retain `view` + `edit` on
 * the manage-permissions permission, OPTIONALLY excluding one role (whose new
 * values are simulated by the caller). An empty group never counts: otherwise a
 * group copied from Administrador (0 users) would satisfy the invariant while
 * the real admins lose the screen. Run inside the mutation transaction so the
 * count is consistent.
 */
async function countRolesWithManageAuthority(
  tx: Prisma.TransactionClient,
  excludeRoleId?: string,
): Promise<number> {
  return tx.rolePermission.count({
    where: {
      canView: true,
      canEdit: true,
      role: {
        active: true,
        users: { some: {} },
        ...(excludeRoleId ? { id: { not: excludeRoleId } } : {}),
      },
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
  const known = await prisma.permission.count({ where: { id: { in: permissionIds } } });
  if (known !== new Set(permissionIds).size) {
    throw new PermissionError(
      "NOT_FOUND",
      "Uma ou mais funcionalidades não existem mais. Descarte o rascunho e tente de novo.",
    );
  }

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
  const clash = await prisma.permission.findUnique({ where: { code } });
  if (clash && clash.id !== input.id) {
    throw new PermissionError("DUPLICATE_CODE", "Já existe uma funcionalidade com este código.");
  }

  const existing = input.id
    ? await prisma.permission.findUnique({ where: { id: input.id } })
    : null;
  if (input.id && !existing) {
    throw new PermissionError("NOT_FOUND", "Funcionalidade não encontrada.");
  }
  // The guards read native features by code: renaming one would silently
  // revoke (or orphan) every check that depends on it.
  if (existing && isSystemPermissionCode(existing.code) && existing.code !== code) {
    throw new PermissionError(
      "SYSTEM_PERMISSION_PROTECTED",
      "O código de uma funcionalidade do sistema não pode ser alterado.",
    );
  }

  // Hierarchy is two levels (tela → subtela/funcionalidade): the parent must be
  // a top-level item, never the item itself, and an item with children cannot
  // become a child. The child inherits the parent's module so the matrix groups
  // them together.
  const parentId = input.parentId || null;
  let effectiveModule = moduleName;
  if (parentId) {
    if (parentId === input.id) {
      throw new PermissionError("INVALID_INPUT", "Uma funcionalidade não pode ser pai dela mesma.");
    }
    const parent = await prisma.permission.findUnique({ where: { id: parentId } });
    if (!parent) throw new PermissionError("NOT_FOUND", "Tela pai não encontrada.");
    if (parent.parentId) {
      throw new PermissionError(
        "INVALID_INPUT",
        "Escolha uma tela principal como pai (a hierarquia tem dois níveis).",
      );
    }
    if (input.id) {
      const children = await prisma.permission.count({ where: { parentId: input.id } });
      if (children > 0) {
        throw new PermissionError(
          "INVALID_INPUT",
          "Esta funcionalidade possui subtelas e não pode ficar abaixo de outra.",
        );
      }
    }
    effectiveModule = parent.module;
  }

  const data = {
    code,
    name,
    module: effectiveModule,
    description: input.description?.trim() || null,
    parentId,
    sortOrder: input.sortOrder ?? existing?.sortOrder ?? 0,
  };

  let movedChildren: string[] = [];
  const saved = await prisma.$transaction(async (tx) => {
    const row = input.id
      ? await tx.permission.update({ where: { id: input.id }, data })
      : await tx.permission.create({ data });
    // Moving a top-level screen to another module carries its subtelas along.
    if (existing && !parentId && existing.module !== row.module) {
      const children = await tx.permission.findMany({
        where: { parentId: row.id },
        select: { code: true },
      });
      movedChildren = children.map((c) => c.code);
      await tx.permission.updateMany({
        where: { parentId: row.id },
        data: { module: row.module },
      });
    }
    return row;
  });

  await recordAuditEvent({
    actorUserId: input.actorDbUserId,
    entityType: "Permission",
    entityId: saved.id,
    action: input.id ? "PERMISSION_UPDATED" : "PERMISSION_CREATED",
    before: existing ? catalogAuditShape(existing) : null,
    after: {
      ...catalogAuditShape(saved),
      ...(movedChildren.length > 0 ? { movedChildren } : {}),
    },
  });

  return toPermissionView(saved);
}

/** Fields of a catalog row recorded in PERMISSION_CREATED/UPDATED audits. */
function catalogAuditShape(r: {
  code: string;
  name: string;
  module: string;
  description: string | null;
  parentId: string | null;
  sortOrder: number;
  active: boolean;
}) {
  return {
    code: r.code,
    name: r.name,
    module: r.module,
    description: r.description,
    parentId: r.parentId,
    sortOrder: r.sortOrder,
    active: r.active,
  };
}

/**
 * Permanently delete a feature created through the admin screen. Native
 * (seeded) features are protected — inactivate them instead — and an item with
 * subtelas must have them moved or deleted first. Its matrix cells go with it
 * (RolePermission cascades). Audited with the grants it held.
 */
export async function deletePermission(input: {
  permissionId: string;
  actorDbUserId: string;
}): Promise<{ id: string }> {
  const perm = await prisma.permission.findUnique({
    where: { id: input.permissionId },
    include: { _count: { select: { children: true } } },
  });
  if (!perm) throw new PermissionError("NOT_FOUND", "Funcionalidade não encontrada.");

  if (isSystemPermissionCode(perm.code)) {
    throw new PermissionError(
      "SYSTEM_PERMISSION_PROTECTED",
      "Funcionalidades do sistema não podem ser excluídas. Inative-a para ocultá-la da matriz.",
    );
  }
  if (perm._count.children > 0) {
    throw new PermissionError(
      "IN_USE",
      "Esta funcionalidade possui subtelas. Exclua-as ou mova-as antes de excluí-la.",
    );
  }

  await prisma.$transaction(async (tx) => {
    const grants = await tx.rolePermission.findMany({
      where: { permissionId: perm.id },
      select: {
        canView: true,
        canCreate: true,
        canEdit: true,
        canDelete: true,
        role: { select: { key: true } },
      },
    });
    await tx.permission.delete({ where: { id: perm.id } });
    await recordAuditEvent({
      actorUserId: input.actorDbUserId,
      entityType: "Permission",
      entityId: perm.id,
      action: "PERMISSION_DELETED",
      before: {
        code: perm.code,
        name: perm.name,
        module: perm.module,
        grants: grants.map((g) => ({
          roleKey: g.role.key,
          canView: g.canView,
          canCreate: g.canCreate,
          canEdit: g.canEdit,
          canDelete: g.canDelete,
        })),
      },
      after: null,
    });
  });

  return { id: perm.id };
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
  /** Create only: start the new group with a copy of this group's matrix. */
  copyFromRoleId?: string | null;
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
    return toRoleView(saved, await prisma.userRole.count({ where: { roleId: saved.id } }));
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

  const source = input.copyFromRoleId
    ? await prisma.role.findUnique({ where: { id: input.copyFromRoleId } })
    : null;
  if (input.copyFromRoleId && !source) {
    throw new PermissionError("NOT_FOUND", "Grupo de origem não encontrado.");
  }

  const saved = await prisma.$transaction(async (tx) => {
    const created = await tx.role.create({
      data: {
        key,
        label,
        description: input.description?.trim() || null,
        isSystem: false,
        active: true,
      },
    });
    let copied = 0;
    if (source) {
      const cells = await tx.rolePermission.findMany({
        where: { roleId: source.id },
        select: {
          permissionId: true,
          canView: true,
          canCreate: true,
          canEdit: true,
          canDelete: true,
        },
      });
      if (cells.length > 0) {
        await tx.rolePermission.createMany({
          data: cells.map((c) => ({ ...c, roleId: created.id })),
        });
      }
      copied = cells.length;
    }
    await recordAuditEvent({
      actorUserId: input.actorDbUserId,
      entityType: "Role",
      entityId: created.id,
      action: "ROLE_CREATED",
      before: null,
      after: {
        key: created.key,
        label: created.label,
        ...(source ? { copiedFrom: source.key, copiedCells: copied } : {}),
      },
    });
    return created;
  });
  return toRoleView(saved, 0);
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

/**
 * Permanently delete a custom access group. System groups are protected and a
 * group with members must have them reassigned first (Acessos), so deleting
 * never silently strips anyone's access. Its matrix cells cascade. The
 * last-admin invariant is re-checked inside the transaction.
 */
export async function deleteRole(input: {
  roleId: string;
  actorDbUserId: string;
}): Promise<{ id: string }> {
  const role = await prisma.role.findUnique({
    where: { id: input.roleId },
    include: { _count: { select: { users: true } } },
  });
  if (!role) throw new PermissionError("NOT_FOUND", "Grupo não encontrado.");

  if (role.isSystem) {
    throw new PermissionError(
      "SYSTEM_ROLE_PROTECTED",
      "Grupos do sistema não podem ser excluídos.",
    );
  }
  if (role._count.users > 0) {
    throw new PermissionError(
      "IN_USE",
      `Este grupo tem ${role._count.users} usuário(s). Remova-os do grupo em Acessos antes de excluí-lo.`,
    );
  }

  await prisma.$transaction(async (tx) => {
    // Re-check inside the tx: UserRole cascades, so a member assigned since the
    // first read would otherwise silently lose this group.
    const members = await tx.userRole.count({ where: { roleId: role.id } });
    if (members > 0) {
      throw new PermissionError(
        "IN_USE",
        `Este grupo tem ${members} usuário(s). Remova-os do grupo em Acessos antes de excluí-lo.`,
      );
    }
    const cells = await tx.rolePermission.count({ where: { roleId: role.id } });
    await tx.role.delete({ where: { id: role.id } });
    const remaining = await countRolesWithManageAuthority(tx);
    if (remaining === 0) {
      throw new PermissionError(
        "LAST_ADMIN_PERMISSION",
        "Não é possível excluir o último grupo com acesso à Matriz de Permissões.",
      );
    }
    await recordAuditEvent({
      actorUserId: input.actorDbUserId,
      entityType: "Role",
      entityId: role.id,
      action: "ROLE_DELETED",
      before: {
        key: role.key,
        label: role.label,
        description: role.description,
        active: role.active,
        cells,
      },
      after: null,
    });
  });

  return { id: role.id };
}

function toRoleView(
  r: {
    id: string;
    key: string;
    name: string | null;
    label: string | null;
    description: string | null;
    active: boolean;
    isSystem: boolean;
  },
  userCount: number,
): RoleView {
  return {
    id: r.id,
    key: r.key,
    name: r.name,
    label: roleLabelOf(r),
    description: r.description,
    active: r.active,
    isSystem: r.isSystem,
    userCount,
  };
}

function toPermissionView(r: {
  id: string;
  code: string;
  name: string;
  module: string;
  description: string | null;
  active: boolean;
  parentId: string | null;
  sortOrder: number;
}): PermissionView {
  return {
    id: r.id,
    code: r.code,
    name: r.name,
    module: r.module,
    description: r.description,
    active: r.active,
    parentId: r.parentId,
    sortOrder: r.sortOrder,
    isSystem: isSystemPermissionCode(r.code),
  };
}
