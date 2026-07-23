/**
 * Pure RBAC permission primitives for the configurable permission matrix.
 *
 * No server-only imports (no Prisma), so this is safe on the edge and trivially
 * unit-testable. The DB read/aggregation lives in `lib/db/permissions.ts`; the
 * current-user integration and guards live in `lib/auth/permissions.ts`.
 *
 * The matrix is DATA-DRIVEN: the full catalog of permissions lives in the
 * database (seeded from `packages/database/prisma/seed.mjs`), NOT hardcoded
 * here. The app only depends on the few well-known codes below.
 */

/** The four independent actions tracked per (role, permission) cell. */
export type PermissionAction = "view" | "create" | "edit" | "delete";

export const PERMISSION_ACTIONS: readonly PermissionAction[] = [
  "view",
  "create",
  "edit",
  "delete",
] as const;

/** Effective grant for a single permission code (union across the user's roles). */
export interface PermissionGrant {
  view: boolean;
  create: boolean;
  edit: boolean;
  delete: boolean;
}

/**
 * Effective permission matrix for a user: code → grant. A missing code means
 * "no access" (everything denied), so callers must default to false.
 */
export type PermissionMatrix = Record<string, PermissionGrant>;

/**
 * Well-known permission code that governs the Permission Matrix admin screen
 * itself. The "last administrative permission" invariant is expressed in terms
 * of this code: the system must always retain at least one active role with
 * `view` + `edit` on it. See `lib/db/permissions.ts`.
 */
export const MANAGE_PERMISSIONS_CODE = "CONFIGURACOES_PERMISSOES";

/**
 * Governs the compensation ("remuneração") section of the consultant registration
 * (remuneração pontual + acordada). Historically gated only by FINANCIAL_ROLES;
 * now ALSO grantable via the matrix so People/DP can manage it without seeing the
 * rest of the financial surface. Child of `CONSULTORES` in the matrix.
 */
export const CONSULTANT_COMPENSATION_CODE = "CONSULTORES_REMUNERACAO";

/**
 * Per-group codes for the consultant registration, so People/DP and other roles
 * can be granted each information block independently via the matrix (M1). All
 * are children of `CONSULTORES`. `CONSULTORES_REMUNERACAO` (compensation) is the
 * fifth group and is declared above. Personal + Currículo are the two groups the
 * broader roles get by default; Documentos + Bancárias stay People/Finance.
 */
export const CONSULTANT_PERSONAL_CODE = "CONSULTORES_PESSOAIS";
export const CONSULTANT_DOCUMENTS_CODE = "CONSULTORES_DOCUMENTOS";
export const CONSULTANT_CURRICULUM_CODE = "CONSULTORES_CURRICULO";
export const CONSULTANT_BANK_CODE = "CONSULTORES_BANCARIAS";

/**
 * The five consultant-registration groups (M1), each a matrix code. Order is the
 * display order in the consultant detail. `CONSULTANT_COMPENSATION_CODE` keeps
 * its historical name (`_REMUNERACAO`).
 */
export const CONSULTANT_GROUP_CODES = {
  personal: CONSULTANT_PERSONAL_CODE,
  documents: CONSULTANT_DOCUMENTS_CODE,
  curriculum: CONSULTANT_CURRICULUM_CODE,
  bank: CONSULTANT_BANK_CODE,
  compensation: CONSULTANT_COMPENSATION_CODE,
} as const;

export type ConsultantGroupKey = keyof typeof CONSULTANT_GROUP_CODES;

/**
 * Governs the broad ("all consultants") report scope — the consultant filter in
 * Relatórios. Historically implied by the broad report roles (ADMIN/AREA_MANAGER/
 * FINANCE); now ALSO grantable via the matrix. Child of `RELATORIOS`. Note: this
 * does NOT unlock the HOURS financial columns (billing rate/cost/margin), which
 * stay gated by FINANCIAL_ROLES (`includeFinancials`). Expense/reimbursement
 * values follow the broad scope by design (People/DP see them) — see the finance
 * decision noted in `resolveReportScope`.
 */
export const REPORT_CONSULTANT_FILTER_CODE = "RELATORIOS_CONSULTORES";

const EMPTY_GRANT: PermissionGrant = {
  view: false,
  create: false,
  edit: false,
  delete: false,
};

/** A raw RolePermission row as needed for aggregation (DB-shape agnostic). */
export interface RolePermissionRow {
  code: string;
  canView: boolean;
  canCreate: boolean;
  canEdit: boolean;
  canDelete: boolean;
}

/**
 * Aggregate a user's RolePermission rows (across ALL their roles) into a single
 * effective matrix. The combine rule is UNION: an action is granted if ANY of
 * the user's roles grants it. Pure (no I/O) so it is unit-testable.
 */
export function aggregateRolePermissions(
  rows: ReadonlyArray<RolePermissionRow>,
): PermissionMatrix {
  const matrix: PermissionMatrix = {};
  for (const row of rows) {
    const current = matrix[row.code] ?? { ...EMPTY_GRANT };
    current.view = current.view || row.canView;
    current.create = current.create || row.canCreate;
    current.edit = current.edit || row.canEdit;
    current.delete = current.delete || row.canDelete;
    matrix[row.code] = current;
  }
  return matrix;
}

/** Whether the matrix grants `action` on `code`. Defaults to false (fail-closed). */
export function matrixAllows(
  matrix: PermissionMatrix,
  code: string,
  action: PermissionAction,
): boolean {
  const grant = matrix[code];
  if (!grant) return false;
  return grant[action] === true;
}

/**
 * From a known list of permission codes, return the subset the matrix lets the
 * user VIEW. Used to gate the navigation menu: pass the nav items' codes (not
 * the whole catalog), so it works with both real matrices and the full-control
 * Proxy (which has no own enumerable keys).
 */
export function filterViewableCodes(
  matrix: PermissionMatrix,
  codes: readonly string[],
): string[] {
  return codes.filter((code) => matrixAllows(matrix, code, "view"));
}

/**
 * A matrix that grants full control on every code. Used for the ADMIN dev user
 * and any "god" fallback. Implemented as a Proxy so it answers `true` for ANY
 * code without enumerating the catalog.
 */
export function fullControlMatrix(): PermissionMatrix {
  const allowAll: PermissionGrant = {
    view: true,
    create: true,
    edit: true,
    delete: true,
  };
  return new Proxy(
    {},
    {
      get: () => allowAll,
      has: () => true,
    },
  ) as PermissionMatrix;
}
