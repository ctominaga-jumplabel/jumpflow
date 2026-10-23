import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";
import { Prisma } from "@prisma/client";

/**
 * Criptografia em nivel de campo (application-level) para os valores de
 * recebimento do consultor (custo/hora, valores acordados, beneficios,
 * remuneracao pontual). O banco guarda SOMENTE o texto cifrado; a chave vive
 * fora do banco, na env `FIELD_ENCRYPTION_KEY` (32 bytes em base64).
 *
 * Formato (texto, versionado):
 *   enc:v1:<keyId>:<iv b64>:<authTag b64>:<ciphertext b64>
 *
 * - AES-256-GCM (autenticado): adulteracao do texto cifrado falha na leitura.
 * - AAD = nome logico do campo (ex. "ConsultantCompensation.hourlyRate"): um
 *   valor cifrado nao pode ser copiado para OUTRA coluna e lido como valido.
 * - Rotacao: `FIELD_ENCRYPTION_KEY_ID` identifica a chave atual (default "k1");
 *   chaves antigas seguem decifrando via `FIELD_ENCRYPTION_PREVIOUS_KEYS`
 *   ("k0:<base64>,k-1:<base64>"). Valores novos/alterados usam a chave atual;
 *   os antigos continuam com a chave antiga (o backfill NAO re-cifra), entao
 *   NUNCA remova uma chave antiga enquanto houver valor cifrado com ela.
 *
 * Valores LEGADOS (texto numerico puro, gravado antes da migration de
 * criptografia) ainda sao lidos para nao derrubar o app entre o deploy da
 * migration e a execucao do backfill (`scripts/encrypt-sensitive-values.mjs`).
 *
 * Sem chave configurada: em producao FALHA (nunca grava em claro); fora de
 * producao usa uma chave de desenvolvimento fixa, com aviso no console.
 */

export const ENCRYPTED_PREFIX = "enc:v1:";

const ALGORITHM = "aes-256-gcm";
const IV_BYTES = 12;
const KEY_BYTES = 32;
const DEV_KEY_ID = "dev";
/** Chave fixa SOMENTE para desenvolvimento local (nunca usada em producao). */
const DEV_KEY = Buffer.alloc(KEY_BYTES, "jumpflow-dev-field-key");

/** Campos cifrados (AAD). Mantido em sincronia com o backfill .mjs. */
export const ENCRYPTED_FIELDS = {
  consultantHourlyCost: "Consultant.hourlyCost",
  compensationHourlyRate: "ConsultantCompensation.hourlyRate",
  compensationCltAmount: "ConsultantCompensation.cltAmount",
  compensationPjAmount: "ConsultantCompensation.pjAmount",
  compensationBenefitCardAmount: "ConsultantCompensation.benefitCardAmount",
  benefitAmount: "ConsultantBenefit.amount",
  allocationCostRateHourlyCost: "ConsultantAllocationCostRate.hourlyCost",
  projectRateHourlyRate: "ConsultantProjectRate.hourlyRate",
  adHocPaymentAmount: "ConsultantAdHocPayment.amount",
} as const;

export type EncryptedField =
  (typeof ENCRYPTED_FIELDS)[keyof typeof ENCRYPTED_FIELDS];

export class FieldEncryptionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "FieldEncryptionError";
  }
}

interface Keyring {
  currentId: string;
  keys: Map<string, Buffer>;
}

let cachedKeyring: { source: string; keyring: Keyring } | null = null;
let warnedDevKey = false;

function decodeKey(id: string, base64: string): Buffer {
  const key = Buffer.from(base64.trim(), "base64");
  if (key.length !== KEY_BYTES) {
    throw new FieldEncryptionError(
      `Chave de criptografia "${id}" invalida: esperado ${KEY_BYTES} bytes em base64.`,
    );
  }
  return key;
}

function loadKeyring(): Keyring {
  const primary = process.env.FIELD_ENCRYPTION_KEY?.trim() ?? "";
  const currentIdEnv = process.env.FIELD_ENCRYPTION_KEY_ID?.trim() || "k1";
  const previous = process.env.FIELD_ENCRYPTION_PREVIOUS_KEYS?.trim() ?? "";
  const source = `${currentIdEnv}|${primary}|${previous}|${process.env.NODE_ENV}`;
  if (cachedKeyring?.source === source) return cachedKeyring.keyring;

  const keys = new Map<string, Buffer>();
  let currentId: string;
  if (primary) {
    currentId = currentIdEnv;
    keys.set(currentId, decodeKey(currentId, primary));
  } else if (process.env.NODE_ENV === "production") {
    throw new FieldEncryptionError(
      "FIELD_ENCRYPTION_KEY nao configurada: dados sensiveis nao podem ser lidos nem gravados.",
    );
  } else {
    if (!warnedDevKey) {
      console.warn(
        "[field-encryption] FIELD_ENCRYPTION_KEY ausente; usando chave de DESENVOLVIMENTO.",
      );
      warnedDevKey = true;
    }
    currentId = DEV_KEY_ID;
    keys.set(DEV_KEY_ID, DEV_KEY);
  }

  for (const entry of previous.split(",")) {
    const trimmed = entry.trim();
    if (!trimmed) continue;
    const sep = trimmed.indexOf(":");
    if (sep <= 0) {
      throw new FieldEncryptionError(
        'FIELD_ENCRYPTION_PREVIOUS_KEYS invalida: use "id:base64,id:base64".',
      );
    }
    const id = trimmed.slice(0, sep);
    if (!keys.has(id)) keys.set(id, decodeKey(id, trimmed.slice(sep + 1)));
  }

  const keyring = { currentId, keys };
  cachedKeyring = { source, keyring };
  return keyring;
}

