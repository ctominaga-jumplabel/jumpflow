import { timingSafeEqual } from "node:crypto";

/**
 * Authorization for cron-triggered job endpoints.
 *
 * Primary mechanism: a shared secret in the `Authorization: Bearer <secret>`
 * header, compared in constant time. Configure `CRON_SECRET` in the environment
 * and have the Vercel Cron (or any scheduler) send the header.
 *
 * - Production with no `CRON_SECRET`: denied (no silent open endpoint).
 * - Non-production with no `CRON_SECRET`: allowed (local/dev convenience).
 */
function safeEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  if (ab.length !== bb.length) return false;
  return timingSafeEqual(ab, bb);
}

export function isCronAuthorized(request: Request): boolean {
  const secret = process.env.CRON_SECRET?.trim();
  if (!secret) {
    return process.env.NODE_ENV !== "production";
  }
  const header = request.headers.get("authorization");
  if (!header) return false;
  return safeEqual(header, `Bearer ${secret}`);
}
