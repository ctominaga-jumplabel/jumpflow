import type { StorageProvider } from "./provider";

/**
 * Supabase Storage implementation of the {@link StorageProvider} contract via
 * plain REST + native `fetch` — deliberately WITHOUT the npm SDK (same
 * motivation as ADR13: the contract already isolates callers, fetch avoids
 * bundle weight/CVE surface in serverless and keeps the code portable to
 * Render or any S3-compatible storage later).
 *
 * Security: the service role key is sent only as the Authorization header and
 * NEVER appears in thrown errors or logs.
 */

/** Typed storage failure. Carries the operation + HTTP status, never the token. */
export class StorageError extends Error {
  constructor(
    readonly operation: "upload" | "delete" | "sign",
    readonly status: number,
    detail?: string,
  ) {
    super(
      `Storage ${operation} failed with status ${status}${detail ? `: ${detail}` : ""}`,
    );
    this.name = "StorageError";
  }
}

export interface SupabaseStorageOptions {
  /** Project base URL, e.g. https://xyz.supabase.co (no trailing slash). */
  url: string;
  serviceRoleKey: string;
  bucket: string;
}

/** Encode a storage key per path segment (keys contain `/` separators). */
function encodeKey(key: string): string {
  return key.split("/").map(encodeURIComponent).join("/");
}

/** Read the response body for error context without ever throwing. */
async function safeBody(response: Response): Promise<string | undefined> {
  try {
    const text = await response.text();
    return text ? text.slice(0, 200) : undefined;
  } catch {
    return undefined;
  }
}

export function createSupabaseStorageProvider(
  options: SupabaseStorageOptions,
): StorageProvider {
  const { url, serviceRoleKey, bucket } = options;
  const authHeader = { Authorization: `Bearer ${serviceRoleKey}` };

  return {
    async upload(key, body, contentType) {
      const response = await fetch(
        `${url}/storage/v1/object/${bucket}/${encodeKey(key)}`,
        {
          method: "POST",
          headers: { ...authHeader, "content-type": contentType },
          body: body as BodyInit,
        },
      );
      if (!response.ok) {
        throw new StorageError("upload", response.status, await safeBody(response));
      }
    },

    async delete(key) {
      const response = await fetch(
        `${url}/storage/v1/object/${bucket}/${encodeKey(key)}`,
        { method: "DELETE", headers: authHeader },
      );
      if (!response.ok) {
        throw new StorageError("delete", response.status, await safeBody(response));
      }
    },

    async getSignedUrl(key, expiresInSeconds) {
      const response = await fetch(
        `${url}/storage/v1/object/sign/${bucket}/${encodeKey(key)}`,
        {
          method: "POST",
          headers: { ...authHeader, "content-type": "application/json" },
          body: JSON.stringify({ expiresIn: expiresInSeconds }),
        },
      );
      if (!response.ok) {
        throw new StorageError("sign", response.status, await safeBody(response));
      }
      const payload = (await response.json()) as {
        signedURL?: string;
        signedUrl?: string;
      };
      const signedPath = payload.signedURL ?? payload.signedUrl;
      if (!signedPath) {
        throw new StorageError("sign", response.status, "missing signed path");
      }
      // The API returns a relative signed path under /storage/v1.
      return `${url}/storage/v1${signedPath.startsWith("/") ? "" : "/"}${signedPath}`;
    },
  };
}
