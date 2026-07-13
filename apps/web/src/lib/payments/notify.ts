import { getEmailTransport } from "@/lib/automation/email-transport";
import { buildPaymentForecastEmail } from "@/lib/automation/email/templates";

export interface PaymentForecastEmailProjectLine {
  projectName: string;
  hours: number;
  unitRate: number;
  amount: number;
}

export interface PaymentForecastEmailInput {
  consultantName: string;
  consultantEmail: string;
  month: number;
  year: number;
  totalAmount: number;
  expectedPaymentAt: string;
  responseDeadlineAt: string;
  /**
   * Per-project breakdown for contracts that have one (PJ and CLT FLEX).
   * For pure CLT (no project lines) leave empty/undefined so the email keeps
   * the simpler body without the breakdown table.
   */
  projectLines?: PaymentForecastEmailProjectLine[];
}

export async function sendPaymentForecastEmail(input: PaymentForecastEmailInput) {
  const email = buildPaymentForecastEmail({
    consultantName: input.consultantName,
    month: input.month,
    year: input.year,
    totalAmount: input.totalAmount,
    expectedPaymentAt: input.expectedPaymentAt,
    responseDeadlineAt: input.responseDeadlineAt,
    projectLines: input.projectLines,
  });

  return getEmailTransport().send({
    to: [input.consultantEmail],
    subject: email.subject,
    text: email.text,
    html: email.html,
  });
}
