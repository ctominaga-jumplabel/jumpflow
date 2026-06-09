// Next.js 16 "proxy" convention (successor to "middleware").
// Protects `/app/*` using the `authorized` callback in auth.config.
// Unauthenticated users are redirected to `/login` with a callbackUrl.
export { auth as proxy } from "@/auth";

export const config = {
  matcher: ["/app/:path*"],
};
