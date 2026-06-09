import type { Metadata } from "next";
import { appConfig } from "@/config/app";
import { isEntraConfigured } from "@/auth.config";
import { isDevAuthEnabled } from "@/lib/auth/dev";
import { devLogin, loginWithEntra } from "@/lib/auth/actions";
import { safeAppPath } from "@/lib/auth/redirects";
import { LoginView, type LoginVariant } from "./login-view";

export const metadata: Metadata = { title: "Entrar" };

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ callbackUrl?: string | string[] }>;
}) {
  const { callbackUrl } = await searchParams;
  const cb = safeAppPath(callbackUrl);

  const variant: LoginVariant = isDevAuthEnabled()
    ? "dev"
    : isEntraConfigured()
      ? "entra"
      : "unconfigured";

  const action =
    variant === "dev"
      ? devLogin.bind(null, cb)
      : variant === "entra"
        ? loginWithEntra.bind(null, cb)
        : undefined;

  return (
    <LoginView appName={appConfig.name} variant={variant} action={action} />
  );
}
