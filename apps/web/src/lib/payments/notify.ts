import { getEmailTransport } from "@/lib/automation/email-transport";
import { formatCurrency, formatDate } from "@/lib/format";

export interface PaymentForecastEmailInput {
  consultantName: string;
  consultantEmail: string;
  month: number;
  year: number;
  totalAmount: number;
  expectedPaymentAt: string;
  responseDeadlineAt: string;
}

export async function sendPaymentForecastEmail(input: PaymentForecastEmailInput) {
  return getEmailTransport().send({
    to: [input.consultantEmail],
    subject: `Previsao de pagamento - ${input.month}/${input.year}`,
    text: [
      `Ola, ${input.consultantName}.`,
      "",
      `Previsao de pagamento da competencia ${input.month}/${input.year}: ${formatCurrency(input.totalAmount)}.`,
      `Data prevista de pagamento: ${formatDate(input.expectedPaymentAt)}.`,
      `Prazo para retorno: ${formatDate(input.responseDeadlineAt)}.`,
      "",
      "Responda este email caso haja divergencia nos valores.",
    ].join("\n"),
  });
}
