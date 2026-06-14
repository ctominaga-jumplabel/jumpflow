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
  createPaymentForecast,
  generateConsultantPayments,
  sendConsultantPaymentForecast,
} from "@/lib/db/payments";
import { resolveDbUser } from "@/lib/db/users";
import {
  actionAllowedForContract,
  consultantPaymentTransitions,
  type ConsultantPaymentAction,
} from "@/lib/payments/state-machine";

const PAGAMENTOS_PATH = "/app/pagamentos";

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
    "REQUEST_INVOICE",
    "MARK_INVOICE_RECEIVED",
    "VALIDATE_INVOICE",
    "APPROVE_CLT_PAYMENT",
    "APPROVE_FOR_PAYMENT",
    "SEND_TO_BANK",
    "MARK_PROCESSED",
    "MARK_PAID",
    "CANCEL",
  ]),
});

const forecastInputSchema = z.object({
  paymentId: z.string().min(1),
  responseDeadlineAt: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  expectedPaymentAt: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
});

const createForecastInputSchema = z.object({
  month: z.number().int().min(1).max(12),
  year: z.number().int().min(2020).max(2100),
  responseDeadlineAt: z.string().min(16),
  expectedPaymentAt: z.string().min(16),
}).superRefine((value, ctx) => {
  const responseDeadlineAt = parseDateTime(value.responseDeadlineAt);
  const expectedPaymentAt = parseDateTime(value.expectedPaymentAt);
  if (
    Number.isNaN(responseDeadlineAt.getTime()) ||
    Number.isNaN(expectedPaymentAt.getTime())
  ) {
    ctx.addIssue({
      code: "custom",
      message: "Datas invalidas.",
      path: ["expectedPaymentAt"],
    });
    return;
  }
  if (responseDeadlineAt > expectedPaymentAt) {
    ctx.addIssue({
      code: "custom",
      message: "O prazo de retorno deve ser anterior ao pagamento previsto.",
      path: ["responseDeadlineAt"],
    });
  }
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
  console.error("[pagamentos] unexpected action error", error);
  return {
    ok: false,
    error: "UNEXPECTED",
    message: "Nao foi possivel concluir a acao.",
  };
}

function parseDate(value: string): Date {
  return new Date(`${value}T00:00:00.000Z`);
}

function parseDateTime(value: string): Date {
  return new Date(value);
}

export async function generateMonthlyConsultantPayments(input: {
  month: number;
  year: number;
}): Promise<ActionResult<{ generated: number; skippedExisting: number }>> {
  try {
    ensureDatabase();
    const user = await requireRole(FINANCIAL_ROLES);
    const parsed = parseInput(monthInputSchema, input);
    const dbUser = await resolveDbUser(user);
    const result = await generateConsultantPayments({
      ...parsed,
      audit: {
        actorUserId: dbUser?.id ?? null,
        entityId: `${parsed.year}-${String(parsed.month).padStart(2, "0")}`,
        action: "CONSULTANT_PAYMENTS_GENERATED",
      },
    });
    revalidatePath(PAGAMENTOS_PATH);
    return { ok: true, data: result };
  } catch (error) {
    return toFailure(error);
  }
}

export async function advanceConsultantPayment(input: {
  id: string;
  action: ConsultantPaymentAction;
}): Promise<ActionResult<{ id: string; status: string }>> {
  try {
    ensureDatabase();
    const user = await requireRole(FINANCIAL_ROLES);
    const parsed = parseInput(advanceInputSchema, input);
    const transition = consultantPaymentTransitions[parsed.action];
    const dbUser = await resolveDbUser(user);
    const payment = await prisma.consultantPayment.findUnique({
      where: { id: parsed.id },
      select: {
        id: true,
        status: true,
        contractType: true,
        totalAmount: true,
      },
    });
    if (!payment) {
      throw new ActionError("NOT_FOUND", "Pagamento nao encontrado.");
    }
    if (!actionAllowedForContract(parsed.action, payment.contractType)) {
      throw new ActionError(
        "INVALID_INPUT",
        "Acao indisponivel para o tipo de contrato deste consultor.",
      );
    }

    const now = new Date();
    const data: Prisma.ConsultantPaymentUpdateManyMutationInput = {
      status: transition.next,
    };
    if (parsed.action === "MARK_INVOICE_RECEIVED") data.invoiceReceivedAt = now;
    if (parsed.action === "VALIDATE_INVOICE") data.invoiceValidatedAt = now;
    if (
      parsed.action === "APPROVE_CLT_PAYMENT" ||
      parsed.action === "APPROVE_FOR_PAYMENT"
    ) {
      data.approvedAt = now;
    }
    if (parsed.action === "MARK_PAID") data.confirmedPaidAt = now;

    await prisma.$transaction(async (tx) => {
      const updated = await tx.consultantPayment.updateMany({
        where: { id: payment.id, status: transition.expected },
        data,
      });
      if (updated.count !== 1) {
        throw new ActionError(
          "ALREADY_DECIDED",
          "O pagamento nao esta no status esperado para esta acao.",
        );
      }
      await tx.auditEvent.create({
        data: buildAuditEventData({
          actorUserId: dbUser?.id ?? null,
          entityType: "ConsultantPayment",
          entityId: payment.id,
          action: transition.auditAction,
          before: { status: payment.status },
          after: {
            status: transition.next,
            totalAmount: Number(payment.totalAmount),
          },
        }),
      });
    });

    revalidatePath(PAGAMENTOS_PATH);
    return { ok: true, data: { id: payment.id, status: transition.next } };
  } catch (error) {
    return toFailure(error);
  }
}

export async function sendPaymentForecast(input: {
  paymentId: string;
  responseDeadlineAt: string;
  expectedPaymentAt: string;
}): Promise<ActionResult<{ id: string; provider: string }>> {
  try {
    ensureDatabase();
    const user = await requireRole(FINANCIAL_ROLES);
    const parsed = parseInput(forecastInputSchema, input);
    const dbUser = await resolveDbUser(user);
    const result = await sendConsultantPaymentForecast({
      paymentId: parsed.paymentId,
      responseDeadlineAt: parseDate(parsed.responseDeadlineAt),
      expectedPaymentAt: parseDate(parsed.expectedPaymentAt),
      actorUserId: dbUser?.id ?? null,
    });
    if (!result) {
      throw new ActionError("NOT_FOUND", "Pagamento nao encontrado.");
    }
    revalidatePath(PAGAMENTOS_PATH);
    return { ok: true, data: result };
  } catch (error) {
    return toFailure(error);
  }
}

export async function createMonthlyPaymentForecast(input: {
  month: number;
  year: number;
  responseDeadlineAt: string;
  expectedPaymentAt: string;
}): Promise<ActionResult<{ id: string; linkedPayments: number }>> {
  try {
    ensureDatabase();
    const user = await requireRole(FINANCIAL_ROLES);
    const parsed = parseInput(createForecastInputSchema, input);
    const dbUser = await resolveDbUser(user);
    const result = await createPaymentForecast({
      month: parsed.month,
      year: parsed.year,
      responseDeadlineAt: parseDateTime(parsed.responseDeadlineAt),
      expectedPaymentAt: parseDateTime(parsed.expectedPaymentAt),
      actorUserId: dbUser?.id ?? null,
    });
    revalidatePath(PAGAMENTOS_PATH);
    return { ok: true, data: result };
  } catch (error) {
    return toFailure(error);
  }
}
