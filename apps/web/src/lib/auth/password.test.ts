import { describe, expect, it } from "vitest";
import { scryptSync } from "node:crypto";
import { hashPassword, verifyPassword } from "./password";

describe("hashPassword / verifyPassword — round trip", () => {
  it("produces a hash that verifies against the original password", async () => {
    const stored = await hashPassword("uma-senha-bem-longa");
    await expect(verifyPassword("uma-senha-bem-longa", stored)).resolves.toBe(
      true,
    );
  });

  it("rejects the wrong password", async () => {
    const stored = await hashPassword("uma-senha-bem-longa");
    await expect(verifyPassword("senha-errada", stored)).resolves.toBe(false);
  });

  it("uses a fresh random salt (same password -> different hashes)", async () => {
    const a = await hashPassword("repetida-repetida");
    const b = await hashPassword("repetida-repetida");
    expect(a).not.toEqual(b);
    await expect(verifyPassword("repetida-repetida", a)).resolves.toBe(true);
    await expect(verifyPassword("repetida-repetida", b)).resolves.toBe(true);
  });
});

describe("hashPassword — format (auth-foundation §11.3)", () => {
  it("emits scrypt$N$r$p$<saltB64url>$<hashB64url> with the agreed params", async () => {
    const stored = await hashPassword("formato-de-teste");
    const parts = stored.split("$");
    expect(parts).toHaveLength(6);
    const [scheme, n, r, p, salt, hash] = parts;
    expect(scheme).toBe("scrypt");
    expect(n).toBe("16384");
    expect(r).toBe("8");
    expect(p).toBe("1");
    // base64url salt is 16 bytes, hash (keylen) is 64 bytes.
    expect(Buffer.from(salt, "base64url")).toHaveLength(16);
    expect(Buffer.from(hash, "base64url")).toHaveLength(64);
  });

  it("is byte-compatible with the seed hashing (same params, no maxmem leak)", async () => {
    // Reproduce a hash exactly as the seed does and verify it here.
    const password = "compat-com-o-seed";
    const stored = await hashPassword(password);
    const [, nRaw, rRaw, pRaw, saltB64, hashB64] = stored.split("$");
    const derived = scryptSync(password, Buffer.from(saltB64, "base64url"), 64, {
      N: Number(nRaw),
      r: Number(rRaw),
      p: Number(pRaw),
      maxmem: 64 * 1024 * 1024,
    });
    expect(derived.toString("base64url")).toBe(hashB64);
  });
});

describe("verifyPassword — invalid stored values never throw", () => {
  it.each([
    ["null", null],
    ["undefined", undefined],
    ["empty string", ""],
    ["wrong scheme", "bcrypt$16384$8$1$AAAA$BBBB"],
    ["too few parts", "scrypt$16384$8$1$AAAA"],
    ["too many parts", "scrypt$16384$8$1$AAAA$BBBB$CCCC"],
    ["non-numeric params", "scrypt$abc$8$1$AAAA$BBBB"],
    ["zero N", "scrypt$0$8$1$AAAA$BBBB"],
    ["plain garbage", "not-a-hash-at-all"],
  ])("returns false for %s", async (_label, stored) => {
    await expect(
      verifyPassword("qualquer-senha", stored as string | null | undefined),
    ).resolves.toBe(false);
  });
});
