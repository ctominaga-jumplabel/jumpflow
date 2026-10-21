import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  SYSTEM_PERMISSION_CODES,
  isSystemPermissionCode,
  aggregateRolePermissions,
  filterViewableCodes,
  fullControlMatrix,
  matrixAllows,
  MANAGE_PERMISSIONS_CODE,
  type RolePermissionRow,
} from "./permission-codes";

describe("aggregateRolePermissions", () => {
  it("unions grants across roles (any role grants → allowed)", () => {
    const rows: RolePermissionRow[] = [
      { code: "HORAS", canView: true, canCreate: false, canEdit: false, canDelete: false },
      { code: "HORAS", canView: false, canCreate: true, canEdit: false, canDelete: false },
    ];
    const matrix = aggregateRolePermissions(rows);
    expect(matrix.HORAS).toEqual({
      view: true,
      create: true,
      edit: false,
      delete: false,
    });
  });

  it("keeps distinct codes independent", () => {
    const rows: RolePermissionRow[] = [
      { code: "HORAS", canView: true, canCreate: false, canEdit: false, canDelete: false },
      { code: "FINANCEIRO", canView: false, canCreate: false, canEdit: true, canDelete: false },
    ];
    const matrix = aggregateRolePermissions(rows);
    expect(matrix.HORAS.view).toBe(true);
    expect(matrix.FINANCEIRO.edit).toBe(true);
    expect(matrix.FINANCEIRO.view).toBe(false);
  });

  it("returns an empty matrix for no rows", () => {
    expect(aggregateRolePermissions([])).toEqual({});
  });
});

describe("matrixAllows", () => {
  const matrix = aggregateRolePermissions([
    { code: "HORAS", canView: true, canCreate: false, canEdit: true, canDelete: false },
  ]);

  it("returns the grant for a known code/action", () => {
    expect(matrixAllows(matrix, "HORAS", "view")).toBe(true);
    expect(matrixAllows(matrix, "HORAS", "edit")).toBe(true);
    expect(matrixAllows(matrix, "HORAS", "create")).toBe(false);
  });

  it("fails closed for unknown codes", () => {
    expect(matrixAllows(matrix, "DESCONHECIDO", "view")).toBe(false);
  });
});

describe("filterViewableCodes", () => {
  it("returns only codes the matrix lets the user view", () => {
    const matrix = aggregateRolePermissions([
      { code: "HORAS", canView: true, canCreate: false, canEdit: false, canDelete: false },
      { code: "FINANCEIRO", canView: false, canCreate: false, canEdit: false, canDelete: false },
    ]);
    expect(filterViewableCodes(matrix, ["HORAS", "FINANCEIRO", "OUTRO"])).toEqual([
      "HORAS",
    ]);
  });
});

describe("fullControlMatrix", () => {
  it("grants every action on any code (used for dev/no-db)", () => {
    const matrix = fullControlMatrix();
    expect(matrixAllows(matrix, "ANYTHING", "delete")).toBe(true);
    expect(matrixAllows(matrix, MANAGE_PERMISSIONS_CODE, "edit")).toBe(true);
  });

  it("answers viewable for any list of codes", () => {
    expect(filterViewableCodes(fullControlMatrix(), ["A", "B"])).toEqual(["A", "B"]);
  });
});

describe("SYSTEM_PERMISSION_CODES", () => {
  // The seed is plain ESM that runs on import, so read its catalog as text.
  const seed = readFileSync(
    join(process.cwd(), "../../packages/database/prisma/seed.mjs"),
    "utf8",
  );
  const block = seed.slice(
    seed.indexOf("const PERMISSION_CATALOG = ["),
    seed.indexOf("async function seedPermissions"),
  );
  const seededCodes = [...block.matchAll(/\{\s*code:\s*"([A-Z0-9_]+)"/g)].map(
    (m) => m[1],
  );

  it("matches exactly the codes seeded by PERMISSION_CATALOG", () => {
    expect(seededCodes.length).toBeGreaterThan(0);
    expect([...SYSTEM_PERMISSION_CODES].sort()).toEqual([...seededCodes].sort());
  });

  it("includes the matrix-management code and rejects ad-hoc codes", () => {
    expect(isSystemPermissionCode(MANAGE_PERMISSIONS_CODE)).toBe(true);
    expect(isSystemPermissionCode("AUDITORIA_INTERNA")).toBe(false);
  });
});
