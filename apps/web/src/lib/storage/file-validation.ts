/**
 * Pure receipt-file validation helpers (docs/despesas-persistencia.md
 * section 3). No I/O, no storage imports — testable without network.
 *
 * The server is the validation authority; the client-side checks in
 * `ExpenseAttachmentField` are a pre-flight convenience only.
 */

export const MAX_RECEIPT_SIZE_BYTES = 10 * 1024 * 1024; // 10 MB

/** MIME whitelist and the extensions coherent with each type. */
const MIME_EXTENSIONS: Record<string, readonly string[]> = {
  "application/pdf": [".pdf"],
  "image/jpeg": [".jpg", ".jpeg"],
  "image/png": [".png"],
  "image/webp": [".webp"],
};

export const ACCEPTED_RECEIPT_MIME_TYPES = Object.keys(MIME_EXTENSIONS);

/** Image-only whitelist for client logos (no PDF). 2 MB cap. */
const LOGO_MIME_EXTENSIONS: Record<string, readonly string[]> = {
  "image/jpeg": [".jpg", ".jpeg"],
  "image/png": [".png"],
  "image/webp": [".webp"],
  "image/svg+xml": [".svg"],
};

export const ACCEPTED_LOGO_MIME_TYPES = Object.keys(LOGO_MIME_EXTENSIONS);

export const MAX_LOGO_SIZE_BYTES = 2 * 1024 * 1024; // 2 MB

/** Raster-only whitelist for a person's photo (no SVG — scripts). 2 MB cap. */
const PHOTO_MIME_EXTENSIONS: Record<string, readonly string[]> = {
  "image/jpeg": [".jpg", ".jpeg"],
  "image/png": [".png"],
  "image/webp": [".webp"],
};

export const ACCEPTED_PHOTO_MIME_TYPES = Object.keys(PHOTO_MIME_EXTENSIONS);

/**
 * Whitelist for feed post attachments (Melhoria #5): images + common documents.
 * 10 MB cap (same as receipts). SVG is excluded on purpose (it can carry
 * scripts) — feed images are raster only.
 */
const FEED_MIME_EXTENSIONS: Record<string, readonly string[]> = {
  "application/pdf": [".pdf"],
  "image/jpeg": [".jpg", ".jpeg"],
  "image/png": [".png"],
  "image/webp": [".webp"],
  "image/gif": [".gif"],
};

export const ACCEPTED_FEED_MIME_TYPES = Object.keys(FEED_MIME_EXTENSIONS);

export const MAX_FEED_ATTACHMENT_SIZE_BYTES = 10 * 1024 * 1024; // 10 MB

export interface ReceiptFileMeta {
  name: string;
  type: string;
  size: number;
}

export interface FileValidationFailure {
  code: "INVALID_FILE" | "FILE_TOO_LARGE";
  message: string;
}

/** Lowercased extension of `name` including the dot, or "" when absent. */
function extensionOf(name: string): string {
  const index = name.lastIndexOf(".");
  return index === -1 ? "" : name.slice(index).toLowerCase();
}

/**
 * Validate a receipt file's metadata. Returns null when valid, or a typed
 * failure: MIME/extension outside the whitelist (or incoherent with each
 * other) -> INVALID_FILE; empty or > 10 MB -> FILE_TOO_LARGE.
 */
export function validateReceiptFile(
  file: ReceiptFileMeta,
): FileValidationFailure | null {
  const allowedExtensions = MIME_EXTENSIONS[file.type];
  if (!allowedExtensions) {
    return {
      code: "INVALID_FILE",
      message: "Formato não aceito. Use PDF, JPG, PNG ou WEBP.",
    };
  }
  const extension = extensionOf(file.name);
  if (!allowedExtensions.includes(extension)) {
    return {
      code: "INVALID_FILE",
      message: "Extensão do arquivo não corresponde ao tipo enviado.",
    };
  }
  if (file.size <= 0) {
    return { code: "FILE_TOO_LARGE", message: "Arquivo vazio." };
  }
  if (file.size > MAX_RECEIPT_SIZE_BYTES) {
    return { code: "FILE_TOO_LARGE", message: "Arquivo acima de 10 MB." };
  }
  return null;
}

/**
 * Validate a client-logo file's metadata. Images only (JPG, PNG, WEBP, SVG),
 * max 2 MB. Same INVALID_FILE/FILE_TOO_LARGE typed-failure contract.
 */
export function validateLogoFile(
  file: ReceiptFileMeta,
): FileValidationFailure | null {
  const allowedExtensions = LOGO_MIME_EXTENSIONS[file.type];
  if (!allowedExtensions) {
    return {
      code: "INVALID_FILE",
      message: "Formato não aceito. Use JPG, PNG, WEBP ou SVG.",
    };
  }
  const extension = extensionOf(file.name);
  if (!allowedExtensions.includes(extension)) {
    return {
      code: "INVALID_FILE",
      message: "Extensão do arquivo não corresponde ao tipo enviado.",
    };
  }
  if (file.size <= 0) {
    return { code: "FILE_TOO_LARGE", message: "Arquivo vazio." };
  }
  if (file.size > MAX_LOGO_SIZE_BYTES) {
    return { code: "FILE_TOO_LARGE", message: "Arquivo acima de 2 MB." };
  }
  return null;
}

