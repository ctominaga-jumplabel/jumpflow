"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { signIn, signOut } from "@/auth";
import { DEV_LOGOUT_COOKIE, isDevAuthEnabled } from "./dev";
import { safeAppPath } from "./redirects";

/** Start the Microsoft Entra ID OAuth flow (real provider). */
export async function loginWithEntra(callbackUrl: string) {
  // Revalidate inside the action — never trust the bound argument directly.
  await signIn("microsoft-entra-id", { redirectTo: safeAppPath(callbackUrl) });
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
