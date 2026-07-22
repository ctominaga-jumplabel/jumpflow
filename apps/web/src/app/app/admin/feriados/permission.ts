/**
 * Permission code that governs the Feriados admin screen. Lives in its own
 * module (not the `"use server"` actions file, which may only export async
 * functions) so both the page guard and the write actions share one source of
 * truth. Must match the `permissionCode` in `lib/navigation.ts` and the code
 * seeded in `packages/database/prisma/seed.mjs`.
 */
export const FERIADOS_PERMISSION = "CONFIGURACOES_FERIADOS";
