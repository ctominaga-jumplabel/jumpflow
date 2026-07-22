/**
 * Shared server-action result contract (Horas + Despesas).
 *
 * Single error vocabulary so the UI can map codes to honest messages without
 * caring which module produced them. Pure types only — safe to import from
 * client components, schemas and tests.
 */

export type ErrorCode =
  | "NO_DATABASE"
  | "NO_CONSULTANT"
  | "INVALID_INPUT"
  | "NOT_FOUND"
  | "FORBIDDEN"
  | "NO_ACTIVE_ALLOCATION"
  | "PROJECT_CLOSED"
  | "NOT_EDITABLE"
  | "DUPLICATE_ENTRY"
  | "PERIOD_CLOSED"
  | "NOTHING_TO_SUBMIT"
  | "ALREADY_DECIDED"
  | "COMMENT_REQUIRED"
  | "NO_STORAGE"
  // Fase G (pre-fatura): degrade honesto de e-mail ao cliente.
  | "NO_EMAIL"
  | "NO_CONTACT_EMAIL"
  | "INVALID_FILE"
  | "FILE_TOO_LARGE"
  | "ATTACHMENT_LOCKED"
  | "SELF_APPROVAL"
  // Politica de Reembolso (Onda 3): lancamento viola prazo/teto configurado.
  | "POLICY_VIOLATION"
  // Fluxo de ausência (Onda D): saldo de férias, conflito com dia útil e
  // guarda de lançamento em data coberta por ausência confirmada.
  | "INSUFFICIENT_BALANCE"
  | "WORKDAY_CONFLICT"
  | "TIME_OFF_CONFLICT"
  // Access management (Round 5): invitations + roles/status.
  | "LAST_ADMIN"
  | "ALREADY_HAS_ACCESS"
  | "INVITE_INVALID"
  | "WEAK_PASSWORD"
  // Permission matrix (RBAC configurável): catálogo, grupos e matriz.
  | "LAST_ADMIN_PERMISSION"
  | "CONFIRM_REQUIRED"
  | "SYSTEM_ROLE_PROTECTED"
  | "DUPLICATE_CODE"
  | "UNEXPECTED";

/** Uniform result of every server action (actions never throw to the client). */
export type ActionResult<T> =
  | { ok: true; data: T }
  | { ok: false; error: ErrorCode; message: string };
