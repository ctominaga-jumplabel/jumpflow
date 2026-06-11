import type { Metadata } from "next";
import { appConfig } from "@/config/app";
import { isCredentialsEnabled, isEntraConfigured } from "@/auth.config";
import { isDevAuthEnabled } from "@/lib/auth/dev";
import {
  devLogin,
  loginWithCredentials,
  loginWithEntra,
} from "@/lib/auth/actions";
import { safeAppPath } from "@/lib/auth/redirects";
import { LoginView, type LoginVariant } from "./login-view";

export const metadata: Metadata = { title: "Entrar" };

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{
    callbackUrl?: string | string[];
    activated?: string | string[];
  }>;
}) {
  const { callbackUrl, activated } = await searchParams;
  const cb = safeAppPath(callbackUrl);
  const justActivated = activated === "1";

  const dev = isDevAuthEnabled();
  const credentials = !dev && isCredentialsEnabled();
  const entra = !dev && isEntraConfigured();

  // Precedence (auth-foundation §11.7): dev > credentials > entra >
  // unconfigured. Credentials and Entra may coexist (both shown) outside dev.
  const variant: LoginVariant = dev
    ? "dev"
    : credentials
      ? "credentials"
      : entra
        ? "entra"
        : "unconfigured";

  return (
    <LoginView
      appName={appConfig.name}
      variant={variant}
      showEntra={entra}
      activated={justActivated}
      devAction={dev ? devLogin.bind(null, cb) : undefined}
      entraAction={entra ? loginWithEntra.bind(null, cb) : undefined}
      credentialsAction={
        credentials ? loginWithCredentials.bind(null, cb) : undefined
      }
    />
  );
}
