import type { ActionResult } from "@/lib/actions/result";

/**
 * Shared NFS-e provider contract types (Fase H). Kept in a leaf module so both
 * the provider selector and concrete implementations import from here without
 * a cycle.
 */

export interface NfseIssueServiceLine {
  /** Codigo de servico (LC116/municipal). Defaults to the standard code. */
  serviceCode?: string;
  description: string;
  amount: number;
}

export interface NfseIssueRequest {
  fiscalDocumentId: string;
  revenueClosingId: string;
  clientId: string;
  /** Total services amount (back-compat / quick checks). */
  amount: number;
  tomador?: {
    document?: string | null;
    name: string;
    municipality?: string | null;
    email?: string | null;
  };
  lines?: NfseIssueServiceLine[];
  /** ISS rate as a 0-100 percentage. */
  issRate?: number;
  issWithheld?: boolean;
}

export interface NfseIssueResult {
  provider: "SAO_PAULO_NFSE";
  protocol?: string;
  invoiceNumber?: string;
  verificationCode?: string;
  /** The signed/sent RPS XML (caller stores it in the `nfse` bucket). */
  requestXml?: string;
  /** The raw response XML (caller stores it, when available). */
  responseXml?: string;
  /** Base64-encoded DANFSe PDF, when the response carried one. */
  pdfBase64?: string;
}

export interface NfseProvider {
  requestIssue(input: NfseIssueRequest): Promise<ActionResult<NfseIssueResult>>;
}
