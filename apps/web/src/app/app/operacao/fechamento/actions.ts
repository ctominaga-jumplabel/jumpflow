"use server";

import { revalidatePath } from "next/cache";
import { Prisma, prisma } from "@jumpflow/database";
import { z, type ZodType } from "zod";
import type { ActionResult, ErrorCode } from "@/lib/actions/result";
import { requirePermission } from "@/lib/auth/guards";
import { notifyOperationClosed } from "@/lib/automation/notifications/events";
import { buildAuditEventData } from "@/lib/db/audit";
import { isDatabaseConfigured } from "@/lib/db/config";
import { getOperationReadiness } from "@/lib/db/operation-closing";
import { resolveDbUser } from "@/lib/db/users";
import { pendingAlert } from "@/lib/operations/closing";
import { justificationSchema } from "@/lib/shared/justification";

const OPERACAO_PATH = "/app/operacao/fechamento";
const PERMISSION_CODE = "OPERACAO_FECHAMENTO";

class ActionError extends Error {
  constructor(
    readonly code: ErrorCode,
    message: string,
  ) {
    super(message);
  }
}

const targetInputSchema = z.object({
  projectId: z.string().min(1),
  month: z.number().int().min(1).max(12),
  year: z.number().int().min(2020).max(2100),
});

/**
 * Reabertura do fechamento operacional (P16): mudança sensível que desfaz um
 * fechamento já comunicado ao DP — exige justificativa obrigatória, registrada
 * em `notes` + AuditEvent.
 */
const reopenInputSchema = targetInputSchema.extend({
  // Opcional no schema para dar uma mensagem clara na action (a obrigatoriedade
  // é reforçada logo abaixo com justificationSchema).
  justification: z.string().trim().max(2000).optional(),
});

/** Append a timestamped, labeled line to OperationClosing.notes. */
function appendClosingNote(
  existing: string | null,
  label: string,
  text: string,
): string {
  const stamp = new Date().toISOString().slice(0, 10);
  const line = `[${label} ${stamp}] ${text}`;
  return existing && existing.trim().length > 0 ? `${existing}\n${line}` : line;
}

function ensureDatabase(): void {
  if (!isDatabaseConfigured()) {
    throw new ActionError("NO_DATABASE", "Banco de dados nao configurado.");
  }
}

function parseInput<T>(schema: ZodType<T>, input: unknown): T {
  const result = schema.safeParse(input);
  if (!result.success) {
    throw new ActionError("INVALID_INPUT", "Revise os dados informados.");
  }
  return result.data;
}

function toFailure(error: unknown): ActionResult<never> {
  if (
    typeof error === "object" &&
    error !== null &&
    "digest" in error &&
    typeof (error as { digest?: unknown }).digest === "string" &&
    (error as { digest: string }).digest.startsWith("NEXT_")
  ) {
    throw error;
  }
  if (error instanceof ActionError) {
    return { ok: false, error: error.code, message: error.message };
  }
  console.error("[operacao] unexpected action error", error);
  return {
    ok: false,
    error: "UNEXPECTED",
    message: "Nao foi possivel concluir a acao.",
  };
}

/**
 * Mark a project's month as operationally closed for the DP. BLOCKED on the
 * server unless every allocated consultant is APPROVED (we never trust the
 * client). On success: freezes the team snapshot, audits and notifies the DP.
 */
