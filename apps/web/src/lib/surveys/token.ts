import { createHash, randomBytes } from "node:crypto";

/**
 * Survey invitation token helpers (EP 7.1). Node-only (`node:crypto`): never
 * import from edge code (auth.config.ts / proxy.ts).
 *
 * Reuses the SAME hashing pattern as `lib/db/invitations.ts` (UserInvitation):
 * the plaintext token is generated once and only its sha256 digest is stored in
 * `SurveyInvitation.tokenHash`. We never persist nor log the raw token. The
 * token here is not surfaced to end users in the MVP (consultors reach their
 * own invitations through the authenticated `/app/clima` route), but we still
 * keep a real per-invitation digest so the model never carries a guessable or
 * shared secret and a future emailed-link flow can validate it.
 */

/** sha256 digest (hex) of the high-entropy plaintext token. */
export function hashSurveyToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

/** Generate a fresh plaintext token (>=256 bits) and its stored digest. */
export function generateSurveyToken(): { token: string; tokenHash: string } {
  const token = randomBytes(32).toString("base64url");
  return { token, tokenHash: hashSurveyToken(token) };
}
