// @vitest-environment node
import { randomBytes } from "node:crypto";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  ENCRYPTED_FIELDS,
  FieldEncryptionError,
  decryptMoney,
  decryptMoneyNumber,
  encryptMoney,
  isEncryptedValue,
  resetFieldEncryptionCacheForTests,
} from "@jumpflow/database/field-encryption";
// Script de backfill (JS puro): o app precisa decifrar exatamente o que ele grava.
import {
  encryptMoney as scriptEncryptMoney,
  loadCurrentKey as scriptLoadCurrentKey,
} from "../../../../../packages/database/scripts/lib/field-encryption.mjs";

const KEY_A = randomBytes(32).toString("base64");
const KEY_B = randomBytes(32).toString("base64");
const RATE = ENCRYPTED_FIELDS.compensationHourlyRate;

function useKey(key: string, id = "k1", previous = "") {
  vi.stubEnv("FIELD_ENCRYPTION_KEY", key);
  vi.stubEnv("FIELD_ENCRYPTION_KEY_ID", id);
  vi.stubEnv("FIELD_ENCRYPTION_PREVIOUS_KEYS", previous);
  resetFieldEncryptionCacheForTests();
}

afterEach(() => {
  vi.unstubAllEnvs();
  resetFieldEncryptionCacheForTests();
});

describe("field encryption (valores do consultor)", () => {
  it("cifra e decifra preservando 2 casas, sem o valor em claro no texto gravado", () => {
    useKey(KEY_A);
    const stored = encryptMoney(RATE, 187.5);
    expect(isEncryptedValue(stored)).toBe(true);
    expect(stored).not.toContain("187");
    expect(decryptMoney(RATE, stored).toFixed(2)).toBe("187.50");
    expect(decryptMoneyNumber(RATE, stored)).toBe(187.5);
  });

  it("usa IV aleatório: o mesmo valor gera textos cifrados diferentes", () => {
    useKey(KEY_A);
    expect(encryptMoney(RATE, 100)).not.toBe(encryptMoney(RATE, 100));
  });

  it("mantém null/undefined (campo opcional)", () => {
    useKey(KEY_A);
    expect(encryptMoney(RATE, null)).toBeNull();
    expect(encryptMoney(RATE, undefined)).toBeUndefined();
    expect(decryptMoney(RATE, null)).toBeNull();
  });

  it("rejeita valor cifrado de OUTRO campo (AAD)", () => {
    useKey(KEY_A);
    const stored = encryptMoney(ENCRYPTED_FIELDS.compensationCltAmount, 5000);
    expect(() => decryptMoney(RATE, stored)).toThrow(FieldEncryptionError);
  });

  it("detecta adulteração do texto cifrado", () => {
    useKey(KEY_A);
    const stored = encryptMoney(RATE, 120);
    const parts = stored.split(":");
    const ct = Buffer.from(parts[5], "base64");
    ct[0] ^= 0xff;
    parts[5] = ct.toString("base64");
    expect(() => decryptMoney(RATE, parts.join(":"))).toThrow(
      FieldEncryptionError,
    );
  });

  it("não decifra com a chave errada", () => {
    useKey(KEY_A);
    const stored = encryptMoney(RATE, 120);
    useKey(KEY_B);
    expect(() => decryptMoney(RATE, stored)).toThrow(FieldEncryptionError);
  });

  it("rotação: chave anterior continua decifrando via FIELD_ENCRYPTION_PREVIOUS_KEYS", () => {
    useKey(KEY_A, "k1");
    const stored = encryptMoney(RATE, 99.9);
    useKey(KEY_B, "k2", `k1:${KEY_A}`);
    expect(decryptMoneyNumber(RATE, stored)).toBe(99.9);
    expect(encryptMoney(RATE, 1)).toContain("enc:v1:k2:");
  });

  it("lê valor LEGADO em texto puro (entre a migration e o backfill)", () => {
    useKey(KEY_A);
    expect(decryptMoneyNumber(RATE, "150.00")).toBe(150);
  });

  it("falha fechado em produção sem chave", () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("FIELD_ENCRYPTION_KEY", "");
    resetFieldEncryptionCacheForTests();
    expect(() => encryptMoney(RATE, 10)).toThrow(FieldEncryptionError);
  });

  it("recusa chave com tamanho inválido", () => {
    useKey(Buffer.from("curta").toString("base64"));
    expect(() => encryptMoney(RATE, 10)).toThrow(FieldEncryptionError);
  });

  it("o script de backfill (.mjs) grava no mesmo formato que o app decifra", () => {
    useKey(KEY_A, "k1");
    const current = scriptLoadCurrentKey(process.env);
    const stored = scriptEncryptMoney(RATE, "250.4", current);
    expect(decryptMoneyNumber(RATE, stored)).toBe(250.4);
  });
});
