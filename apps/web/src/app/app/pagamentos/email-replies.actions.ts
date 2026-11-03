"use server";

import type { ActionResult } from "@/lib/actions/result";
import { requirePermission, requireRole } from "@/lib/auth/guards";
import { PAYMENTS_ROUTE_ROLES } from "@/lib/auth/route-permissions";
import { FLOW_PERMISSION_CODES } from "@/lib/auth/permission-codes";
import { isDatabaseConfigured } from "@/lib/db/config";
import { listPaymentEmailReplies } from "@/lib/db/payments";
import type { PaymentEmailReplyView } from "@/lib/payments/types";

/**
 * Respostas do consultor ao e-mail de solicitação de NF (Resend Inbound) de um
 * pagamento: corpo, remetente, encaminhamento e as NFs registradas a partir
 * delas. Gate: PAGAMENTOS_RESPOSTAS_EMAIL view (seed ADMIN + FINANCE). O
 * download das NFs segue em /api/pagamentos/nf (que revalida o escopo).
 */
export async function getPaymentEmailRepliesAction(
  input: unknown,
): Promise<ActionResult<PaymentEmailReplyView[]>> {
  // Mesmo escopo da tela de Pagamentos + a sub-permissão da Matriz.
  await requireRole(PAYMENTS_ROUTE_ROLES);
  await requirePermission(FLOW_PERMISSION_CODES.paymentEmailReplies, "view");
  if (!isDatabaseConfigured()) {
    return { ok: false, error: "NO_DATABASE", message: "Banco de dados não configurado." };
  }
  const paymentId =
    typeof input === "object" && input !== null ? (input as { paymentId?: unknown }).paymentId : null;
  if (typeof paymentId !== "string" || paymentId.length === 0) {
    return { ok: false, error: "INVALID_INPUT", message: "Pagamento inválido." };
  }
  try {
    const replies = await listPaymentEmailReplies(paymentId);
    if (!replies) return { ok: false, error: "NOT_FOUND", message: "Pagamento não encontrado." };
    return { ok: true, data: replies };
  } catch (error) {
    console.error("[pagamentos] list email replies failed", error);
    return { ok: false, error: "UNEXPECTED", message: "Não foi possível carregar as respostas." };
  }
}
