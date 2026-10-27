export type ConsultantPaymentStatus =
  | "OPEN"
  // DP/People liberou (migration 20261027115900). Gate obrigatório antes de
  // qualquer avanço (solicitar NF / aprovar CLT). Ver RELEASE_BY_PEOPLE.
  | "PEOPLE_RELEASED"
  | "WAITING_FOR_INVOICE"
  | "INVOICE_RECEIVED"
  | "INVOICE_VALIDATED"
  | "APPROVED_FOR_PAYMENT"
  | "SENT_TO_BANK"
  | "PROCESSED"
  | "PAID"
  | "CANCELLED";

export type ConsultantPaymentAction =
  | "RELEASE_BY_PEOPLE"
  | "REOPEN_RELEASE"
  | "REQUEST_INVOICE"
  | "MARK_INVOICE_RECEIVED"
  | "VALIDATE_INVOICE"
  | "APPROVE_CLT_PAYMENT"
  | "APPROVE_FOR_PAYMENT"
  | "SEND_TO_BANK"
  | "MARK_PROCESSED"
  | "MARK_PAID"
  | "CANCEL";

export interface ConsultantPaymentTransition {
  /**
   * Status de origem aceitos. A maioria das transições é linear (um único
   * status); REOPEN_RELEASE aceita mais de um. Use em `where: { status: { in } }`
   * para a atualização condicional (à prova de corrida).
   */
  expected: readonly ConsultantPaymentStatus[];
  next: ConsultantPaymentStatus;
  auditAction: string;
}

/**
 * Fluxo (governança Fluxo de Horas):
 *
 *   OPEN ("Aguardando DP")
 *     → RELEASE_BY_PEOPLE (DP/People)            → PEOPLE_RELEASED
 *     → REQUEST_INVOICE (Financeiro, e-mail NF)  → WAITING_FOR_INVOICE
 *     → NF recebida → NF validada → aprovado → banco → processado → pago
 *
 * CLT (folha) também precisa da liberação do DP: APPROVE_CLT_PAYMENT parte de
 * PEOPLE_RELEASED (sem e-mail de NF). REOPEN_RELEASE (só Financeiro) devolve
 * PEOPLE_RELEASED/WAITING_FOR_INVOICE para OPEN enquanto nenhuma NF chegou —
 * ver {@link canReopenPeopleRelease}.
 */
export const consultantPaymentTransitions: Record<
  ConsultantPaymentAction,
  ConsultantPaymentTransition
> = {
  RELEASE_BY_PEOPLE: {
    expected: ["OPEN"],
    next: "PEOPLE_RELEASED",
    auditAction: "CONSULTANT_PAYMENT_PEOPLE_RELEASED",
  },
  REOPEN_RELEASE: {
    expected: ["PEOPLE_RELEASED", "WAITING_FOR_INVOICE"],
    next: "OPEN",
    auditAction: "CONSULTANT_PAYMENT_RELEASE_REOPENED",
  },
  REQUEST_INVOICE: {
    expected: ["PEOPLE_RELEASED"],
    next: "WAITING_FOR_INVOICE",
    auditAction: "CONSULTANT_PAYMENT_INVOICE_REQUESTED",
  },
  MARK_INVOICE_RECEIVED: {
    // Manual (Financeiro) só depois do pedido de NF. A chegada da NF ANTES do
    // pedido (Liberado pelo DP) é tratada pelo upload do arquivo e pela
    // liberação/solicitação com NF já anexada — nunca por este atalho manual.
    expected: ["WAITING_FOR_INVOICE"],
    next: "INVOICE_RECEIVED",
    auditAction: "CONSULTANT_PAYMENT_INVOICE_RECEIVED",
  },
  VALIDATE_INVOICE: {
    expected: ["INVOICE_RECEIVED"],
    next: "INVOICE_VALIDATED",
    auditAction: "CONSULTANT_PAYMENT_INVOICE_VALIDATED",
  },
  APPROVE_CLT_PAYMENT: {
    expected: ["PEOPLE_RELEASED"],
    next: "APPROVED_FOR_PAYMENT",
    auditAction: "CONSULTANT_PAYMENT_APPROVED",
  },
  APPROVE_FOR_PAYMENT: {
    expected: ["INVOICE_VALIDATED"],
    next: "APPROVED_FOR_PAYMENT",
    auditAction: "CONSULTANT_PAYMENT_APPROVED",
  },
  SEND_TO_BANK: {
    expected: ["APPROVED_FOR_PAYMENT"],
    next: "SENT_TO_BANK",
    auditAction: "CONSULTANT_PAYMENT_SENT_TO_BANK",
  },
  MARK_PROCESSED: {
    expected: ["SENT_TO_BANK"],
    next: "PROCESSED",
    auditAction: "CONSULTANT_PAYMENT_PROCESSED",
  },
  MARK_PAID: {
    expected: ["PROCESSED"],
    next: "PAID",
    auditAction: "CONSULTANT_PAYMENT_PAID",
  },
  CANCEL: {
    expected: ["OPEN"],
    next: "CANCELLED",
    auditAction: "CONSULTANT_PAYMENT_CANCELLED",
  },
};

