import type { ConsultantPaymentStatus } from "./state-machine";
import type { InvoiceAmountComparison } from "./invoice-validation";

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
  /** CNPJ da empresa (ConsultantCompanyInfo). Coluna da tabela (P18). */
  cnpj: string | null;
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
  /** Amount declared on the NF received from the consultant (melhoria #3). */
  invoiceAmount: number | null;
  /** How many NF files are attached to this payment (melhoria #3). */
  invoiceAttachmentCount: number;
  /**
   * Attached NF files (id + fileName), newest first (melhoria #3). Exposes the
   * REAL attachment ids so the UI can build the signed-URL download link
   * (`/api/pagamentos/nf?id=...`); the endpoint re-checks ownership. Empty when
   * nothing is attached.
   */
  invoiceAttachments: { id: string; fileName: string }[];
  /**
   * NF-vs-expected comparison (melhoria #4). `null` until an amount is declared.
   * A divergence only ALERTS the UI (badge); it never blocks approval.
   */
  invoiceDivergence: InvoiceAmountComparison | null;
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
