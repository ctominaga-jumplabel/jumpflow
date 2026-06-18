"use server";

import { revalidatePath } from "next/cache";
import type { ActionResult } from "@/lib/actions/result";
import { requireRole } from "@/lib/auth/guards";
import { isDatabaseConfigured } from "@/lib/db/config";
import { runAutoApproval } from "@/lib/automation/auto-approval";

/**
 * Server actions for the auto-approval admin screen
 * (`/app/automacoes/aprovacao-automatica`).
 *
 * Every action is gated by `requireRole(["ADMIN","AREA_MANAGER"])` and returns
 * an ActionResult (never throws to the client). They mirror the route RBAC so
 * authorization is enforced on the server even if the UI is bypassed.
 */

const ROUTE = "/app/automacoes/aprovacao-automatica";
const ADMIN_ROLES = ["ADMIN", "AREA_MANAGER"] as const;

export interface RunSummary {
  processed: number;
  approved: number;
  pending: number;
  raced: number;
  skipped: boolean;
  reason?: "no-database" | "disabled";
}

/**
 * Run the auto-approval job on demand. Returns ONLY aggregate counters — never
 * entry-level or otherwise sensitive data. Idempotent: leans on the same
 * status-guarded transaction as the cron, so clicking twice is safe.
 */
export async function runAutoApprovalNow(): Promise<ActionResult<RunSummary>> {
  await requireRole([...ADMIN_ROLES]);

  if (!isDatabaseConfigured()) {
    return {
      ok: false,
      error: "NO_DATABASE",
      message: "Banco de dados não configurado.",
    };
  }

  try {
    const result = await runAutoApproval();
    return {
      ok: true,
      data: {
        processed: result.processed,
        approved: result.approved,
        pending: result.pending,
        raced: result.raced,
        skipped: result.skipped,
        reason: result.reason,
      },
    };
  } catch (error) {
    console.error("[auto-approval] manual run failed", error);
    return {
      ok: false,
      error: "UNEXPECTED",
      message: "Falha ao executar a aprovação automática.",
    };
  } finally {
    revalidatePath(ROUTE);
  }
}
