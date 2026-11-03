/**
 * Janelas de envio da NF pelo consultor (SLA de Pagamento). PURO — usado pela
 * avaliacao do SLA, pela previa da tela de configuracao e pelo e-mail de
 * solicitacao de NF.
 *
 * Janela 1 (padrao) = configuracao ja existente: NF ate o prazo da etapa
 * INVOICE_RECEIPT => pagamento ate o prazo da etapa PAYMENT. As janelas
 * adicionais (SlaInvoiceTier) dizem "se enviar ate X, pagamento ate Y" para
 * quem perder a janela anterior. Ordenadas pelo prazo de recebimento.
 */
import {
  computeStageDeadline,
  isoDateInSaoPaulo,
  resolveDateRule,
  type BusinessCalendar,
  type Competence,
  type IsoDate,
} from "./business-days";
import type { SlaConfig } from "./types";

export interface InvoiceWindow {
  /** 1-based, na ordem do prazo de recebimento. */
  index: number;
  label: string;
  /** NF recebida ate esta data (inclusive)... */
  receiptDeadline: IsoDate;
  /** ...=> pagamento ate esta data. */
  paymentDate: IsoDate;
  /** Janela padrao (etapas INVOICE_RECEIPT/PAYMENT). */
  primary: boolean;
}

export const PRIMARY_INVOICE_WINDOW_LABEL = "Janela padrão";

export function buildInvoiceWindows(
  config: Pick<SlaConfig, "settings" | "stages" | "invoiceTiers">,
  competence: Competence,
  calendar: BusinessCalendar,
): InvoiceWindow[] {
  const receiptStage = config.stages.find(
    (s) => s.process === "HOURS_TO_PAYMENT" && s.stageKey === "INVOICE_RECEIPT",
  );
  const paymentStage = config.stages.find(
    (s) => s.process === "HOURS_TO_PAYMENT" && s.stageKey === "PAYMENT",
  );
  // Sem as etapas de envio/pagamento ativas nao ha SLA de NF a anunciar.
  if (!receiptStage?.active || !paymentStage?.active) return [];
  const windows: Omit<InvoiceWindow, "index">[] = [
    {
      label: PRIMARY_INVOICE_WINDOW_LABEL,
      receiptDeadline: computeStageDeadline(receiptStage, competence, config.settings, calendar),
      paymentDate: computeStageDeadline(paymentStage, competence, config.settings, calendar),
      primary: true,
    },
  ];
  for (const tier of config.invoiceTiers ?? []) {
    if (!tier.active) continue;
    windows.push({
      label: tier.label,
      receiptDeadline: resolveDateRule(tier.receipt, competence, calendar),
      paymentDate: resolveDateRule(tier.payment, competence, calendar),
      primary: false,
    });
  }
  return windows
    .sort(
      (a, b) =>
        a.receiptDeadline.localeCompare(b.receiptDeadline) ||
        Number(b.primary) - Number(a.primary),
    )
    .map((w, i) => ({ ...w, index: i + 1 }));
}

/** Primeira janela cujo prazo de recebimento cobre `receivedDay` (null = fora de todas). */
export function windowForReceipt(
  windows: readonly InvoiceWindow[],
  receivedDay: IsoDate,
): InvoiceWindow | null {
  return windows.find((w) => receivedDay <= w.receiptDeadline) ?? null;
}

/** Janela em que caiu uma NF recebida no instante ISO `receivedAt`. */
export function windowForReceivedAt(
  windows: readonly InvoiceWindow[],
  receivedAt: string,
): InvoiceWindow | null {
  return windowForReceipt(windows, isoDateInSaoPaulo(new Date(receivedAt)));
}

/**
 * Avisos de coerencia das janelas (nao bloqueantes): pagamento antes do
 * recebimento, ou janela posterior pagando antes da anterior.
 */
export function invoiceWindowWarnings(windows: readonly InvoiceWindow[]): string[] {
  const out: string[] = [];
  windows.forEach((w, i) => {
    if (w.paymentDate < w.receiptDeadline) {
      out.push(`"${w.label}": o pagamento vence antes do prazo de envio da NF.`);
    }
    const prev = windows[i - 1];
    if (prev && w.paymentDate < prev.paymentDate) {
      out.push(`"${w.label}": paga antes da janela anterior "${prev.label}".`);
    }
    if (prev && w.receiptDeadline === prev.receiptDeadline) {
      out.push(`"${w.label}" tem o mesmo prazo de envio de "${prev.label}".`);
    }
  });
  return out;
}
