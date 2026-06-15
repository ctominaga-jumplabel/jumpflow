import type { ActionResult } from "@/lib/actions/result";

export interface NfseIssueRequest {
  fiscalDocumentId: string;
  revenueClosingId: string;
  clientId: string;
  amount: number;
}

export interface NfseIssueResult {
  provider: "SAO_PAULO_NFSE";
  protocol?: string;
}

export interface NfseProvider {
  requestIssue(input: NfseIssueRequest): Promise<ActionResult<NfseIssueResult>>;
}

class DisabledNfseProvider implements NfseProvider {
  async requestIssue(): Promise<ActionResult<NfseIssueResult>> {
    return {
      ok: false,
      error: "INVALID_INPUT",
      message:
        "Provider NFS-e nao configurado. O documento fiscal pode ficar em rascunho para emissao manual.",
    };
  }
}

const disabledProvider = new DisabledNfseProvider();

export function getNfseProvider(): NfseProvider {
  return disabledProvider;
}
