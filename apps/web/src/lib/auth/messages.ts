/**
 * Auth UI constants/types shared between the login server actions and the
 * client login view. Kept OUT of `actions.ts` because a `"use server"` module
 * may only export async functions — a runtime const or an interface export
 * there breaks the Next build.
 */

/** Single generic credentials error (never leaks existence/state). */
export const CREDENTIALS_ERROR_MESSAGE = "E-mail ou senha inválidos.";

/** Return shape of `loginWithCredentials` (useActionState). */
export interface LoginCredentialsState {
  error?: string;
}
