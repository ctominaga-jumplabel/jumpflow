// Cópia em JS puro do formato de `packages/database/src/field-encryption.ts`,
// para scripts Node (.mjs) que rodam fora do bundler. O formato DEVE ficar
// idêntico: `apps/web/src/lib/db/field-encryption.test.ts` garante que o app
// decifra o que este módulo cifra.
//
//   enc:v1:<keyId>:<iv b64>:<authTag b64>:<ciphertext b64>   (AES-256-GCM, AAD = campo)

import { createCipheriv, randomBytes } from "node:crypto";

export const ENCRYPTED_PREFIX = "enc:v1:";

/** Campos cifrados por tabela: coluna física -> AAD (nome lógico do campo). */
export const ENCRYPTED_COLUMNS = {
  Consultant: { hourlyCost: "Consultant.hourlyCost" },
  ConsultantCompensation: {
    hourlyRate: "ConsultantCompensation.hourlyRate",
    cltAmount: "ConsultantCompensation.cltAmount",
    pjAmount: "ConsultantCompensation.pjAmount",
    benefitCardAmount: "ConsultantCompensation.benefitCardAmount",
  },
  ConsultantBenefit: { amount: "ConsultantBenefit.amount" },
  ConsultantAllocationCostRate: {
    hourlyCost: "ConsultantAllocationCostRate.hourlyCost",
  },
  ConsultantProjectRate: { hourlyRate: "ConsultantProjectRate.hourlyRate" },
  ConsultantAdHocPayment: { amount: "ConsultantAdHocPayment.amount" },
};

const KEY_BYTES = 32;
const DEV_KEY_ID = "dev";
const DEV_KEY = Buffer.alloc(KEY_BYTES, "jumpflow-dev-field-key");

export function loadCurrentKey(env = process.env) {
  const primary = env.FIELD_ENCRYPTION_KEY?.trim() ?? "";
  if (!primary) {
    if (env.NODE_ENV === "production") {
      throw new Error("FIELD_ENCRYPTION_KEY nao configurada.");
    }
    return { id: DEV_KEY_ID, key: DEV_KEY, isDev: true };
  }
  const key = Buffer.from(primary, "base64");
  if (key.length !== KEY_BYTES) {
    throw new Error(
      `FIELD_ENCRYPTION_KEY invalida: esperado ${KEY_BYTES} bytes em base64.`,
    );
  }
  return {
    id: env.FIELD_ENCRYPTION_KEY_ID?.trim() || "k1",
    key,
    isDev: false,
  };
}

export function isEncryptedValue(value) {
  return typeof value === "string" && value.startsWith(ENCRYPTED_PREFIX);
}

export function encryptField(field, plaintext, current = loadCurrentKey()) {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", current.key, iv);
  cipher.setAAD(Buffer.from(field, "utf8"));
  const ciphertext = Buffer.concat([
    cipher.update(String(plaintext), "utf8"),
    cipher.final(),
  ]);
  const tag = cipher.getAuthTag();
  return `${ENCRYPTED_PREFIX}${current.id}:${iv.toString("base64")}:${tag.toString("base64")}:${ciphertext.toString("base64")}`;
}

/**
 * Normaliza um valor monetário legado (texto do NUMERIC ou número) para 2 casas,
 * como o app grava. Retorna null quando não é um número válido.
 */
export function normalizeMoney(value) {
  if (value === null || value === undefined || value === "") return null;
  const n = Number(value);
  if (!Number.isFinite(n)) return null;
  return n.toFixed(2);
}

export function encryptMoney(field, value, current = loadCurrentKey()) {
  const normalized = normalizeMoney(value);
  if (normalized === null) return null;
  return encryptField(field, normalized, current);
}
