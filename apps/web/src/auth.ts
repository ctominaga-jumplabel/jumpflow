import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import { authConfig, isCredentialsEnabled } from "./auth.config";

/**
 * Central Auth.js instance (Node runtime). This is the ONLY place the
 * Credentials provider (Prisma + node:crypto hashing) is wired in — see
 * auth-foundation §11.1. `proxy.ts` builds its own edge instance from
 * `authConfig` and must never import this module.
 *
 * Session strategy is JWT (no database adapter this round). Roles are NOT
 * provisioned through the token: `getCurrentUser()` resolves authoritative RBAC
 * from the database (§11.2).
 */
export const { handlers, auth, signIn, signOut } = NextAuth({
  ...authConfig,
  providers: [
    // Entra (edge-safe) preserved exactly as configured in authConfig.
    ...authConfig.providers,
    // Local email/password, only when explicitly enabled with a database.
    ...(isCredentialsEnabled()
      ? [
          Credentials({
            name: "Credentials",
            credentials: {
              email: { label: "E-mail", type: "email" },
              password: { label: "Senha", type: "password" },
            },
            authorize: async (raw) => {
              // Node-only import kept inside authorize so it never leaks toward
              // the edge config surface.
              const { authorizeCredentials } = await import(
                "@/lib/auth/credentials"
              );
              return authorizeCredentials(raw);
            },
          }),
        ]
      : []),
  ],
});
