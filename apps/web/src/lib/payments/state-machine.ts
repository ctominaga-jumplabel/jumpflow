export type ConsultantPaymentStatus =
  | "OPEN"
  | "WAITING_FOR_INVOICE"
  | "INVOICE_RECEIVED"
  | "INVOICE_VALIDATED"
  | "APPROVED_FOR_PAYMENT"
  | "SENT_TO_BANK"
  | "PROCESSED"
  | "PAID"
  | "CANCELLED";

export type ConsultantPaymentAction =
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
  expected: ConsultantPaymentStatus;
  next: ConsultantPaymentStatus;
  auditAction: string;
}

export const consultantPaymentTransitions: Record<
  ConsultantPaymentAction,
  ConsultantPaymentTransition
> = {
  REQUEST_INVOICE: {
    expected: "OPEN",
    next: "WAITING_FOR_INVOICE",
    auditAction: "CONSULTANT_PAYMENT_INVOICE_REQUESTED",
  },
  MARK_INVOICE_RECEIVED: {
    expected: "WAITING_FOR_INVOICE",
    next: "INVOICE_RECEIVED",
    auditAction: "CONSULTANT_PAYMENT_INVOICE_RECEIVED",
  },
  VALIDATE_INVOICE: {
    expected: "INVOICE_RECEIVED",
    next: "INVOICE_VALIDATED",
    auditAction: "CONSULTANT_PAYMENT_INVOICE_VALIDATED",
  },
  APPROVE_CLT_PAYMENT: {
    expected: "OPEN",
    next: "APPROVED_FOR_PAYMENT",
    auditAction: "CONSULTANT_PAYMENT_APPROVED",
  },
  APPROVE_FOR_PAYMENT: {
    expected: "INVOICE_VALIDATED",
    next: "APPROVED_FOR_PAYMENT",
    auditAction: "CONSULTANT_PAYMENT_APPROVED",
  },
  SEND_TO_BANK: {
    expected: "APPROVED_FOR_PAYMENT",
    next: "SENT_TO_BANK",
    auditAction: "CONSULTANT_PAYMENT_SENT_TO_BANK",
  },
  MARK_PROCESSED: {
    expected: "SENT_TO_BANK",
    next: "PROCESSED",
    auditAction: "CONSULTANT_PAYMENT_PROCESSED",
  },
  MARK_PAID: {
    expected: "PROCESSED",
    next: "PAID",
    auditAction: "CONSULTANT_PAYMENT_PAID",
  },
  CANCEL: {
    expected: "OPEN",
    next: "CANCELLED",
    auditAction: "CONSULTANT_PAYMENT_CANCELLED",
  },
};

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
