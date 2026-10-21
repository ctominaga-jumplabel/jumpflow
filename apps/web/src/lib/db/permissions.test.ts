import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Domain tests for the configurable permission matrix.
 *
 * Prisma is mocked; `$transaction(fn)` runs the callback against the SAME mock.
 * `recordAuditEvent` is mocked to a spy so we assert the audit payload without
 * touching the database-config guard.
 */

const m = vi.hoisted(() => {
  const roleFindUnique = vi.fn();
  const roleFindMany = vi.fn();
  const roleCreate = vi.fn();
  const roleUpdate = vi.fn();
  const permFindUnique = vi.fn();
  const permFindMany = vi.fn();
  const permCreate = vi.fn();
  const permUpdate = vi.fn();
  const rpFindMany = vi.fn();
  const rpUpsert = vi.fn();
  const rpCount = vi.fn();
  const rpCreateMany = vi.fn();
  const roleDelete = vi.fn();
  const permDelete = vi.fn();
  const permCount = vi.fn();
  const permUpdateMany = vi.fn();
  const userRoleCount = vi.fn();
  const recordAudit = vi.fn();

  const prismaMock: Record<string, unknown> = {
    role: {
      findUnique: (...a: unknown[]) => roleFindUnique(...a),
      findMany: (...a: unknown[]) => roleFindMany(...a),
      create: (...a: unknown[]) => roleCreate(...a),
      update: (...a: unknown[]) => roleUpdate(...a),
      delete: (...a: unknown[]) => roleDelete(...a),
    },
    permission: {
      findUnique: (...a: unknown[]) => permFindUnique(...a),
      findMany: (...a: unknown[]) => permFindMany(...a),
      create: (...a: unknown[]) => permCreate(...a),
      update: (...a: unknown[]) => permUpdate(...a),
      delete: (...a: unknown[]) => permDelete(...a),
      count: (...a: unknown[]) => permCount(...a),
      updateMany: (...a: unknown[]) => permUpdateMany(...a),
    },
    rolePermission: {
      findMany: (...a: unknown[]) => rpFindMany(...a),
      upsert: (...a: unknown[]) => rpUpsert(...a),
      count: (...a: unknown[]) => rpCount(...a),
      createMany: (...a: unknown[]) => rpCreateMany(...a),
    },
    userRole: { count: (...a: unknown[]) => userRoleCount(...a) },
    $transaction: (fn: (tx: unknown) => unknown) => fn(prismaMock),
  };

  return {
    prismaMock,
    roleFindUnique,
    roleFindMany,
    roleCreate,
    roleUpdate,
    permFindUnique,
    permFindMany,
    permCreate,
    permUpdate,
    rpFindMany,
    rpUpsert,
    rpCount,
    rpCreateMany,
    roleDelete,
    permDelete,
    permCount,
    permUpdateMany,
    userRoleCount,
    recordAudit,
  };
});

const {
  roleFindUnique,
  roleCreate,
  permFindUnique,
  permFindMany,
  permCreate,
  rpFindMany,
  rpUpsert,
  rpCount,
  rpCreateMany,
  roleDelete,
  permDelete,
  permUpdate,
  permCount,
  userRoleCount,
  recordAudit,
} = m;

vi.mock("@jumpflow/database", () => ({
  prisma: m.prismaMock,
  Prisma: { JsonNull: "__JsonNull__" },
}));

vi.mock("./audit", () => ({
  recordAuditEvent: (...a: unknown[]) => m.recordAudit(...a),
}));

import {
  deletePermission,
  deleteRole,
  PermissionError,
  setPermissionActive,
  setRoleActive,
  setRolePermissions,
  upsertPermission,
  upsertRole,
} from "./permissions";

beforeEach(() => {
  vi.clearAllMocks();
  rpUpsert.mockResolvedValue({});
  rpFindMany.mockResolvedValue([]);
  permFindMany.mockResolvedValue([
    { id: "perm-1", code: "HORAS" },
  ]);
  // Default: there IS at least one role retaining manage authority.
  rpCount.mockResolvedValue(1);
  // Every permission id referenced by an update exists.
  permCount.mockImplementation(async (args?: { where?: { id?: { in?: string[] } } }) =>
    new Set(args?.where?.id?.in ?? []).size,
  );
  userRoleCount.mockResolvedValue(0);
});

