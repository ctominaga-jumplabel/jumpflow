import type { ActionResult } from "@/lib/actions/result";

export interface BankPaymentRequest {
  paymentId: string;
  consultantId: string;
  amount: number;
}

export interface BankPaymentResult {
  provider: "BANK";
  protocol?: string;
}

export interface BankProvider {
  sendPayment(input: BankPaymentRequest): Promise<ActionResult<BankPaymentResult>>;
}

class DisabledBankProvider implements BankProvider {
  async sendPayment(): Promise<ActionResult<BankPaymentResult>> {
    return {
      ok: false,
      error: "INVALID_INPUT",
      message:
        "Provider bancario nao configurado. Use o envio manual e registre o status.",
    };
  }
}

const disabledProvider = new DisabledBankProvider();

export function getBankProvider(): BankProvider {
  return disabledProvider;
}
