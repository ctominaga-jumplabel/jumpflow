"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@jumpflow/database";
import { z } from "zod";
import type { ActionResult } from "@/lib/actions/result";
import { requireRole } from "@/lib/auth/guards";
import { recordAuditEvent } from "@/lib/db/audit";
import { isDatabaseConfigured } from "@/lib/db/config";
import { resolveDbUser } from "@/lib/db/users";
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

const toggleExceptionSchema = z.object({
  exceptionId: z.string().min(1),
  active: z.boolean(),
});

export type ToggleExceptionInput = z.infer<typeof toggleExceptionSchema>;

/**
 * Activate or deactivate a single {@link AutoApprovalException}. A flipped
 * `active` flag changes which entries the engine auto-approves, so the change
 * is audited (AuditEvent) with the before/after state.
 */
export async function setExceptionActive(
  input: ToggleExceptionInput,
): Promise<ActionResult<{ id: string; active: boolean }>> {
  const user = await requireRole([...ADMIN_ROLES]);

  if (!isDatabaseConfigured()) {
    return {
      ok: false,
      error: "NO_DATABASE",
      message: "Banco de dados não configurado.",
    };
  }

  const parsed = toggleExceptionSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: "INVALID_INPUT", message: "Dados inválidos." };
  }

  const current = await prisma.autoApprovalException.findUnique({
    where: { id: parsed.data.exceptionId },
    select: { id: true, active: true, type: true, consultantId: true, projectId: true },
  });
  if (!current) {
    return { ok: false, error: "NOT_FOUND", message: "Exceção não encontrada." };
  }

  // No-op: nothing changed, so no write and no audit noise.
  if (current.active === parsed.data.active) {
    return { ok: true, data: { id: current.id, active: current.active } };
  }

  const updated = await prisma.autoApprovalException.update({
    where: { id: current.id },
    data: { active: parsed.data.active },
    select: { id: true, active: true },
  });

  const dbUser = await resolveDbUser(user);
  await recordAuditEvent({
    actorUserId: dbUser?.id ?? null,
    entityType: "AutoApprovalException",
    entityId: current.id,
    action: parsed.data.active
      ? "AUTO_APPROVAL_EXCEPTION_ACTIVATED"
      : "AUTO_APPROVAL_EXCEPTION_DEACTIVATED",
    before: { active: current.active },
    after: { active: updated.active },
  });

  revalidatePath(ROUTE);
  return { ok: true, data: updated };
}
