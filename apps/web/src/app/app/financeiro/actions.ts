"use server";

import { revalidatePath } from "next/cache";
import { Prisma, prisma } from "@jumpflow/database";
import { z, type ZodType } from "zod";
import type { ActionResult, ErrorCode } from "@/lib/actions/result";
import { requireRole } from "@/lib/auth/guards";
import { FINANCIAL_ROLES } from "@/lib/auth/route-permissions";
import { buildAuditEventData } from "@/lib/db/audit";
import { isDatabaseConfigured } from "@/lib/db/config";
import {
  generateRevenueClosings,
  revenueClosingTransitions,
  type RevenueClosingAdvanceAction,
} from "@/lib/db/revenue";
import { resolveDbUser } from "@/lib/db/users";
import { getNfseProvider } from "@/lib/nfse/provider";

const FINANCEIRO_PATH = "/app/financeiro";

class ActionError extends Error {
  constructor(
    readonly code: ErrorCode,
    message: string,
  ) {
    super(message);
  }
}

const monthInputSchema = z.object({
  month: z.number().int().min(1).max(12),
  year: z.number().int().min(2020).max(2100),
});

const advanceInputSchema = z.object({
  id: z.string().min(1),
  action: z.enum([
    "SUBMIT_REVIEW",
    "MARK_READY",
    "CLOSE",
    "MARK_INVOICED",
    "CANCEL",
  ]),
});

const closingIdInputSchema = z.object({
  closingId: z.string().min(1),
});

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
  if (
    error instanceof Prisma.PrismaClientKnownRequestError &&
    error.code === "P2002"
  ) {
    return {
      ok: false,
      error: "INVALID_INPUT",
      message: "Ja existe documento fiscal para esses dados.",
    };
  }
  console.error("[financeiro] unexpected action error", error);
  return {
    ok: false,
    error: "UNEXPECTED",
    message: "Nao foi possivel concluir a acao.",
  };
}

export async function generateMonthlyRevenueClosings(input: {
  month: number;
  year: number;
}): Promise<ActionResult<{ generated: number; skippedClosed: number }>> {
  try {
    ensureDatabase();
    const user = await requireRole(FINANCIAL_ROLES);
    const parsed = parseInput(monthInputSchema, input);
    const dbUser = await resolveDbUser(user);
    const result = await generateRevenueClosings({
      ...parsed,
      audit: {
        actorUserId: dbUser?.id ?? null,
        entityId: `${parsed.year}-${String(parsed.month).padStart(2, "0")}`,
        action: "REVENUE_CLOSINGS_GENERATED",
      },
    });
    revalidatePath(FINANCEIRO_PATH);
    return { ok: true, data: result };
  } catch (error) {
    return toFailure(error);
  }
}

export async function advanceRevenueClosing(input: {
  id: string;
  action: RevenueClosingAdvanceAction;
}): Promise<ActionResult<{ id: string; status: string }>> {
  try {
    ensureDatabase();
    const user = await requireRole(FINANCIAL_ROLES);
    const parsed = parseInput(advanceInputSchema, input);
    const transition = revenueClosingTransitions[parsed.action];
    const dbUser = await resolveDbUser(user);

    const closing = await prisma.revenueClosing.findUnique({
      where: { id: parsed.id },
      select: { id: true, status: true, totalAmount: true },
    });
    if (!closing) {
      throw new ActionError("NOT_FOUND", "Fechamento nao encontrado.");
    }
    if (parsed.action === "MARK_INVOICED") {
      const fiscalDocument = await prisma.fiscalDocument.findFirst({
        where: { revenueClosingId: parsed.id, status: "ISSUED" },
        select: { id: true },
      });
      if (!fiscalDocument) {
        throw new ActionError(
          "INVALID_INPUT",
          "Emita ou registre a NFS-e antes de marcar como faturado.",
        );
      }
    }

    await prisma.$transaction(async (tx) => {
      const updateData: Prisma.RevenueClosingUpdateManyMutationInput = {
        status: transition.next,
      };
      if (parsed.action === "CLOSE") {
        updateData.closedAt = new Date();
      }
      const updated = await tx.revenueClosing.updateMany({
        where: { id: parsed.id, status: transition.expected },
        data: updateData,
      });
      if (updated.count !== 1) {
        throw new ActionError(
          "ALREADY_DECIDED",
          "O fechamento nao esta no status esperado para esta acao.",
        );
      }
      await tx.auditEvent.create({
        data: buildAuditEventData({
          actorUserId: dbUser?.id ?? null,
          entityType: "RevenueClosing",
          entityId: parsed.id,
          action: transition.auditAction,
          before: { status: closing.status },
          after: { status: transition.next, totalAmount: Number(closing.totalAmount) },
        }),
      });
    });

    revalidatePath(FINANCEIRO_PATH);
    return { ok: true, data: { id: parsed.id, status: transition.next } };
  } catch (error) {
    return toFailure(error);
  }
}

