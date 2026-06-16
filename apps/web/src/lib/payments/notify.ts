import { getEmailTransport } from "@/lib/automation/email-transport";
import { formatCurrency, formatDate, formatHours } from "@/lib/format";

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

function buildProjectBreakdown(
  lines: PaymentForecastEmailProjectLine[],
): string[] {
  return [
    "Abertura por projeto:",
    ...lines.map(
      (line) =>
        `- ${line.projectName}: ${formatHours(line.hours)} x ${formatCurrency(line.unitRate)} = ${formatCurrency(line.amount)}`,
    ),
    "",
  ];
}

export async function sendPaymentForecastEmail(input: PaymentForecastEmailInput) {
  const projectLines = input.projectLines ?? [];
  const breakdown =
    projectLines.length > 0 ? buildProjectBreakdown(projectLines) : [];

  return getEmailTransport().send({
    to: [input.consultantEmail],
    subject: `Previsao de pagamento - ${input.month}/${input.year}`,
    text: [
      `Ola, ${input.consultantName}.`,
      "",
      `Previsao de pagamento da competencia ${input.month}/${input.year}: ${formatCurrency(input.totalAmount)}.`,
      "",
      ...breakdown,
      `Data prevista de pagamento: ${formatDate(input.expectedPaymentAt)}.`,
      `Prazo para retorno: ${formatDate(input.responseDeadlineAt)}.`,
      "",
      "Responda este email caso haja divergencia nos valores.",
    ].join("\n"),
  });
}
