"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { AuthError } from "next-auth";
import { signIn, signOut } from "@/auth";
import { DEV_LOGOUT_COOKIE, isDevAuthEnabled } from "./dev";
import { safeAppPath } from "./redirects";
import {
  CREDENTIALS_ERROR_MESSAGE,
  type LoginCredentialsState,
} from "./messages";

/** Start the Microsoft Entra ID OAuth flow (real provider). */
export async function loginWithEntra(callbackUrl: string) {
  // Revalidate inside the action — never trust the bound argument directly.
  await signIn("microsoft-entra-id", { redirectTo: safeAppPath(callbackUrl) });
}

/** Generic message — never reveals whether the email exists or is inactive. */
/**
 * Email/password sign-in (Credentials provider). On success `signIn` throws an
 * internal NEXT_REDIRECT to land on the safe callbackUrl — that must be
 * re-thrown, never swallowed. Any AuthError (invalid credentials, inactive
 * account, etc.) maps to ONE generic message: existence/state must not leak.
 */
export async function loginWithCredentials(
  callbackUrl: string,
  _prevState: LoginCredentialsState,
  formData: FormData,
): Promise<LoginCredentialsState> {
  const email = String(formData.get("email") ?? "");
  const password = String(formData.get("password") ?? "");

  try {
    // Revalidate the redirect target inside the action (no open redirects).
    await signIn("credentials", {
      email,
      password,
      redirectTo: safeAppPath(callbackUrl),
    });
    // Unreachable on success: signIn redirects (throws NEXT_REDIRECT).
    return {};
  } catch (error) {
    // The redirect "error" must propagate so the navigation happens.
    if (isRedirectError(error)) throw error;
    if (error instanceof AuthError) {
      return { error: CREDENTIALS_ERROR_MESSAGE };
    }
    throw error;
  }
}

/** Next.js signals redirects by throwing an Error with this digest prefix. */
function isRedirectError(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "digest" in error &&
    typeof (error as { digest?: unknown }).digest === "string" &&
    (error as { digest: string }).digest.startsWith("NEXT_REDIRECT")
  );
}

/** Dev-mode entry: clear the logout marker and enter the app. */
export async function devLogin(callbackUrl: string) {
  const jar = await cookies();
  jar.delete(DEV_LOGOUT_COOKIE);
  // Revalidate inside the action to avoid open redirects via a forged POST.
  redirect(safeAppPath(callbackUrl));
}

/** Log out of both real and dev sessions. */
export async function logout() {
  if (isDevAuthEnabled()) {
    const jar = await cookies();
    jar.set(DEV_LOGOUT_COOKIE, "1", {
      path: "/",
      httpOnly: true,
      sameSite: "lax",
    });
    redirect("/login");
  }
  await signOut({ redirectTo: "/login" });
}
