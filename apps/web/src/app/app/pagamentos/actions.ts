"use server";

import { revalidatePath } from "next/cache";
import { Prisma, prisma } from "@jumpflow/database";
import { z, type ZodType } from "zod";
import type { ActionResult, ErrorCode } from "@/lib/actions/result";
import { requireRole, requireUser } from "@/lib/auth/guards";
import { FLOW_PERMISSION_CODES } from "@/lib/auth/permission-codes";
import { can } from "@/lib/auth/permissions";
import { FINANCIAL_ROLES } from "@/lib/auth/route-permissions";
import type { AppUser } from "@/lib/auth/types";
import { buildAuditEventData } from "@/lib/db/audit";
import { isDatabaseConfigured } from "@/lib/db/config";
import {
  createPaymentForecast,
  generateConsultantPayments,
  sendConsultantPaymentForecast,
  type GenerateConsultantPaymentsResult,
} from "@/lib/db/payments";
import {
  PaymentReleaseError,
  releasePaymentsByPeople,
  reopenPeopleRelease,
  requestConsultantInvoices,
  requestInvoiceForPayment,
  type InvoiceRequestOutcome,
  type PeopleReleaseResult,
  type RequestInvoicesResult,
} from "@/lib/db/payment-release";
import { resolveDbUser } from "@/lib/db/users";
import {
  actionAllowedForContract,
  consultantPaymentTransitions,
  DEDICATED_PAYMENT_ACTIONS,
  type ConsultantPaymentAction,
} from "@/lib/payments/state-machine";
import { justificationSchema } from "@/lib/shared/justification";
import { buildInvoiceComparison } from "@/lib/payments/invoice-validation";

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
  // RELEASE_BY_PEOPLE / REOPEN_RELEASE / REQUEST_INVOICE têm actions próprias
  // (gate pela Matriz) — não passam pelo avanço genérico.
  action: z.enum([
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
  if (error instanceof PaymentReleaseError) {
    return {
      ok: false,
      error: error.code === "NOT_FOUND" ? "NOT_FOUND" : "ALREADY_DECIDED",
      message: error.message,
    };
  }
  console.error("[pagamentos] unexpected action error", error);
  return {
    ok: false,
    error: "UNEXPECTED",
    message: "Nao foi possivel concluir a acao.",
  };
}

/**
 * Gate pela Matriz de Permissões (governança Fluxo de Horas). Exige sessão e
 * `edit` no código; senão FORBIDDEN (sem redirect — a tela mostra a mensagem).
 */
async function requireFlowPermission(
  code: string,
  message: string,
): Promise<AppUser> {
  const user = await requireUser();
  if (!(await can(code, "edit"))) {
    throw new ActionError("FORBIDDEN", message);
  }
  return user;
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
}): Promise<ActionResult<GenerateConsultantPaymentsResult>> {
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
    if (DEDICATED_PAYMENT_ACTIONS.includes(input.action)) {
      throw new ActionError(
        "INVALID_INPUT",
        "Use a acao dedicada (liberacao do DP, solicitacao de NF ou reabertura).",
      );
    }
    const parsed = parseInput(advanceInputSchema, input);
    const transition = consultantPaymentTransitions[parsed.action];
    const dbUser = await resolveDbUser(user);
    const payment = await prisma.consultantPayment.findUnique({
      where: { id: parsed.id },
      select: {
        id: true,
        status: true,
        contractType: true,
        pjAmount: true,
        totalAmount: true,
        invoiceAmount: true,
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

    // Melhoria #4: ao VALIDAR a NF, registramos a divergência de valor no
    // AuditEvent (quando houver). NÃO bloqueia — é decisão de produto alertar
    // mas permitir aprovar.
    const invoiceDivergence =
      parsed.action === "VALIDATE_INVOICE"
        ? buildInvoiceComparison({
            contractType: payment.contractType,
            pjAmount: Number(payment.pjAmount),
            totalAmount: Number(payment.totalAmount),
            invoiceAmount:
              payment.invoiceAmount == null ? null : Number(payment.invoiceAmount),
          })
        : null;

    await prisma.$transaction(async (tx) => {
      const updated = await tx.consultantPayment.updateMany({
        where: { id: payment.id, status: { in: [...transition.expected] } },
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
            ...(invoiceDivergence
              ? { invoiceDivergence }
              : {}),
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

const requestInvoiceInputSchema = z.object({
  paymentId: z.string().min(1),
});

const paymentIdsSchema = z.array(z.string().min(1)).max(500);

/**
 * Governança Fluxo de Horas: o Financeiro ENVIA a solicitação de NF de UM
 * pagamento — só depois da liberação do DP (Liberado pelo DP → Aguardando NF;
 * em Aguardando NF reenvia, idempotente). Gate: PAGAMENTOS_ENVIO_NF edit.
 */
export async function requestConsultantInvoice(input: {
  paymentId: string;
}): Promise<ActionResult<{ status: InvoiceRequestOutcome }>> {
  try {
    ensureDatabase();
    const user = await requireFlowPermission(
      FLOW_PERMISSION_CODES.paymentInvoiceRequest,
      "Somente o Financeiro pode enviar a solicitacao de NF.",
    );
    const parsed = parseInput(requestInvoiceInputSchema, input);
    const dbUser = await resolveDbUser(user);
    const result = await requestInvoiceForPayment({
      paymentId: parsed.paymentId,
      actorUserId: dbUser?.id ?? null,
    });
    if (result.status === "NOT_FOUND") {
      throw new ActionError("NOT_FOUND", "Pagamento nao encontrado.");
    }
    if (result.status === "NOT_RELEASED") {
      throw new ActionError(
        "INVALID_INPUT",
        "O DP ainda nao liberou este pagamento — a solicitacao de NF so sai depois da liberacao.",
      );
    }
    revalidatePath(PAGAMENTOS_PATH);
    return { ok: true, data: { status: result.status } };
  } catch (error) {
    return toFailure(error);
  }
}

/**
 * Massa: "Enviar solicitação de NF" do mês (ou dos selecionados). Só os
 * Liberados pelo DP; os demais são pulados e contados no retorno. Gate:
 * PAGAMENTOS_ENVIO_NF edit. Idempotente por pagamento.
 */
export async function requestMonthlyInvoices(input: {
  month: number;
  year: number;
  paymentIds?: string[];
}): Promise<ActionResult<RequestInvoicesResult>> {
  try {
    ensureDatabase();
    const user = await requireFlowPermission(
      FLOW_PERMISSION_CODES.paymentInvoiceRequest,
      "Somente o Financeiro pode enviar a solicitacao de NF.",
    );
    const parsed = parseInput(
      monthInputSchema.extend({ paymentIds: paymentIdsSchema.optional() }),
      input,
    );
    const dbUser = await resolveDbUser(user);
    const result = await requestConsultantInvoices({
      month: parsed.month,
      year: parsed.year,
      paymentIds: parsed.paymentIds,
      actorUserId: dbUser?.id ?? null,
    });
    revalidatePath(PAGAMENTOS_PATH);
    return { ok: true, data: result };
  } catch (error) {
    return toFailure(error);
  }
}

const peopleReleaseInputSchema = z.union([
  z.object({ paymentIds: paymentIdsSchema.min(1) }),
  monthInputSchema,
]);

/**
 * Governança Fluxo de Horas: o DP/People LIBERA o(s) pagamento(s) (Aguardando
 * DP → Liberado pelo DP). Aceita uma linha/seleção (`paymentIds`) ou a
 * competência inteira (`month`/`year`). Gate: PAGAMENTOS_LIBERACAO_DP edit.
 * Auditado por pagamento; UM e-mail agregado ao Financeiro por ação
 * (PAYMENT_RELEASED_BY_PEOPLE).
 */
export async function releaseConsultantPaymentByPeople(
  input: { paymentIds: string[] } | { month: number; year: number },
): Promise<ActionResult<PeopleReleaseResult>> {
  try {
    ensureDatabase();
    const user = await requireFlowPermission(
      FLOW_PERMISSION_CODES.paymentPeopleRelease,
      "Somente o DP/People pode liberar pagamentos.",
    );
    const parsed = parseInput(peopleReleaseInputSchema, input);
    const dbUser = await resolveDbUser(user);
    const result = await releasePaymentsByPeople({
      ...("paymentIds" in parsed
        ? { paymentIds: parsed.paymentIds }
        : { month: parsed.month, year: parsed.year }),
      actorUserId: dbUser?.id ?? null,
      actorName: user.name,
    });
    if ("paymentIds" in parsed && result.released === 0 && result.waitingOperationClosing > 0) {
      throw new ActionError(
        "INVALID_INPUT",
        `Aguardando fechamento operacional: o DP só libera depois que a Operação fechar o mês de ${result.waitingProjects.join(", ")}.`,
      );
    }
    if ("paymentIds" in parsed && result.released === 0) {
      throw new ActionError(
        result.notFound > 0 && result.skipped === 0 ? "NOT_FOUND" : "ALREADY_DECIDED",
        result.notFound > 0 && result.skipped === 0
          ? "Pagamento nao encontrado."
          : "Nenhum pagamento estava aguardando a liberacao do DP.",
      );
    }
    revalidatePath(PAGAMENTOS_PATH);
    return { ok: true, data: result };
  } catch (error) {
    return toFailure(error);
  }
}

const reopenReleaseInputSchema = z.object({
  paymentId: z.string().min(1),
  justification: z.string().trim().max(2000).optional(),
});

/**
 * Governança Fluxo de Horas: só o Financeiro REABRE a liberação do DP (Liberado
 * pelo DP / Aguardando NF → Aguardando DP), enquanto nenhuma NF foi recebida.
 * Gate: PAGAMENTOS_REABRIR_LIBERACAO edit. Justificativa obrigatória,
 * auditada; avisa o DP in-app.
 */
export async function reopenPaymentRelease(input: {
  paymentId: string;
  justification?: string;
}): Promise<ActionResult<{ id: string; status: string }>> {
  try {
    ensureDatabase();
    const user = await requireFlowPermission(
      FLOW_PERMISSION_CODES.paymentReopenRelease,
      "Somente o Financeiro pode reabrir a liberacao do DP.",
    );
    const parsed = parseInput(reopenReleaseInputSchema, input);
    const justification = justificationSchema.safeParse(
      parsed.justification ?? "",
    );
    if (!justification.success) {
      throw new ActionError(
        "INVALID_INPUT",
        "Informe uma justificativa para reabrir a liberacao.",
      );
    }
    const dbUser = await resolveDbUser(user);
    const result = await reopenPeopleRelease({
      paymentId: parsed.paymentId,
      justification: justification.data,
      actorUserId: dbUser?.id ?? null,
      actorName: user.name,
    });
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
