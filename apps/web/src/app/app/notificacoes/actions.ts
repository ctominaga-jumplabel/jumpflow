"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireUser } from "@/lib/auth/guards";
import { isDatabaseConfigured } from "@/lib/db/config";
import { resolveDbUser } from "@/lib/db/users";
import {
  markAllNotificationsRead,
  markNotificationRead,
} from "@/lib/db/notifications";
import type { ActionResult, ErrorCode } from "@/lib/actions/result";

/**
 * Server actions for the in-app notification center (item 3). Every mutation is
 * scoped to the authenticated user's real db id (dev session ids never match db
 * rows, so we resolve it) — a user can only ever mark its OWN notifications.
 */

const markReadSchema = z.object({
  id: z.string().trim().min(1, "Identificador obrigatorio."),
});

function fail(error: ErrorCode, message: string): ActionResult<never> {
  return { ok: false, error, message };
}

/** Mark a single notification as read. Idempotent (already-read ⇒ updated 0). */
export async function markNotificationReadAction(
  input: z.infer<typeof markReadSchema>,
): Promise<ActionResult<{ updated: number }>> {
  if (!isDatabaseConfigured()) {
    return fail("NO_DATABASE", "Banco de dados nao configurado.");
  }
  const parsed = markReadSchema.safeParse(input);
  if (!parsed.success) {
    return fail("INVALID_INPUT", "Notificacao invalida.");
  }
  try {
    const user = await requireUser();
    const dbUser = await resolveDbUser(user);
    if (!dbUser) return fail("NOT_FOUND", "Usuario nao encontrado.");
    const updated = await markNotificationRead(dbUser.id, parsed.data.id);
    revalidatePath("/app/notificacoes");
    return { ok: true, data: { updated } };
  } catch (error) {
    console.error("[notifications] markNotificationReadAction failed", error);
    return fail("UNEXPECTED", "Erro inesperado.");
  }
}

/** Mark every unread notification of the current user as read. */
export async function markAllNotificationsReadAction(): Promise<
  ActionResult<{ updated: number }>
> {
  if (!isDatabaseConfigured()) {
    return fail("NO_DATABASE", "Banco de dados nao configurado.");
  }
  try {
    const user = await requireUser();
    const dbUser = await resolveDbUser(user);
    if (!dbUser) return fail("NOT_FOUND", "Usuario nao encontrado.");
    const updated = await markAllNotificationsRead(dbUser.id);
    revalidatePath("/app/notificacoes");
    return { ok: true, data: { updated } };
  } catch (error) {
    console.error("[notifications] markAllNotificationsReadAction failed", error);
    return fail("UNEXPECTED", "Erro inesperado.");
  }
}
