// Re-export only the runtime values the app needs. Avoid `export *` from the
// CommonJS Prisma client because Turbopack cannot statically enumerate it.
export { Prisma, PrismaClient } from "@prisma/client";

// The shared singleton instance. Prefer this over `new PrismaClient()`.
export { prisma } from "./client";

// Criptografia em nivel de campo dos valores do consultor: importar de
// "@jumpflow/database/field-encryption" (entry point proprio, fora do mock de
// "@jumpflow/database" usado nos testes).