describe("setRolePermissions", () => {
  it("upserts each cell and audits before/after", async () => {
    roleFindUnique.mockResolvedValue({ id: "role-1", key: "FINANCE" });
    rpFindMany.mockResolvedValue([
      {
        permissionId: "perm-1",
        canView: false,
        canCreate: false,
        canEdit: false,
        canDelete: false,
        permission: { code: "HORAS" },
      },
    ]);

    const result = await setRolePermissions({
      roleId: "role-1",
      actorDbUserId: "actor-1",
      updates: [
        { permissionId: "perm-1", canView: true, canCreate: false, canEdit: true, canDelete: false },
      ],
    });

    expect(result).toEqual({ roleId: "role-1", changed: 1 });
    expect(rpUpsert).toHaveBeenCalledTimes(1);
    expect(recordAudit).toHaveBeenCalledWith(
      expect.objectContaining({
        actorUserId: "actor-1",
        entityType: "RolePermission",
        entityId: "role-1",
        action: "PERMISSION_MATRIX_UPDATED",
        before: expect.objectContaining({ roleKey: "FINANCE" }),
        after: expect.objectContaining({ roleKey: "FINANCE" }),
      }),
    );
  });

  it("rejects a change that removes the last manage authority", async () => {
    roleFindUnique.mockResolvedValue({ id: "role-1", key: "ADMIN" });
    rpCount.mockResolvedValue(0); // post-write: nobody can manage permissions

    await expect(
      setRolePermissions({
        roleId: "role-1",
        actorDbUserId: "actor-1",
        updates: [
          { permissionId: "perm-1", canView: false, canCreate: false, canEdit: false, canDelete: false },
        ],
      }),
    ).rejects.toMatchObject({ code: "LAST_ADMIN_PERMISSION" });

    // Audit is NOT written when the invariant rolls the transaction back.
    expect(recordAudit).not.toHaveBeenCalled();
  });

  it("throws NOT_FOUND for an unknown role", async () => {
    roleFindUnique.mockResolvedValue(null);
    await expect(
      setRolePermissions({
        roleId: "missing",
        actorDbUserId: "actor-1",
        updates: [
          { permissionId: "perm-1", canView: true, canCreate: false, canEdit: false, canDelete: false },
        ],
      }),
    ).rejects.toBeInstanceOf(PermissionError);
  });

  it("is a no-op with no updates", async () => {
    const result = await setRolePermissions({
      roleId: "role-1",
      actorDbUserId: "actor-1",
      updates: [],
    });
    expect(result).toEqual({ roleId: "role-1", changed: 0 });
    expect(roleFindUnique).not.toHaveBeenCalled();
  });
});

describe("setPermissionActive", () => {
  it("refuses to deactivate the manage-permissions feature", async () => {
    permFindUnique.mockResolvedValue({
      id: "perm-mgmt",
      code: "CONFIGURACOES_PERMISSOES",
      active: true,
    });
    await expect(
      setPermissionActive({ permissionId: "perm-mgmt", active: false, actorDbUserId: "a" }),
    ).rejects.toMatchObject({ code: "LAST_ADMIN_PERMISSION" });
  });
});

describe("setRoleActive", () => {
  it("refuses to deactivate a system group", async () => {
    roleFindUnique.mockResolvedValue({ id: "role-admin", isSystem: true, active: true });
    await expect(
      setRoleActive({ roleId: "role-admin", active: false, actorDbUserId: "a" }),
    ).rejects.toMatchObject({ code: "SYSTEM_ROLE_PROTECTED" });
  });
});

describe("upsertPermission", () => {
  it("rejects an invalid code", async () => {
    await expect(
      upsertPermission({ code: "bad code", name: "X", module: "M", actorDbUserId: "a" }),
    ).rejects.toMatchObject({ code: "INVALID_INPUT" });
  });

  it("rejects a duplicate code on create", async () => {
    permFindUnique.mockResolvedValue({ id: "other", code: "HORAS" });
    await expect(
      upsertPermission({ code: "HORAS", name: "Horas", module: "Horas", actorDbUserId: "a" }),
    ).rejects.toMatchObject({ code: "DUPLICATE_CODE" });
  });

  it("creates a new permission and audits it", async () => {
    permFindUnique.mockResolvedValue(null);
    permCreate.mockResolvedValue({
      id: "perm-new",
      code: "NOVO",
      name: "Novo",
      module: "Mod",
      description: null,
      active: true,
      parentId: null,
      sortOrder: 0,
    });
    const saved = await upsertPermission({
      code: "novo",
      name: "Novo",
      module: "Mod",
      actorDbUserId: "a",
    });
    expect(saved.code).toBe("NOVO");
    expect(permCreate).toHaveBeenCalled();
    expect(recordAudit).toHaveBeenCalledWith(
      expect.objectContaining({ action: "PERMISSION_CREATED" }),
    );
  });
});

