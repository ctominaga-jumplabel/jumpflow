/**
 * Pure reference/key helpers for NFS-e persistence + idempotency (Fase H).
 * Deterministic: same fiscal document/competence -> same keys.
 */

import { NFSE_BUCKET } from "./config";

/**
 * Stable idempotency key for the IntegrationEvent of an issue attempt:
 * one logical emission per fiscal document + competence. A repeated request
 * collides on @@unique([provider, idempotencyKey]) and is treated as a retry,
 * never a second nota.
 */
export function nfseIdempotencyKey(input: {
  fiscalDocumentId: string;
  year: number;
  month: number;
}): string {
  const mm = String(input.month).padStart(2, "0");
  return `${input.fiscalDocumentId}:${input.year}-${mm}`;
}

/** Reference key for the issued-NFS-e e-mail log (idempotent per doc+competence). */
export function nfseEmailReferenceKey(input: {
  fiscalDocumentId: string;
  year: number;
  month: number;
}): string {
  return nfseIdempotencyKey(input);
}

export interface NfseStorageTarget {
  bucket: string;
  key: string;
}

/** Storage key for the request/response XML in the private `nfse` bucket. */
export function nfseXmlStorageKey(input: {
  fiscalDocumentId: string;
  year: number;
  month: number;
}): NfseStorageTarget {
  const mm = String(input.month).padStart(2, "0");
  return {
    bucket: NFSE_BUCKET,
    key: `${input.year}-${mm}/nfse-${input.fiscalDocumentId}.xml`,
  };
}

/** Storage key for the PDF (DANFSe), when the response carries one. */
export function nfsePdfStorageKey(input: {
  fiscalDocumentId: string;
  year: number;
  month: number;
}): NfseStorageTarget {
  const mm = String(input.month).padStart(2, "0");
  return {
    bucket: NFSE_BUCKET,
    key: `${input.year}-${mm}/nfse-${input.fiscalDocumentId}.pdf`,
  };
}
