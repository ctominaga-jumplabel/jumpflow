import {
  randomBytes,
  scrypt,
  timingSafeEqual,
  type ScryptOptions,
} from "node:crypto";

/**
 * Password hashing — Node-only (`node:crypto` scrypt). NEVER import this from
 * `auth.config.ts` or `proxy.ts` (edge): it would pull Node-only crypto into
 * the Edge Runtime. See auth-foundation §11.1 / §11.3. The `node:crypto` import
 * itself keeps this module out of any edge bundle.
 *
 * Stored format (self-describing, auth-foundation §11.3):
 *   `scrypt$N$r$p$<saltBase64url>$<hashBase64url>`
 * The KDF parameters travel in the hash so cost/algorithm can evolve without
 * breaking existing hashes. This format is byte-for-byte the same one the seed
 * (`packages/database/prisma/seed.mjs`) produces, so credentials seeded there
 * verify here unchanged.
 */

// scrypt parameters — MUST mirror packages/database/prisma/seed.mjs.
const SCRYPT_N = 16384; // 2^14
const SCRYPT_R = 8;
const SCRYPT_P = 1;
const SCRYPT_KEYLEN = 64;
// scrypt needs maxmem raised above the default for N=16384 (matches the seed).
const SCRYPT_MAXMEM = 64 * 1024 * 1024;

/**
 * Promise wrapper around the 4-arg `scrypt(password, salt, keylen, options)`
 * overload (which `util.promisify` does not type cleanly).
 */
function scryptAsync(
  password: string,
  salt: Buffer,
  keylen: number,
  options: ScryptOptions,
): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    scrypt(password, salt, keylen, options, (err, derivedKey) => {
      if (err) reject(err);
      else resolve(derivedKey);
    });
  });
}

async function derive(password: string, salt: Buffer): Promise<Buffer> {
  return scryptAsync(password, salt, SCRYPT_KEYLEN, {
    N: SCRYPT_N,
    r: SCRYPT_R,
    p: SCRYPT_P,
    maxmem: SCRYPT_MAXMEM,
  });
}

/**
 * Hash a plaintext password with a fresh random salt. Returns the encoded
 * `scrypt$...` string ready to persist in `User.passwordHash`.
 */
export async function hashPassword(plain: string): Promise<string> {
  const salt = randomBytes(16);
  const derived = await derive(plain, salt);
  return [
    "scrypt",
    SCRYPT_N,
    SCRYPT_R,
    SCRYPT_P,
    salt.toString("base64url"),
    derived.toString("base64url"),
  ].join("$");
}

/**
 * Verify a plaintext password against a stored `scrypt$...` hash in constant
 * time. Returns false (never throws) for any malformed/invalid stored value,
 * so callers never need a try/catch and a parse failure is treated as a
 * mismatch rather than leaking through an exception.
 */
export async function verifyPassword(
  plain: string,
  stored: string | null | undefined,
): Promise<boolean> {
  try {
    if (typeof stored !== "string") return false;

    const parts = stored.split("$");
    if (parts.length !== 6) return false;

    const [scheme, nRaw, rRaw, pRaw, saltB64, hashB64] = parts;
    if (scheme !== "scrypt") return false;

    const N = Number(nRaw);
    const r = Number(rRaw);
    const p = Number(pRaw);
    if (
      !Number.isInteger(N) ||
      !Number.isInteger(r) ||
      !Number.isInteger(p) ||
      N <= 1 ||
      r <= 0 ||
      p <= 0
    ) {
      return false;
    }

    const salt = Buffer.from(saltB64, "base64url");
    const expected = Buffer.from(hashB64, "base64url");
    if (salt.length === 0 || expected.length === 0) return false;

    const derived = await scryptAsync(plain, salt, expected.length, {
      N,
      r,
      p,
      maxmem: SCRYPT_MAXMEM,
    });

    // Lengths match by construction (keylen = expected.length), but guard
    // anyway: timingSafeEqual throws on length mismatch.
    if (derived.length !== expected.length) return false;
    return timingSafeEqual(derived, expected);
  } catch {
    return false;
  }
}
