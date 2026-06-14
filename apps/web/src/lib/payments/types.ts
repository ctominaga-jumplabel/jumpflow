import type { ConsultantPaymentStatus } from "./state-machine";

export interface ConsultantPaymentLineView {
  id: string;
  projectName: string;
  description: string;
  hours: number;
  unitRate: number;
  amount: number;
}

export interface ConsultantPaymentView {
  id: string;
  consultantName: string;
  consultantEmail: string;
  contractType: "CLT" | "PJ" | "CLT_FLEX";
  month: number;
  year: number;
  status: ConsultantPaymentStatus;
  cltNetAmount: number;
  pjAmount: number;
  benefitAmount: number;
  totalAmount: number;
  expectedPaymentAt: string | null;
  confirmedPaidAt: string | null;
  invoiceReceivedAt: string | null;
  invoiceValidatedAt: string | null;
  lines: ConsultantPaymentLineView[];
}

export interface PaymentForecastView {
  id: string;
  consultantName: string;
  closingMonth: number;
  closingYear: number;
  responseDeadlineAt: string;
  expectedPaymentAt: string;
  linkedPayments: number;
}

export const consultantPaymentStatusLabels: Record<
  ConsultantPaymentStatus,
  string
> = {
  OPEN: "Aberto",
  WAITING_FOR_INVOICE: "Aguardando NF",
  INVOICE_RECEIVED: "NF recebida",
  INVOICE_VALIDATED: "NF validada",
  APPROVED_FOR_PAYMENT: "Aprovado p/ pagamento",
  SENT_TO_BANK: "Enviado ao banco",
  PROCESSED: "Processado",
  PAID: "Pago",
  CANCELLED: "Cancelado",
};