export async function createFiscalDocumentDraft(input: {
  closingId: string;
}): Promise<ActionResult<{ id: string; status: string }>> {
  try {
    ensureDatabase();
    const user = await requireRole(FINANCIAL_ROLES);
    const parsed = parseInput(closingIdInputSchema, input);
    const dbUser = await resolveDbUser(user);

    const closing = await prisma.revenueClosing.findUnique({
      where: { id: parsed.closingId },
      select: { id: true, clientId: true, status: true, totalAmount: true },
    });
    if (!closing) {
      throw new ActionError("NOT_FOUND", "Fechamento nao encontrado.");
    }
    if (closing.status !== "CLOSED") {
      throw new ActionError(
        "INVALID_INPUT",
        "A NFS-e so pode ser preparada para fechamento fechado.",
      );
    }
    const existing = await prisma.fiscalDocument.findFirst({
      where: {
        revenueClosingId: closing.id,
        kind: "NFSE",
        status: { not: "CANCELLED" },
      },
      select: { id: true, status: true },
      orderBy: { createdAt: "desc" },
    });
    if (existing) {
      return {
        ok: true,
        data: { id: existing.id, status: existing.status },
      };
    }

    const document = await prisma.$transaction(async (tx) => {
      const fiscalDocument = await tx.fiscalDocument.create({
        data: {
          kind: "NFSE",
          status: "DRAFT",
          clientId: closing.clientId,
          revenueClosingId: closing.id,
          provider: "SAO_PAULO_NFSE",
        },
      });
      await tx.auditEvent.create({
        data: buildAuditEventData({
          actorUserId: dbUser?.id ?? null,
          entityType: "FiscalDocument",
          entityId: fiscalDocument.id,
          action: "FISCAL_DOCUMENT_DRAFT_CREATED",
          after: { revenueClosingId: closing.id, amount: Number(closing.totalAmount) },
        }),
      });
      return fiscalDocument;
    });

    revalidatePath(FINANCEIRO_PATH);
    return { ok: true, data: { id: document.id, status: document.status } };
  } catch (error) {
    return toFailure(error);
  }
}

export async function requestFiscalDocumentIssue(input: {
  closingId: string;
}): Promise<ActionResult<{ id: string; status: string }>> {
  try {
    ensureDatabase();
    const user = await requireRole(FINANCIAL_ROLES);
    const parsed = parseInput(closingIdInputSchema, input);
    const dbUser = await resolveDbUser(user);
    const document = await prisma.fiscalDocument.findFirst({
      where: { revenueClosingId: parsed.closingId },
      include: { revenueClosing: { select: { totalAmount: true, clientId: true } } },
      orderBy: { createdAt: "desc" },
    });
    if (!document || !document.revenueClosing) {
      throw new ActionError(
        "NOT_FOUND",
        "Crie um rascunho de NFS-e antes de solicitar emissao.",
      );
    }
    if (document.status !== "DRAFT" && document.status !== "FAILED") {
      throw new ActionError(
        "ALREADY_DECIDED",
        "Documento fiscal nao esta pronto para solicitacao.",
      );
    }

    const providerResult = await getNfseProvider().requestIssue({
      fiscalDocumentId: document.id,
      revenueClosingId: parsed.closingId,
      clientId: document.revenueClosing.clientId,
      amount: Number(document.revenueClosing.totalAmount),
    });
    if (!providerResult.ok) return providerResult;

    await prisma.$transaction(async (tx) => {
      await tx.fiscalDocument.update({
        where: { id: document.id },
        data: {
          status: "REQUESTED",
          protocol: providerResult.data.protocol ?? null,
          errorMessage: null,
        },
      });
      await tx.auditEvent.create({
        data: buildAuditEventData({
          actorUserId: dbUser?.id ?? null,
          entityType: "FiscalDocument",
          entityId: document.id,
          action: "FISCAL_DOCUMENT_ISSUE_REQUESTED",
          after: providerResult.data,
        }),
      });
    });
    revalidatePath(FINANCEIRO_PATH);
    return { ok: true, data: { id: document.id, status: "REQUESTED" } };
  } catch (error) {
    return toFailure(error);
  }
}
