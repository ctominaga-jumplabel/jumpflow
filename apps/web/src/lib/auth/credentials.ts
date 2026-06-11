import { randomBytes } from "node:crypto";
import { z } from "zod";
import { isDatabaseConfigured } from "@/lib/db/config";
import { hashPassword, verifyPassword } from "./password";

/**
 * Credentials provider `authorize` (Node-only). Imported EXCLUSIVELY by
 * `auth.ts` (the full NextAuth instance). NEVER reachable from `auth.config.ts`
 * or `proxy.ts` (edge): it pulls Prisma + node:crypto hashing.
 *
 * Security contract (auth-foundation §11.2):
 * - Email is normalized (trim + lowercase) and the input validated server-side.
 * - On ANY failure (no user, no password set, inactive, wrong password, no
 *   database) it returns null WITHOUT distinguishing the reason — the client
 *   must never learn whether an email exists or whether an account is inactive.
 * - On success it returns `{ id: <db cuid>, email, name }` only. Roles NEVER
 *   travel through the token; RBAC is resolved later by getCurrentUser().
 */

const credentialsInputSchema = z.object({
  email: z.string().trim().toLowerCase().email(),
  // Length policy is enforced at password-creation time (invite/admin). Here we
  // only require a non-empty value; verification decides correctness.
  password: z.string().min(1),
});

export interface AuthorizedUser {
  id: string;
  email: string;
  name: string;
}

/**
 * A valid scrypt hash of a random throwaway secret, computed once per process.
 * Used to equalize timing on the failure path (no user / no hash) so scrypt
 * runs exactly once regardless of outcome — it never matches any real password.
 */
let dummyHashPromise: Promise<string> | null = null;
function getDummyHash(): Promise<string> {
  if (!dummyHashPromise) {
    dummyHashPromise = hashPassword(randomBytes(32).toString("base64url"));
  }
  return dummyHashPromise;
}

export async function authorizeCredentials(
  raw: unknown,
): Promise<AuthorizedUser | null> {
  // No database -> credentials login is impossible; fail closed (generic null).
  if (!isDatabaseConfigured()) return null;

  const parsed = credentialsInputSchema.safeParse(raw);
  if (!parsed.success) return null;

  const { email, password } = parsed.data;

  // Lazy import so Prisma is never loaded on code paths without a database.
  const { prisma } = await import("@jumpflow/database");

  const user = await prisma.user.findUnique({
    where: { email },
    select: { id: true, name: true, email: true, passwordHash: true, status: true },
  });

  // Always run exactly ONE scrypt verification, even when the user is missing,
  // has no password, or is inactive — otherwise the response time would leak
  // whether an active account exists (user enumeration). For those paths we
  // verify against a throwaway dummy hash and ignore the result.
  const hashToCheck = user?.passwordHash ?? (await getDummyHash());
  const passwordOk = await verifyPassword(password, hashToCheck);

  // Same generic null for every failure mode (existence/state must not leak).
  if (!user || !user.passwordHash || user.status !== "ACTIVE" || !passwordOk) {
    return null;
  }

  // Best-effort sign-in timestamp; never block login on this write.
  try {
    await prisma.user.update({
      where: { id: user.id },
      data: { lastLoginAt: new Date() },
    });
  } catch (error) {
    console.error("[auth] failed to update lastLoginAt", error);
  }

  return { id: user.id, email: user.email, name: user.name };
}
