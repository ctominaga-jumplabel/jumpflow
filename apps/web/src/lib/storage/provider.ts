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
