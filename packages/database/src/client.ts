import { PrismaClient } from "@prisma/client";

/**
 * Prisma client singleton.
 *
 * Next.js dev/hot-reload re-evaluates modules frequently; without a global
 * cache each reload would open a new pool of connections and eventually
 * exhaust the database. We cache a single instance on `globalThis` outside of
 * production. In production a fresh instance per serverless lambda is correct,
 * so we do NOT cache there.
 *
 * The constructor does not open a connection — Prisma connects lazily on the
 * first query — so importing this module is cheap and safe even when
 * `DATABASE_URL` is not configured. Callers that may run without a database
 * must still guard with `isDatabaseConfigured()` before issuing queries.
 */
const globalForPrisma = globalThis as unknown as {
  jumpflowPrisma?: PrismaClient;
};

export const prisma: PrismaClient =
  globalForPrisma.jumpflowPrisma ??
  new PrismaClient({
    log:
      process.env.NODE_ENV === "development"
        ? ["warn", "error"]
        : ["error"],
  });

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.jumpflowPrisma = prisma;
}