export async function closeOperation(input: {
  projectId: string;
  month: number;
  year: number;
}): Promise<ActionResult<{ id: string }>> {
  try {
    ensureDatabase();
    const user = await requirePermission(PERMISSION_CODE, "edit");
    const parsed = parseInput(targetInputSchema, input);
    const dbUser = await resolveDbUser(user);

    // Server-side gate: recompute readiness — closing requires all APPROVED.
    const readiness = await getOperationReadiness(
      parsed.projectId,
      parsed.month,
      parsed.year,
    );
    if (!readiness.canClose) {
      throw new ActionError(
        "INVALID_INPUT",
        `Não é possível fechar: ${pendingAlert(readiness)}.`,
      );
    }

    const snapshot = readiness.consultants.map((c) => ({
      consultantId: c.consultantId,
      name: c.consultantName,
      hours: c.hours,
      state: c.state,
    }));
    const now = new Date();

    const closing = await prisma.$transaction(async (tx) => {
      const record = await tx.operationClosing.upsert({
        where: {
          projectId_month_year: {
            projectId: parsed.projectId,
            month: parsed.month,
            year: parsed.year,
          },
        },
        create: {
          projectId: parsed.projectId,
          month: parsed.month,
          year: parsed.year,
          status: "CLOSED",
          closedByUserId: dbUser?.id ?? null,
          closedAt: now,
          notifiedAt: now,
          consultantsSnapshot: snapshot as Prisma.InputJsonValue,
        },
        update: {
          status: "CLOSED",
          closedByUserId: dbUser?.id ?? null,
          closedAt: now,
          reopenedByUserId: null,
          reopenedAt: null,
          notifiedAt: now,
          consultantsSnapshot: snapshot as Prisma.InputJsonValue,
        },
      });
      await tx.auditEvent.create({
        data: buildAuditEventData({
          actorUserId: dbUser?.id ?? null,
          entityType: "OperationClosing",
          entityId: record.id,
          action: "OPERATION_CLOSED",
          after: {
            projectId: parsed.projectId,
            month: parsed.month,
            year: parsed.year,
            consultants: snapshot.length,
            totalHours: readiness.totalHours,
          },
        }),
      });
      return record;
    });

    // Notify the DP (ROLE PEOPLE) — best-effort, never breaks the close.
    await notifyOperationClosed(closing.id);

    revalidatePath(OPERACAO_PATH);
    return { ok: true, data: { id: closing.id } };
  } catch (error) {
    return toFailure(error);
  }
}

/**
 * Reopen a previously closed month (e.g. a late correction). Audited; the DP is
 * not re-notified automatically. Optimistic: only flips a CLOSED record.
 */
export async function reopenOperation(input: {
  projectId: string;
  month: number;
  year: number;
  justification?: string;
}): Promise<ActionResult<{ id: string }>> {
  try {
    ensureDatabase();
    const user = await requirePermission(PERMISSION_CODE, "edit");
    const parsed = parseInput(reopenInputSchema, input);
    const dbUser = await resolveDbUser(user);
    const justificationResult = justificationSchema.safeParse(
      parsed.justification ?? "",
    );
    if (!justificationResult.success) {
      throw new ActionError(
        "INVALID_INPUT",
        "Informe uma justificativa para reabrir o fechamento operacional.",
      );
    }
    const justification = justificationResult.data;

    const existing = await prisma.operationClosing.findUnique({
      where: {
        projectId_month_year: {
          projectId: parsed.projectId,
          month: parsed.month,
          year: parsed.year,
        },
      },
      select: { id: true, status: true, notes: true },
    });
    if (!existing) {
      throw new ActionError("NOT_FOUND", "Fechamento não encontrado.");
    }

    await prisma.$transaction(async (tx) => {
      const updated = await tx.operationClosing.updateMany({
        where: { id: existing.id, status: "CLOSED" },
        data: {
          status: "OPEN",
          reopenedByUserId: dbUser?.id ?? null,
          reopenedAt: new Date(),
          notes: appendClosingNote(existing.notes, "Reabertura", justification),
        },
      });
      if (updated.count !== 1) {
        throw new ActionError(
          "ALREADY_DECIDED",
          "Este fechamento já não está fechado.",
        );
      }
      await tx.auditEvent.create({
        data: buildAuditEventData({
          actorUserId: dbUser?.id ?? null,
          entityType: "OperationClosing",
          entityId: existing.id,
          action: "OPERATION_REOPENED",
          before: { status: "CLOSED" },
          after: { status: "OPEN", justification },
        }),
      });
    });

    revalidatePath(OPERACAO_PATH);
    return { ok: true, data: { id: existing.id } };
  } catch (error) {
    return toFailure(error);
  }
}
