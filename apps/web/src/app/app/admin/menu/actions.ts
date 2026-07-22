"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import type { ActionResult } from "@/lib/actions/result";
import { requireRole } from "@/lib/auth/guards";
import { recordAuditEvent } from "@/lib/db/audit";
import { isDatabaseConfigured } from "@/lib/db/config";
import { resolveDbUser } from "@/lib/db/users";
import { primaryNavigation } from "@/lib/navigation";

/**
 * Server actions for the primary-menu ordering screen (`/app/admin/menu`, P28).
 * ADMIN-only; every change is audited. The order is GLOBAL (org-wide).
 */
const ROUTE = "/app/admin/menu";

/** Valid nav keys = the hrefs of the current primary catalog (anti-injection). */
function validKeys(): Set<string> {
  return new Set(primaryNavigation.map((item) => item.href));
}

const saveOrderSchema = z.object({
  // Ordered list of nav item keys (hrefs). Index = position.
  keys: z.array(z.string().min(1)).min(1),
});

export type SaveOrderInput = z.infer<typeof saveOrderSchema>;

export async function saveMenuOrder(
  input: SaveOrderInput,
): Promise<ActionResult<{ count: number }>> {
  const user = await requireRole(["ADMIN"]);
  if (!isDatabaseConfigured()) {
    return {
      ok: false,
      error: "NO_DATABASE",
      message: "Banco de dados não configurado.",
    };
  }

  const parsed = saveOrderSchema.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false,
      error: "INVALID_INPUT",
      message: parsed.error.issues[0]?.message ?? "Dados inválidos.",
    };
  }

  // Only accept keys that belong to the current catalog, de-duplicated while
  // preserving the submitted order. Unknown keys are dropped (never persisted).
  const allowed = validKeys();
  const seen = new Set<string>();
  const keys: string[] = [];
  for (const key of parsed.data.keys) {
    if (allowed.has(key) && !seen.has(key)) {
      seen.add(key);
      keys.push(key);
    }
  }

  if (keys.length === 0) {
    return { ok: false, error: "INVALID_INPUT", message: "Ordem inválida." };
  }

  try {
    const { saveNavigationOrder } = await import("@/lib/db/navigation-order");
    await saveNavigationOrder(keys);
    const actor = await resolveDbUser(user);
    await recordAuditEvent({
      actorUserId: actor?.id ?? null,
      entityType: "NavigationOrder",
      entityId: "GLOBAL",
      action: "NAVIGATION_ORDER_UPDATED",
      after: { keys },
    });
    revalidatePath(ROUTE);
    // The sidebar reads the order in the app layout, so refresh it everywhere.
    revalidatePath("/app", "layout");
    return { ok: true, data: { count: keys.length } };
  } catch (error) {
    console.error("[admin/menu] saveMenuOrder failed", error);
    return {
      ok: false,
      error: "UNEXPECTED",
      message: "Falha ao salvar a ordem do menu.",
    };
  }
}
