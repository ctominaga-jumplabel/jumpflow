import type { NextAuthConfig } from "next-auth";
import MicrosoftEntraID from "next-auth/providers/microsoft-entra-id";
import { DEV_LOGOUT_COOKIE, isDevAuthEnabled } from "@/lib/auth/dev";
import { isRoleName } from "@/lib/auth/roles";
import { isDatabaseConfigured } from "@/lib/db/config";

/**
 * Edge-safe Auth.js configuration shared by the server runtime (`auth.ts`) and
 * the middleware. No database adapter and no Node-only imports here — only
 * `process.env` reads. The Credentials provider (Prisma + node:crypto) lives
 * EXCLUSIVELY in `auth.ts`; this file must stay importable from the edge proxy.
 */

/** Whether the Microsoft Entra ID provider has all required env vars. */
export function isEntraConfigured(): boolean {
  return Boolean(
    process.env.AUTH_MICROSOFT_ENTRA_ID_ID &&
      process.env.AUTH_MICROSOFT_ENTRA_ID_SECRET &&
      process.env.AUTH_MICROSOFT_ENTRA_ID_TENANT_ID,
  );
}

/**
 * Whether email/password (local Credentials provider) is available. Requires
 * the explicit `AUTH_CREDENTIALS_ENABLED` flag AND a configured database (the
 * provider reads `User`/`passwordHash`). Edge-safe: only reads env. Keeping
 * this here (not in `auth.ts`) lets the edge proxy and the login page share the
 * exact same gate without importing Node-only credentials code.
 */
export function isCredentialsEnabled(): boolean {
  return (
    process.env.AUTH_CREDENTIALS_ENABLED === "true" && isDatabaseConfigured()
  );
}

const providers = isEntraConfigured()
  ? [
      MicrosoftEntraID({
        clientId: process.env.AUTH_MICROSOFT_ENTRA_ID_ID!,
        clientSecret: process.env.AUTH_MICROSOFT_ENTRA_ID_SECRET!,
        issuer: `https://login.microsoftonline.com/${process.env.AUTH_MICROSOFT_ENTRA_ID_TENANT_ID}/v2.0`,
      }),
    ]
  : [];

export const authConfig = {
  trustHost: true,
  pages: {
    signIn: "/login",
  },
  providers,
  callbacks: {
    /**
     * Route protection for `/app/*`, evaluated in middleware.
     * Returning false triggers a redirect to `pages.signIn` (with callbackUrl).
     */
    authorized({ auth, request }) {
      const isOnApp = request.nextUrl.pathname.startsWith("/app");
      if (!isOnApp) return true;

      if (isDevAuthEnabled()) {
        return request.cookies.get(DEV_LOGOUT_COOKIE)?.value !== "1";
      }

      return Boolean(auth?.user);
    },
    /**
     * Role provisioning placeholder. Real roles (Entra app roles/groups or a
     * future DB lookup) will be attached here. Until then, roles stay empty for
     * real users — they authenticate but role-gated areas remain protected.
     */
    jwt({ token }) {
      if (!Array.isArray(token.roles)) {
        token.roles = [];
      }
      return token;
    },
    session({ session, token }) {
      if (session.user) {
        if (token.sub) session.user.id = token.sub;
        session.user.roles = Array.isArray(token.roles)
          ? token.roles.filter(isRoleName)
          : [];
      }
      return session;
    },
  },
} satisfies NextAuthConfig;