describe("upsertRole", () => {
  it("rejects an invalid slug on create", async () => {
    await expect(
      upsertRole({ key: "Bad Slug", label: "Grupo", actorDbUserId: "a" }),
    ).rejects.toMatchObject({ code: "INVALID_INPUT" });
  });

  it("creates a dynamic group (no enum name) and audits it", async () => {
    roleFindUnique.mockResolvedValue(null); // key not taken
    roleCreate.mockResolvedValue({
      id: "role-x",
      key: "auditoria-interna",
      name: null,
      label: "Auditoria Interna",
      description: null,
      active: true,
      isSystem: false,
    });
    const saved = await upsertRole({
      key: "auditoria-interna",
      label: "Auditoria Interna",
      actorDbUserId: "a",
    });
    expect(saved.isSystem).toBe(false);
    expect(saved.name).toBeNull();
    expect(recordAudit).toHaveBeenCalledWith(
      expect.objectContaining({ action: "ROLE_CREATED" }),
    );
  });
});

describe("upsertPermission — catalog rules", () => {
  it("keeps the code of a system feature immutable", async () => {
    permFindUnique
      .mockResolvedValueOnce(null) // no clash for the new code
      .mockResolvedValueOnce({ id: "p-horas", code: "HORAS", module: "Horas", parentId: null, sortOrder: 10 });
    await expect(
      upsertPermission({ id: "p-horas", code: "HORAS_NOVO", name: "Horas", module: "Horas", actorDbUserId: "a" }),
    ).rejects.toMatchObject({ code: "SYSTEM_PERMISSION_PROTECTED" });
    expect(permUpdate).not.toHaveBeenCalled();
  });

  it("allows renaming a system feature while keeping its code", async () => {
    const row = { id: "p-coe", code: "COE", name: "COE", module: "Inteligência", parentId: null, sortOrder: 83, active: true, description: null };
    permFindUnique.mockResolvedValueOnce(row).mockResolvedValueOnce(row);
    permUpdate.mockResolvedValue({ ...row, name: "Painel COE" });
    const saved = await upsertPermission({ id: "p-coe", code: "COE", name: "Painel COE", module: "Inteligência", actorDbUserId: "a" });
    expect(saved).toMatchObject({ name: "Painel COE", isSystem: true });
  });

  it("rejects a parent that is itself a subtela (two-level hierarchy)", async () => {
    permFindUnique
      .mockResolvedValueOnce(null) // code clash
      .mockResolvedValueOnce({ id: "child", parentId: "root", module: "Horas" }); // parent lookup
    await expect(
      upsertPermission({ code: "X_Y", name: "Y", module: "Horas", parentId: "child", actorDbUserId: "a" }),
    ).rejects.toMatchObject({ code: "INVALID_INPUT" });
  });

  it("makes a subtela inherit its parent's module", async () => {
    permFindUnique
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({ id: "p-horas", parentId: null, module: "Horas" });
    permCreate.mockImplementation(({ data }: { data: Record<string, unknown> }) => ({ id: "new", active: true, ...data }));
    const saved = await upsertPermission({ code: "HORAS_LOTE", name: "Em lote", module: "Outro", parentId: "p-horas", actorDbUserId: "a" });
    expect(saved).toMatchObject({ module: "Horas", parentId: "p-horas", isSystem: false });
  });

  it("refuses to nest an item that already has subtelas", async () => {
    permFindUnique
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({ id: "custom", code: "CUSTOM", module: "M", parentId: null, sortOrder: 0 })
      .mockResolvedValueOnce({ id: "root", parentId: null, module: "M" });
    permCount.mockResolvedValue(2);
    await expect(
      upsertPermission({ id: "custom", code: "CUSTOM", name: "C", module: "M", parentId: "root", actorDbUserId: "a" }),
    ).rejects.toMatchObject({ code: "INVALID_INPUT" });
  });
});

describe("deletePermission", () => {
  it("protects system features", async () => {
    permFindUnique.mockResolvedValue({ id: "p", code: "HORAS", _count: { children: 0 } });
    await expect(deletePermission({ permissionId: "p", actorDbUserId: "a" })).rejects.toMatchObject({
      code: "SYSTEM_PERMISSION_PROTECTED",
    });
    expect(permDelete).not.toHaveBeenCalled();
  });

  it("refuses when the feature still has subtelas", async () => {
    permFindUnique.mockResolvedValue({ id: "p", code: "CUSTOM", _count: { children: 1 } });
    await expect(deletePermission({ permissionId: "p", actorDbUserId: "a" })).rejects.toMatchObject({
      code: "IN_USE",
    });
  });

  it("deletes a custom feature and audits its grants", async () => {
    permFindUnique.mockResolvedValue({ id: "p", code: "CUSTOM", name: "Custom", module: "M", _count: { children: 0 } });
    rpFindMany.mockResolvedValue([
      { canView: true, canCreate: false, canEdit: false, canDelete: false, role: { key: "FINANCE" } },
    ]);
    await deletePermission({ permissionId: "p", actorDbUserId: "a" });
    expect(permDelete).toHaveBeenCalledWith({ where: { id: "p" } });
    expect(recordAudit).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "PERMISSION_DELETED",
        before: expect.objectContaining({ code: "CUSTOM", grants: [expect.objectContaining({ roleKey: "FINANCE" })] }),
        after: null,
      }),
    );
  });
});

