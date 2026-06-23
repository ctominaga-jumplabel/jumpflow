import { describe, expect, it } from "vitest";
import {
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
