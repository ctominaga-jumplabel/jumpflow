import { cache } from "react";
import {
  fullControlMatrix,
  matrixAllows,
  type PermissionAction,
  type PermissionMatrix,
} from "./permission-codes";
import { getCurrentUser } from "./current-user";
import { isDevAuthEnabled } from "./dev";
import { isDatabaseConfigured } from "@/lib/db/config";

/**
 * Bridges the current user to the configurable permission matrix.
 *
 * Resolution rules (mirrors `getCurrentUser` semantics):
 * - Dev mode: the all-roles DEV_USER gets full control (every screen reachable).
 * - No database configured: full control — there is no matrix to consult, so
 *   the matrix layer must NOT block anything; the existing static guards still
 *   apply. Keeps the additive layer regression-free in demo/offline setups.
 * - Real session + database: the PERSISTED matrix is authoritative. A database
 *   error fails CLOSED (empty matrix), exactly like role resolution.
 *
 * Memoized per request with React `cache()` so a page + its layout share a
 * single matrix read.
 */
export const getCurrentMatrix = cache(async (): Promise<PermissionMatrix> => {
  if (isDevAuthEnabled()) return fullControlMatrix();

  const user = await getCurrentUser();
  if (!user) return {};

  // No database: defer entirely to the static guards (no matrix to enforce).
  if (!isDatabaseConfigured()) return fullControlMatrix();

  try {
    // Lazy import so Prisma never loads on code paths without a database.
    const { loadPermissionMatrixForUser } = await import("@/lib/db/permissions");
    return await loadPermissionMatrixForUser(user.id);
  } catch (error) {
    // Fail closed: a configured-but-unreachable database must never widen access.
    console.error("[permissions] failed to load matrix; failing closed", error);
    return {};
  }
});

/** Whether the current user may perform `action` on the permission `code`. */
export async function can(
  code: string,
  action: PermissionAction,
): Promise<boolean> {
  const matrix = await getCurrentMatrix();
  return matrixAllows(matrix, code, action);
}