describe("deleteRole", () => {
  it("protects system groups", async () => {
    roleFindUnique.mockResolvedValue({ id: "r", key: "FINANCE", isSystem: true, _count: { users: 0 } });
    await expect(deleteRole({ roleId: "r", actorDbUserId: "a" })).rejects.toMatchObject({
      code: "SYSTEM_ROLE_PROTECTED",
    });
  });

  it("refuses a group that still has users", async () => {
    roleFindUnique.mockResolvedValue({ id: "r", key: "auditoria", isSystem: false, _count: { users: 3 } });
    await expect(deleteRole({ roleId: "r", actorDbUserId: "a" })).rejects.toMatchObject({ code: "IN_USE" });
    expect(roleDelete).not.toHaveBeenCalled();
  });

  it("rolls back when it would remove the last manage authority", async () => {
    roleFindUnique.mockResolvedValue({ id: "r", key: "auditoria", isSystem: false, _count: { users: 0 } });
    rpCount.mockResolvedValue(0);
    await expect(deleteRole({ roleId: "r", actorDbUserId: "a" })).rejects.toMatchObject({
      code: "LAST_ADMIN_PERMISSION",
    });
    expect(recordAudit).not.toHaveBeenCalled();
  });

  it("deletes an empty custom group and audits it", async () => {
    roleFindUnique.mockResolvedValue({ id: "r", key: "auditoria", label: "Auditoria", isSystem: false, active: true, _count: { users: 0 } });
    await deleteRole({ roleId: "r", actorDbUserId: "a" });
    expect(roleDelete).toHaveBeenCalledWith({ where: { id: "r" } });
    expect(recordAudit).toHaveBeenCalledWith(expect.objectContaining({ action: "ROLE_DELETED", after: null }));
  });
});

describe("upsertRole — copy matrix on create", () => {
  it("clones the source group's cells into the new group", async () => {
    roleFindUnique
      .mockResolvedValueOnce(null) // key clash
      .mockResolvedValueOnce({ id: "src", key: "FINANCE" }); // source
    roleCreate.mockResolvedValue({
      id: "new", key: "auditoria", name: null, label: "Auditoria", description: null, active: true, isSystem: false,
    });
    rpFindMany.mockResolvedValue([
      { permissionId: "p1", canView: true, canCreate: false, canEdit: true, canDelete: false },
    ]);
    const saved = await upsertRole({ key: "auditoria", label: "Auditoria", copyFromRoleId: "src", actorDbUserId: "a" });
    expect(saved.userCount).toBe(0);
    expect(rpCreateMany).toHaveBeenCalledWith({
      data: [{ permissionId: "p1", canView: true, canCreate: false, canEdit: true, canDelete: false, roleId: "new" }],
    });
    expect(recordAudit).toHaveBeenCalledWith(
      expect.objectContaining({ after: expect.objectContaining({ copiedFrom: "FINANCE", copiedCells: 1 }) }),
    );
  });
});

describe("last-admin invariant — only groups with members count", () => {
  it("counts only active roles that have at least one user", async () => {
    roleFindUnique.mockResolvedValue({ id: "role-admin", key: "ADMIN" });
    await setRolePermissions({
      roleId: "role-admin",
      actorDbUserId: "a",
      updates: [{ permissionId: "perm-1", canView: false, canCreate: false, canEdit: false, canDelete: false }],
    });
    expect(rpCount).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          role: expect.objectContaining({ active: true, users: { some: {} } }),
        }),
      }),
    );
  });

  it("rejects a matrix save that references a deleted feature", async () => {
    roleFindUnique.mockResolvedValue({ id: "role-1", key: "FINANCE" });
    permCount.mockResolvedValueOnce(0);
    await expect(
      setRolePermissions({
        roleId: "role-1",
        actorDbUserId: "a",
        updates: [{ permissionId: "gone", canView: true, canCreate: false, canEdit: false, canDelete: false }],
      }),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
    expect(rpUpsert).not.toHaveBeenCalled();
  });

  it("re-checks members inside the delete transaction", async () => {
    roleFindUnique.mockResolvedValue({ id: "r", key: "aud", isSystem: false, _count: { users: 0 } });
    userRoleCount.mockResolvedValueOnce(1);
    await expect(deleteRole({ roleId: "r", actorDbUserId: "a" })).rejects.toMatchObject({ code: "IN_USE" });
    expect(roleDelete).not.toHaveBeenCalled();
  });
});
