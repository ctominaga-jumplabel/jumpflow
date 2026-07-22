/**
 * Pure builder for the Pagamentos "Exportar Excel" file (P19).
 *
 * RBAC/scope are the CALLER's job (the route resolves the real user, applies
 * FINANCIAL_ROLES and the same filter as the screen, and audits the download).
 * This module only shapes already-authorized rows, so it is trivially unit
 * testable without a database.
 *
 * Business rules encoded here (documented so the fiscal/bank handoff is stable):
 *
 * - Only PJ and CLT_FLEX consultants reach this flow (CLT puro é folha e sai do
 *   fluxo de pagamentos — ver `listConsultantPaymentsForExport`). Both are paid
 *   against a CNPJ + a PJ bank account, so the document/PIX rules below are the
 *   same for the two.
 * - "CNPJ ou CPF": usa o CNPJ da empresa (ConsultantCompanyInfo.cnpj) quando
 *   houver; se ausente, cai para o CPF pessoal (ConsultantPersonalInfo.cpf).
 *   Vazio quando nenhum dos dois existe.
 * - "Chave PIX": usa o PIX da conta bancária kind=PJ (o CLT_FLEX fatura a parte
 *   PJ pela mesma conta PJ); fallback para a conta PRIMARY quando não houver PJ.
 * - "Projeto"/"Valor": UMA LINHA por linha de pagamento (abertura por projeto),
 *   para casar Valor↔Projeto. Um consultor pode aparecer em várias linhas
 *   (benefícios e remunerações pontuais não têm projeto e caem em "Beneficios").
 * - ESCOPO DO VALOR: este é o arquivo de pagamento por PIX, então cobre APENAS a
 *   parcela paga por PIX = linhas PJ (horas x rate) + benefícios + pontuais. Para
 *   CLT_FLEX, a parcela CLT (`cltNetAmount`) é FOLHA (payroll, fora do PIX) e NÃO
 *   entra aqui — logo a soma da coluna "Valor" de um CLT_FLEX é menor que o
 *   `totalAmount` mostrado na tela (que soma CLT + PJ). Para PJ puro, a soma
 *   reconcilia com o total.
 */

export type PaymentExportBankKind = "CLT" | "PJ" | "PRIMARY";

export interface PaymentExportBankAccount {
  kind: PaymentExportBankKind;
  pixKey: string | null;
}

export interface PaymentExportLine {
  projectName: string;
  amount: number;
}

export interface PaymentExportConsultant {
  consultantName: string;
  /** CNPJ da empresa (PJ). Preferido sobre o CPF. */
  cnpj: string | null;
  /** CPF pessoal — fallback quando não há CNPJ. */
  cpf: string | null;
  bankAccounts: PaymentExportBankAccount[];
  lines: PaymentExportLine[];
}

export interface PaymentExportRow {
  consultantName: string;
  /** CNPJ quando houver, senão CPF, senão string vazia. */
  documentNumber: string;
  amount: number;
  projectName: string;
  pixKey: string;
}

/** Documento a pagar: CNPJ primeiro, CPF como fallback. */
export function resolvePaymentDocument(consultant: {
  cnpj: string | null;
  cpf: string | null;
}): string {
  const cnpj = consultant.cnpj?.trim();
  if (cnpj) return cnpj;
  const cpf = consultant.cpf?.trim();
  return cpf ?? "";
}

/** PIX do pagamento: conta PJ primeiro, PRIMARY como fallback. */
export function resolvePaymentPixKey(
  accounts: ReadonlyArray<PaymentExportBankAccount>,
): string {
  const pj = accounts.find((account) => account.kind === "PJ" && account.pixKey);
  if (pj?.pixKey) return pj.pixKey.trim();
  const primary = accounts.find(
    (account) => account.kind === "PRIMARY" && account.pixKey,
  );
  return primary?.pixKey?.trim() ?? "";
}

/** Achata os pagamentos em uma linha por linha de pagamento (projeto). */
export function buildPaymentExportRows(
  consultants: ReadonlyArray<PaymentExportConsultant>,
): PaymentExportRow[] {
  const rows: PaymentExportRow[] = [];
  for (const consultant of consultants) {
    const documentNumber = resolvePaymentDocument(consultant);
    const pixKey = resolvePaymentPixKey(consultant.bankAccounts);
    for (const line of consultant.lines) {
      rows.push({
        consultantName: consultant.consultantName,
        documentNumber,
        amount: line.amount,
        projectName: line.projectName,
        pixKey,
      });
    }
  }
  return rows;
}
