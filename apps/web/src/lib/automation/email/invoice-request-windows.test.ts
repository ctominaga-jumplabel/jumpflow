import { describe, expect, it } from "vitest";
import { buildConsultantInvoiceRequestEmail, invoicePaymentWindowsBlock } from "./templates";
import { consultantInvoiceRequestTemplateVars } from "./template-vars";

const windows = [
  { label: "Janela padrão", receiptDeadline: "2026-11-12", paymentDate: "2026-11-16" },
  { label: "Janela 2", receiptDeadline: "2026-11-25", paymentDate: "2026-11-30" },
];

describe("SLAs de pagamento no e-mail de solicitação de NF (item 4)", () => {
  it("tabela de janelas com datas e dia da semana", () => {
    const block = invoicePaymentWindowsBlock(windows)!;
    expect(block.text).toContain("12/11/2026 (quinta)");
    expect(block.text).toContain("30/11/2026 (segunda)");
    expect(block.text).toContain("depende da data em que recebermos");
    expect(invoicePaymentWindowsBlock([])).toBeNull();
  });
  it("builder padrão inclui as janelas e o aviso de resposta com anexo", () => {
    const email = buildConsultantInvoiceRequestEmail({
      consultantName: "Ana",
      month: 10,
      year: 2026,
      expectedAmount: 1000,
      paymentWindows: windows,
      acceptsReplyAttachment: true,
    });
    expect(email.text).toContain("25/11/2026");
    expect(email.text).toContain("responder a este e-mail com a NF anexada");
    const without = buildConsultantInvoiceRequestEmail({ consultantName: "Ana", month: 10, year: 2026, expectedAmount: 1000 });
    expect(without.text).not.toContain("Pagamento até");
    expect(without.text).not.toContain("responder a este e-mail com a NF");
  });
  it("variáveis do template personalizado", () => {
    const vars = consultantInvoiceRequestTemplateVars({
      consultantName: "Ana",
      month: 10,
      year: 2026,
      expectedAmount: 1000,
      paymentWindows: windows,
    });
    expect(vars["nf.prazo"]).toBe("12/11/2026");
    expect(vars["pagamento.data"]).toBe("16/11/2026");
    expect(vars.tabela_prazos_nf).not.toBeNull();
    expect(vars.resposta_email).toBeNull();
  });
});
