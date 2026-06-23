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
  const recordAudit = vi.fn();

  const prismaMock: Record<string, unknown> = {
    role: {
      findUnique: (...a: unknown[]) => roleFindUnique(...a),
      findMany: (...a: unknown[]) => roleFindMany(...a),
      create: (...a: unknown[]) => roleCreate(...a),
      update: (...a: unknown[]) => roleUpdate(...a),
    },
    permission: {
      findUnique: (...a: unknown[]) => permFindUnique(...a),
      findMany: (...a: unknown[]) => permFindMany(...a),
      create: (...a: unknown[]) => permCreate(...a),
      update: (...a: unknown[]) => permUpdate(...a),
    },
    rolePermission: {
      findMany: (...a: unknown[]) => rpFindMany(...a),
      upsert: (...a: unknown[]) => rpUpsert(...a),
      count: (...a: unknown[]) => rpCount(...a),
    },
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
