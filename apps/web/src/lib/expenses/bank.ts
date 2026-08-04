/**
 * Resolve os dados bancários de pagamento de um reembolso para exibir ao
 * Financeiro. Puro (sem import de servidor) — testável sem banco e reutilizável
 * no cliente. Reaproveita as MESMAS regras do arquivo de pagamento por PIX
 * (`payment-export`): documento CNPJ→CPF e chave PIX PJ→PRIMARY, para que o que
 * o Financeiro vê na despesa case com o que sairá no pagamento.
 */
import {
  resolvePaymentDocument,
  resolvePaymentPixKey,
} from "@/lib/payments/payment-export";
import type { ExpenseBankInfo } from "./types";

export interface BankAccountSource {
  kind: "CLT" | "PJ" | "PRIMARY";
  bankName: string | null;
  bankCode: string | null;
  agency: string | null;
  accountNumber: string | null;
  accountDigit: string | null;
  pixKey: string | null;
}

/**
 * Conta a exibir/pagar: PJ primeiro (o CLT_FLEX fatura a parte PJ pela conta
 * PJ), depois PRIMARY, por fim a primeira conta ativa. Espelha a preferência de
 * `resolvePaymentPixKey`.
 */
export function pickPayoutAccount<T extends { kind: string }>(
  accounts: readonly T[],
): T | undefined {
  return (
    accounts.find((a) => a.kind === "PJ") ??
    accounts.find((a) => a.kind === "PRIMARY") ??
    accounts[0]
  );
}

/** "12345-6" a partir de número + dígito. Vazio sem número (dígito sozinho não conta). */
function formatAccount(account: BankAccountSource): string {
  const number = account.accountNumber?.trim();
  if (!number) return "";
  const digit = account.accountDigit?.trim();
  return digit ? `${number}-${digit}` : number;
}

/**
 * Monta o `ExpenseBankInfo` a partir das contas ativas do consultor e dos
 * documentos (CNPJ/CPF). Retorna `undefined` quando não há nada útil a mostrar,
 * para o chamador poder sinalizar "sem dados bancários" ao Financeiro.
 */
export function buildExpenseBankInfo(
  accounts: readonly BankAccountSource[],
  docs: { cnpj: string | null; cpf: string | null },
): ExpenseBankInfo | undefined {
  const account = pickPayoutAccount(accounts);
  // PIX: usa o da conta escolhida quando houver; senão cai na regra de
  // pagamento (PJ→PRIMARY), para nunca deixar o Financeiro sem chave.
  const pixKey = account?.pixKey?.trim() || resolvePaymentPixKey(accounts);
  const document = resolvePaymentDocument(docs);
  const accountLabel = account ? formatAccount(account) : "";

  const info: ExpenseBankInfo = {};
  if (account?.bankName?.trim()) info.bankName = account.bankName.trim();
  if (account?.agency?.trim()) info.agency = account.agency.trim();
  if (accountLabel) info.account = accountLabel;
  if (pixKey) info.pixKey = pixKey;
  if (document) info.document = document;

  // `accountKind` é só metadado — sozinho não vale exibir. Se nada exibível
  // sobrou, devolve undefined para o chamador sinalizar "sem dados bancários".
  if (Object.keys(info).length === 0) return undefined;
  if (account) info.accountKind = account.kind;
  return info;
}
