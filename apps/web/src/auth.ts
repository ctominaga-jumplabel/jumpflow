import NextAuth from "next-auth";
import { authConfig } from "./auth.config";

/**
 * Central Auth.js instance. Session strategy is JWT (no database adapter this
 * round). Exposes the helpers the rest of the app consumes.
 */
export const { handlers, auth, signIn, signOut } = NextAuth(authConfig);
