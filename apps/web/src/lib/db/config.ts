/**
 * Database availability gate.
 *
 * The Database Foundation integrates progressively: the app must keep working
 * (login, dev mode, screens) even when no database is configured yet. Every
 * code path that touches Prisma must first check {@link isDatabaseConfigured}.
 *
 * Edge-safe: only reads `process.env`, no server-only imports.
 */
export function isDatabaseConfigured(): boolean {
  const url = process.env.DATABASE_URL;
  return typeof url === "string" && url.trim().length > 0;
}