/**
 * Validate a consultant photo's metadata. Raster images only (JPG, PNG, WEBP —
 * no SVG), max 2 MB. Same INVALID_FILE/FILE_TOO_LARGE typed-failure contract.
 */
export function validatePhotoFile(
  file: ReceiptFileMeta,
): FileValidationFailure | null {
  const allowedExtensions = PHOTO_MIME_EXTENSIONS[file.type];
  if (!allowedExtensions) {
    return {
      code: "INVALID_FILE",
      message: "Formato não aceito. Use JPG, PNG ou WEBP.",
    };
  }
  const extension = extensionOf(file.name);
  if (!allowedExtensions.includes(extension)) {
    return {
      code: "INVALID_FILE",
      message: "Extensão do arquivo não corresponde ao tipo enviado.",
    };
  }
  if (file.size <= 0) {
    return { code: "FILE_TOO_LARGE", message: "Arquivo vazio." };
  }
  if (file.size > MAX_LOGO_SIZE_BYTES) {
    return { code: "FILE_TOO_LARGE", message: "Arquivo acima de 2 MB." };
  }
  return null;
}

/**
 * Validate a feed attachment's metadata. Images (JPG, PNG, WEBP, GIF) or PDF,
 * max 10 MB. Same INVALID_FILE/FILE_TOO_LARGE typed-failure contract.
 */
export function validateFeedAttachmentFile(
  file: ReceiptFileMeta,
): FileValidationFailure | null {
  const allowedExtensions = FEED_MIME_EXTENSIONS[file.type];
  if (!allowedExtensions) {
    return {
      code: "INVALID_FILE",
      message: "Formato não aceito. Use PDF, JPG, PNG, WEBP ou GIF.",
    };
  }
  const extension = extensionOf(file.name);
  if (!allowedExtensions.includes(extension)) {
    return {
      code: "INVALID_FILE",
      message: "Extensão do arquivo não corresponde ao tipo enviado.",
    };
  }
  if (file.size <= 0) {
    return { code: "FILE_TOO_LARGE", message: "Arquivo vazio." };
  }
  if (file.size > MAX_FEED_ATTACHMENT_SIZE_BYTES) {
    return { code: "FILE_TOO_LARGE", message: "Arquivo acima de 10 MB." };
  }
  return null;
}

/**
 * Sanitize a file name for storage keys: lowercase, pure ASCII (accents
 * stripped), spaces -> "-", only [a-z0-9._-], no ".."/path separators
 * (anti path traversal), max 100 chars, fallback "comprovante".
 */
export function safeFileName(name: string): string {
  let safe = name
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "") // strip combining accents
    .replace(/[^ -~]/g, "") // pure ASCII only
    .toLowerCase()
    .replace(/[\\/]+/g, "-") // path separators are never kept
    .replace(/\s+/g, "-")
    .replace(/[^a-z0-9._-]/g, "");
  while (safe.includes("..")) safe = safe.replace(/\.\./g, ".");
  safe = safe.replace(/^[.\-_]+/, "");
  if (safe.length > 100) safe = safe.slice(0, 100);
  return safe || "comprovante";
}

/** Compact UTC timestamp `yyyy-mm-ddThhmmssZ` (storage-key friendly). */
function compactUtcTimestamp(date: Date): string {
  const iso = date.toISOString(); // yyyy-mm-ddThh:mm:ss.sssZ
  return `${iso.slice(0, 10)}T${iso.slice(11, 13)}${iso.slice(14, 16)}${iso.slice(17, 19)}Z`;
}

/**
 * Storage key for an expense receipt: `expenses/{expenseId}/{timestamp}-{name}`.
 * The path NEVER contains CPF, consultant, client, project or any sensitive
 * data — only the expense cuid and the sanitized file name.
 */
export function buildStorageKey(
  expenseId: string,
  fileName: string,
  now: Date = new Date(),
): string {
  return `expenses/${expenseId}/${compactUtcTimestamp(now)}-${safeFileName(fileName)}`;
}

/**
 * Storage key for a consultant document:
 * `consultants/{consultantId}/{type}/{timestamp}-{name}`. The path NEVER
 * contains CPF, name or any sensitive data — only the consultant cuid, the
 * document type and the sanitized file name.
 */
export function buildConsultantDocumentKey(
  consultantId: string,
  type: string,
  fileName: string,
  now: Date = new Date(),
): string {
  return `consultants/${consultantId}/${type.toLowerCase()}/${compactUtcTimestamp(now)}-${safeFileName(fileName)}`;
}

/**
 * Storage key for a feed post attachment:
 * `feed/{postId}/{timestamp}-{name}`. The path carries no sensitive data —
 * only the post cuid and the sanitized file name.
 */
export function buildFeedAttachmentKey(
  postId: string,
  fileName: string,
  now: Date = new Date(),
): string {
  return `feed/${postId}/${compactUtcTimestamp(now)}-${safeFileName(fileName)}`;
}

/**
 * Storage key for a client logo: `client-logos/{clientId}/{timestamp}-{name}`.
 * For a brand-new client (no id yet) `clientId` is "temp"; the action re-keys
 * to the real id after the row is created. Path carries no sensitive data.
 */
export function buildClientLogoKey(
  clientId: string,
  fileName: string,
  now: Date = new Date(),
): string {
  return `client-logos/${clientId}/${compactUtcTimestamp(now)}-${safeFileName(fileName)}`;
}
