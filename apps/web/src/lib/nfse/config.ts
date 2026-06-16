/**
 * NFS-e configuration + environment surface (Fase H — Sao Paulo NFS-e).
 *
 * Single source of truth for the prestador (Jump) data and the external
 * endpoint/certificate plug points. NOTHING here is hardcoded: every value
 * comes from env and is resolved lazily so local/homolog/prod stay distinct.
 *
 * Required envs for REAL issuance (none of these exist in the repo; the
 * provider degrades to disabled/manual until they are all present):
 *
 *   NFSE_SP_ENDPOINT          SOAP endpoint of the Prefeitura SP Web Service.
 *                             Use the HOMOLOGACAO URL in non-prod, the PRODUCAO
 *                             URL only in production. Never hardcode it.
 *   NFSE_PRESTADOR_CNPJ       Prestador (Jump) CNPJ, digits only.
 *   NFSE_PRESTADOR_IM         Prestador inscricao municipal (CCM), digits only.
 *   NFSE_CERT_PFX_BASE64      A1 digital certificate (.pfx/.p12) base64-encoded.
 *                             SECRET — never logged, never persisted.
 *   NFSE_CERT_PASSWORD        Password for the A1 certificate. SECRET.
 *
 * Optional:
 *   NFSE_AMBIENTE             "homologacao" (default) | "producao". Controls the
 *                             RPS environment flag sent to the Prefeitura.
 *   NFSE_SP_VERSAO            Schema/layout version sent in the envelope.
 */

export type NfseAmbiente = "homologacao" | "producao";

export interface NfsePrestadorConfig {
  cnpj: string;
  inscricaoMunicipal: string;
}

export interface NfseRuntimeConfig {
  endpoint: string;
  ambiente: NfseAmbiente;
  versao: string;
  prestador: NfsePrestadorConfig;
  /**
   * The A1 certificate material. Kept opaque (base64 + password) and isolated
   * so the signing implementation is the ONLY place that touches it. Never
   * include these in IntegrationEvent metadata, logs or thrown errors.
   */
  certificate: {
    pfxBase64: string;
    password: string;
  };
}

function readTrimmed(name: string): string | undefined {
  const value = process.env[name];
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

function readDigits(name: string): string | undefined {
  const value = readTrimmed(name);
  if (value == null) return undefined;
  const digits = value.replace(/\D/g, "");
  return digits.length > 0 ? digits : undefined;
}

/**
 * Resolve the ambiente from env. Defaults to "homologacao" so a misconfigured
 * environment can never silently talk to PRODUCAO.
 */
export function getNfseAmbiente(): NfseAmbiente {
  return readTrimmed("NFSE_AMBIENTE") === "producao"
    ? "producao"
    : "homologacao";
}

/**
 * The provider is "configured" only when EVERY credential + endpoint +
 * prestador field is present. Missing any one means we degrade to the disabled
 * provider (rascunho/manual) and NEVER fake an emission.
 *
 * Note: this checks presence only — it does not load/validate the certificate
 * (that happens in signing.ts behind the same gate).
 */
export function isNfseConfigured(): boolean {
  return getNfseRuntimeConfig() != null;
}

/**
 * Build the runtime config, or null when anything required is missing. Pure
 * read of env; no I/O, no certificate parsing.
 */
export function getNfseRuntimeConfig(): NfseRuntimeConfig | null {
  const endpoint = readTrimmed("NFSE_SP_ENDPOINT");
  const cnpj = readDigits("NFSE_PRESTADOR_CNPJ");
  const inscricaoMunicipal = readDigits("NFSE_PRESTADOR_IM");
  const pfxBase64 = readTrimmed("NFSE_CERT_PFX_BASE64");
  const password = readTrimmed("NFSE_CERT_PASSWORD");

  if (!endpoint || !cnpj || !inscricaoMunicipal || !pfxBase64 || !password) {
    return null;
  }

  return {
    endpoint,
    ambiente: getNfseAmbiente(),
    versao: readTrimmed("NFSE_SP_VERSAO") ?? "1.00",
    prestador: { cnpj, inscricaoMunicipal },
    certificate: { pfxBase64, password },
  };
}

/** Private bucket for NFS-e XML/PDF artifacts (created via devops, never public). */
export const NFSE_BUCKET = "nfse";
