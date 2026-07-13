import { getEmailTransport } from "@/lib/automation/email-transport";
import { buildPaymentForecastEmail } from "@/lib/automation/email/templates";
import { resolveEventDelivery } from "@/lib/automation/notifications/event-delivery";

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

  // PAYMENT_FORECAST rule (/app/admin/notificacoes) can turn this off or add
  // recipients; the consultant is the EVENT_TARGET.
  const delivery = await resolveEventDelivery("PAYMENT_FORECAST", {
    targets: [{ email: input.consultantEmail, name: input.consultantName }],
  });
  if (delivery.skip || delivery.emails.length === 0) {
    return { id: "", provider: "skipped" };
  }

  return getEmailTransport().send({
    to: delivery.emails,
    subject: email.subject,
    text: email.text,
    html: email.html,
  });
}