/** Cifra um texto arbitrario para o campo `field`. */
export function encryptField(field: EncryptedField, plaintext: string): string {
  const { currentId, keys } = loadKeyring();
  const key = keys.get(currentId)!;
  const iv = randomBytes(IV_BYTES);
  const cipher = createCipheriv(ALGORITHM, key, iv);
  cipher.setAAD(Buffer.from(field, "utf8"));
  const ciphertext = Buffer.concat([
    cipher.update(plaintext, "utf8"),
    cipher.final(),
  ]);
  const tag = cipher.getAuthTag();
  return `${ENCRYPTED_PREFIX}${currentId}:${iv.toString("base64")}:${tag.toString("base64")}:${ciphertext.toString("base64")}`;
}

/** Decifra um valor produzido por {@link encryptField}. */
export function decryptField(field: EncryptedField, stored: string): string {
  if (!isEncryptedValue(stored)) {
    throw new FieldEncryptionError(`Valor de ${field} nao esta cifrado.`);
  }
  const parts = stored.slice(ENCRYPTED_PREFIX.length).split(":");
  if (parts.length !== 4) {
    throw new FieldEncryptionError(`Valor cifrado de ${field} malformado.`);
  }
  const [keyId, ivB64, tagB64, ctB64] = parts;
  const key = loadKeyring().keys.get(keyId);
  if (!key) {
    throw new FieldEncryptionError(
      `Chave "${keyId}" usada em ${field} nao esta configurada.`,
    );
  }
  try {
    const decipher = createDecipheriv(
      ALGORITHM,
      key,
      Buffer.from(ivB64, "base64"),
    );
    decipher.setAAD(Buffer.from(field, "utf8"));
    decipher.setAuthTag(Buffer.from(tagB64, "base64"));
    return Buffer.concat([
      decipher.update(Buffer.from(ctB64, "base64")),
      decipher.final(),
    ]).toString("utf8");
  } catch {
    throw new FieldEncryptionError(
      `Falha ao decifrar ${field} (chave incorreta ou valor adulterado).`,
    );
  }
}

export function isEncryptedValue(value: unknown): value is string {
  return typeof value === "string" && value.startsWith(ENCRYPTED_PREFIX);
}

type MoneyInput = Prisma.Decimal | number | string;

/**
 * Cifra um valor monetario (2 casas, mesma escala do antigo Decimal(12,2)).
 * `null`/`undefined` passam adiante (campo opcional / "nao alterar" no update).
 */
export function encryptMoney(field: EncryptedField, value: MoneyInput): string;
export function encryptMoney(
  field: EncryptedField,
  value: MoneyInput | null,
): string | null;
export function encryptMoney(
  field: EncryptedField,
  value: MoneyInput | null | undefined,
): string | null | undefined;
export function encryptMoney(
  field: EncryptedField,
  value: MoneyInput | null | undefined,
): string | null | undefined {
  if (value === null || value === undefined) return value;
  const decimal = new Prisma.Decimal(value);
  if (!decimal.isFinite()) {
    throw new FieldEncryptionError(`Valor invalido para ${field}.`);
  }
  return encryptField(field, decimal.toDecimalPlaces(2).toFixed(2));
}

/**
 * Decifra um valor monetario para `Prisma.Decimal` (mesmo tipo que o restante
 * do codigo ja tratava). Aceita valores LEGADOS em texto puro (pre-backfill).
 */
export function decryptMoney(
  field: EncryptedField,
  stored: string,
): Prisma.Decimal;
export function decryptMoney(
  field: EncryptedField,
  stored: string | null,
): Prisma.Decimal | null;
export function decryptMoney(
  field: EncryptedField,
  stored: string | null | undefined,
): Prisma.Decimal | null;
export function decryptMoney(
  field: EncryptedField,
  stored: string | null | undefined,
): Prisma.Decimal | null {
  if (stored === null || stored === undefined) return null;
  const plain = isEncryptedValue(stored) ? decryptField(field, stored) : stored;
  try {
    return new Prisma.Decimal(plain);
  } catch {
    throw new FieldEncryptionError(`Valor de ${field} ilegivel.`);
  }
}

/** Atalho: decifra direto para `number` (ou null). */
export function decryptMoneyNumber(
  field: EncryptedField,
  stored: string | null | undefined,
): number | null {
  const value = decryptMoney(field, stored);
  return value === null ? null : value.toNumber();
}

/** Somente para testes: descarta o keyring em cache. */
export function resetFieldEncryptionCacheForTests(): void {
  cachedKeyring = null;
  warnedDevKey = false;
}