/** Whether `status` is an accepted origin for `action`. */
export function transitionAllowedFrom(
  action: ConsultantPaymentAction,
  status: ConsultantPaymentStatus,
): boolean {
  return consultantPaymentTransitions[action].expected.includes(status);
}

/**
 * Ações com server action PRÓPRIA (gate pela Matriz de Permissões, não por
 * FINANCIAL_ROLES): a liberação do DP, a reabertura (só Financeiro) e o pedido
 * de NF (Financeiro, dispara e-mail). O avanço genérico
 * (`advanceConsultantPayment`) as recusa.
 */
export const DEDICATED_PAYMENT_ACTIONS: readonly ConsultantPaymentAction[] = [
  "RELEASE_BY_PEOPLE",
  "REOPEN_RELEASE",
  "REQUEST_INVOICE",
];

/**
 * A liberação do DP só pode ser reaberta enquanto NENHUMA NF foi recebida:
 * status PEOPLE_RELEASED/WAITING_FOR_INVOICE e sem data de recebimento. A
 * partir de NF recebida a reversão não passa por este atalho.
 */
export function canReopenPeopleRelease(payment: {
  status: ConsultantPaymentStatus;
  invoiceReceivedAt: Date | string | null;
}): boolean {
  return (
    transitionAllowedFrom("REOPEN_RELEASE", payment.status) &&
    payment.invoiceReceivedAt == null
  );
}

/**
 * Status a partir dos quais o pagamento já foi LIBERADO pelo DP (ou além). Um
 * pagamento nesses status trava a reabertura do fechamento operacional: só a
 * etapa a jusante (Financeiro/DP) devolve — ver `reopenOperation`.
 */
export const PEOPLE_RELEASED_OR_BEYOND: readonly ConsultantPaymentStatus[] = [
  "PEOPLE_RELEASED",
  "WAITING_FOR_INVOICE",
  "INVOICE_RECEIVED",
  "INVOICE_VALIDATED",
  "APPROVED_FOR_PAYMENT",
  "SENT_TO_BANK",
  "PROCESSED",
  "PAID",
];

export function actionAllowedForContract(
  action: ConsultantPaymentAction,
  contractType: "CLT" | "PJ" | "CLT_FLEX",
): boolean {
  if (contractType === "CLT") {
    return ![
      "REQUEST_INVOICE",
      "MARK_INVOICE_RECEIVED",
      "VALIDATE_INVOICE",
      "APPROVE_FOR_PAYMENT",
    ].includes(action);
  }
  return action !== "APPROVE_CLT_PAYMENT";
}

/** Rótulos curtos das etapas do fluxo (stepper/legenda da tela). */
export const consultantPaymentFlowSteps: readonly {
  status: ConsultantPaymentStatus;
  label: string;
  /** Quem age nesta etapa (legenda). */
  owner: "DP" | "Financeiro" | "Consultor" | "Concluído";
}[] = [
  { status: "OPEN", label: "Aguardando DP", owner: "DP" },
  { status: "PEOPLE_RELEASED", label: "Liberado pelo DP", owner: "Financeiro" },
  { status: "WAITING_FOR_INVOICE", label: "Aguardando NF", owner: "Consultor" },
  { status: "INVOICE_RECEIVED", label: "NF recebida", owner: "Financeiro" },
  { status: "INVOICE_VALIDATED", label: "NF validada", owner: "Financeiro" },
  { status: "APPROVED_FOR_PAYMENT", label: "Aprovado", owner: "Financeiro" },
  { status: "SENT_TO_BANK", label: "No banco", owner: "Financeiro" },
  { status: "PAID", label: "Pago", owner: "Concluído" },
];
