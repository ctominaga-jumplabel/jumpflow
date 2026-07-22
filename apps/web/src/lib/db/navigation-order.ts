import { prisma } from "@jumpflow/database";
import { isDatabaseConfigured } from "./config";

/**
 * Persistence for the GLOBAL primary-menu order (P28). One row per menu item,
 * keyed by its `href` (stable identifier, present even on items without a
 * permission code). The order is org-wide (simpler than per-user); the admin
 * screen `/app/admin/menu` reads and writes it.
 */

/**
 * Read the persisted `href → position` order. Returns `{}` when no database is
 * configured or on a transient read error (fail-safe: the sidebar then falls
 * back to the default catalog order rather than breaking navigation).
 */
export async function getNavigationOrder(): Promise<Record<string, number>> {
  if (!isDatabaseConfigured()) return {};
  try {
    const rows = await prisma.navigationOrder.findMany({
      orderBy: { position: "asc" },
      select: { key: true, position: true },
    });
    const map: Record<string, number> = {};
    for (const row of rows) map[row.key] = row.position;
    return map;
  } catch (error) {
    console.error("[navigation-order] read failed", error);
    return {};
  }
}

/**
 * Replace the persisted order with `keys` (index = position). Runs in a
 * transaction: the whole table is cleared and rewritten so removed/renamed
 * items never linger. Callers must authorize (ADMIN) and audit separately.
 */
export async function saveNavigationOrder(keys: string[]): Promise<void> {
  await prisma.$transaction([
    prisma.navigationOrder.deleteMany({}),
    prisma.navigationOrder.createMany({
      data: keys.map((key, index) => ({ key, position: index })),
    }),
  ]);
}
