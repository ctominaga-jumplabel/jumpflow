// Re-export only the runtime values the app needs. Avoid `export *` from the
// CommonJS Prisma client because Turbopack cannot statically enumerate it.
export { Prisma, PrismaClient } from "@prisma/client";

// The shared singleton instance. Prefer this over `new PrismaClient()`.
export { prisma } from "./client";
