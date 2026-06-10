import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth/current-user";
import { DEFAULT_APP_PATH } from "@/lib/auth/redirects";

// JumpFlow is an internal tool — `/` is not a public landing page.
// Send authenticated users straight to the app and everyone else to login.
export default async function Home() {
  // `/` is public (outside the proxy matcher), so resolve the user defensively:
  // if auth can't be evaluated (e.g. misconfigured env), fall back to login
  // rather than erroring on the entrypoint. `redirect()` throws internally to
  // perform the navigation, so it must stay outside the try/catch.
  let isAuthenticated = false;
  try {
    isAuthenticated = (await getCurrentUser()) !== null;
  } catch {
    isAuthenticated = false;
  }
  redirect(isAuthenticated ? DEFAULT_APP_PATH : "/login");
}
