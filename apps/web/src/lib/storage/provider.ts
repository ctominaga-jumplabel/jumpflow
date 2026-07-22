import { createSupabaseStorageProvider } from "./supabase-storage";

/**
 * Neutral object-storage contract (docs/despesas-persistencia.md section 2).
 *
 * The expense domain only knows this interface — no Supabase type leaks out.
 * Migrating providers (e.g. Render + S3-compatible) means writing a new
 * implementation of this contract, nothing else.
 */
export interface StorageProvider {
  /** Store `body` under `key`. Throws a typed error on HTTP failure. */
  upload(
    key: string,
    body: ArrayBuffer | Uint8Array,
    contentType: string,
  ): Promise<void>;
  /** Remove the object at `key`. Throws a typed error on HTTP failure. */
  delete(key: string): Promise<void>;
  /** Short-lived signed URL for `key`. Never persist the returned URL. */
  getSignedUrl(key: string, expiresInSeconds: number): Promise<string>;
}

/** Private bucket for expense receipts (created via devops, never public). */
export const EXPENSE_RECEIPTS_BUCKET = "expense-receipts";

/** Private bucket for client logos (created via devops, never public). */
export const CLIENT_LOGOS_BUCKET = "client-logos";

/** Private bucket for consultant documents (created via devops, never public). */
export const CONSULTANT_DOCUMENTS_BUCKET = "consultant-documents";

/** Private bucket for on-call ("sobreaviso") approval attachments. */
export const ONCALL_APPROVALS_BUCKET = "oncall-approvals";

/**
 * Private bucket for the OPTIONAL attachment that backs a NON-billable
 * justification (P9 / melhoria #9). Dedicated bucket — never mixed with the
 * time entry's own attachment (ONCALL_APPROVALS_BUCKET). Created via devops,
 * never public; the raw file is only reachable through a short-lived signed URL.
 */
export const BILLABLE_JUSTIFICATION_BUCKET = "billable-justifications";

/** Private bucket for feed post attachments (Melhoria #5). */
export const FEED_ATTACHMENTS_BUCKET = "feed-attachments";

/**
 * Private bucket for checkpoint / 1-on-1 voice recordings (Melhoria #4, F3).
 * Sensitive audio (conversa de carreira) — NEVER public; the raw audio is only
 * reachable through a short-lived signed URL gated by the checkpoint read scope.
 */
export const CHECKPOINT_AUDIO_BUCKET = "checkpoint-audio";

/**
 * Storage is configured only when BOTH envs are present. These envs do not
 * exist yet in any environment — callers must degrade honestly (NO_STORAGE),
 * never fake an upload.
 */
export function isStorageConfigured(): boolean {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  return (
    typeof url === "string" &&
    url.trim().length > 0 &&
    typeof key === "string" &&
    key.trim().length > 0
  );
}

/**
 * Resolve a configured provider for `bucket`, or null when storage is
 * unavailable. Defaults to the expense-receipts bucket so existing callers keep
 * working unchanged; pass a bucket constant to target another domain (e.g.
 * CLIENT_LOGOS_BUCKET).
 */
export function getStorageProvider(
  bucket: string = EXPENSE_RECEIPTS_BUCKET,
): StorageProvider | null {
  if (!isStorageConfigured()) return null;
  return createSupabaseStorageProvider({
    url: (process.env.SUPABASE_URL as string).trim().replace(/\/$/, ""),
    serviceRoleKey: (process.env.SUPABASE_SERVICE_ROLE_KEY as string).trim(),
    bucket,
  });
}

/** Convenience resolver for the client-logos bucket. */
export function getClientLogoStorageProvider(): StorageProvider | null {
  return getStorageProvider(CLIENT_LOGOS_BUCKET);
}

/** Convenience resolver for the consultant-documents bucket. */
export function getConsultantDocumentStorageProvider(): StorageProvider | null {
  return getStorageProvider(CONSULTANT_DOCUMENTS_BUCKET);
}

/** Convenience resolver for the on-call approvals bucket. */
export function getOnCallAttachmentStorageProvider(): StorageProvider | null {
  return getStorageProvider(ONCALL_APPROVALS_BUCKET);
}

/** Convenience resolver for the non-billable justification bucket (P9). */
export function getBillableJustificationStorageProvider(): StorageProvider | null {
  return getStorageProvider(BILLABLE_JUSTIFICATION_BUCKET);
}

/** Convenience resolver for the feed-attachments bucket. */
export function getFeedAttachmentStorageProvider(): StorageProvider | null {
  return getStorageProvider(FEED_ATTACHMENTS_BUCKET);
}

/** Convenience resolver for the checkpoint-audio bucket (Melhoria #4, F3). */
export function getCheckpointAudioStorageProvider(): StorageProvider | null {
  return getStorageProvider(CHECKPOINT_AUDIO_BUCKET);
}
