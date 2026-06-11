// Next.js 16 "proxy" convention (successor to "middleware"), Edge runtime.
//
// CRITICAL (auth-foundation §11.1): the proxy must NEVER import Node-only code
// (Prisma, node:crypto, the hashing/credentials modules, nor `@/auth`). It
// builds its OWN Auth.js instance from the edge-safe `authConfig` alone, so the
// Credentials provider wired into `@/auth` stays out of the Edge bundle. Access
// is decided purely by the `authorized` callback (presence of a session);
// password verification only ever runs in the Node instance during signIn.
import NextAuth from "next-auth";
import { authConfig } from "@/auth.config";

// Own edge instance built from the edge-safe authConfig (NOT from `@/auth`,
// which wires the Node-only Credentials provider). Exported as the default
// proxy function — Next 16's proxy analyzer requires a default or named
// `proxy` FUNCTION export (a destructured `export const` is not recognized).
const { auth } = NextAuth(authConfig);

export default auth;

export const config = {
  matcher: ["/app/:path*"],
};
