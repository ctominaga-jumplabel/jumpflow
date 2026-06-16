/**
 * NFS-e digital signature hook (Fase H — XMLDSig with an A1 certificate).
 *
 * The Prefeitura de Sao Paulo requires the RPS / lote to be signed with an A1
 * (.pfx/.p12) digital certificate. That signing CANNOT happen offline in this
 * repo: there is no certificate and no library is wired. So this module exposes
 * a PLUGGABLE signer interface and a default implementation that DEGRADES
 * HONESTLY — it never fabricates a signature.
 *
 * The real signer (XMLDSig over the RPS, RSA-SHA1 + the cert chain) must be
 * provided by the integrations layer (`jump-integrations-agent`) and injected
 * via {@link setNfseSigner}. The certificate material lives ONLY in
 * NfseRuntimeConfig.certificate and must never be logged or persisted.
 */

import type { NfseRuntimeConfig } from "./config";

export interface NfseSignRequest {
  /** The unsigned RPS/lote XML produced by xml-builder. */
  xml: string;
  /** Certificate + prestador material. SECRET — never log this. */
  config: NfseRuntimeConfig;
}

export interface NfseSignResult {
  ok: boolean;
  /** Signed XML when ok; otherwise the original xml is left untouched. */
  xml: string;
  /** Reason when signing could not be performed (no cert library wired, etc.). */
  reason?: string;
}

export interface NfseSigner {
  sign(request: NfseSignRequest): Promise<NfseSignResult>;
}

/**
 * Default signer. There is NO offline-safe way to produce a valid A1 XMLDSig
 * signature here, so this implementation refuses honestly. When a real signer
 * is registered via {@link setNfseSigner}, it takes over.
 */
class UnavailableNfseSigner implements NfseSigner {
  async sign(request: NfseSignRequest): Promise<NfseSignResult> {
    return {
      ok: false,
      xml: request.xml,
      reason:
        "Assinatura digital A1 nao disponivel: registre um NfseSigner real " +
        "(XMLDSig com certificado A1) via setNfseSigner. Nenhuma assinatura " +
        "foi fabricada.",
    };
  }
}

let activeSigner: NfseSigner = new UnavailableNfseSigner();

/**
 * Register the real A1 signer (XMLDSig). Provided by the integrations layer at
 * boot when the certificate is available. Tests can also inject a fake.
 */
export function setNfseSigner(signer: NfseSigner): void {
  activeSigner = signer;
}

/** Reset to the honest default (used by tests). */
export function resetNfseSigner(): void {
  activeSigner = new UnavailableNfseSigner();
}

export function getNfseSigner(): NfseSigner {
  return activeSigner;
}
