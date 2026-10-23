/**
 * Adaptadores de leitura dos valores CIFRADOS do consultor (ver
 * `packages/database/src/field-encryption.ts`). Convertem as linhas do Prisma
 * (`*Encrypted: string`) de volta ao formato numérico que os cálculos de
 * pagamento/custo/margem já consomem. Decifrar acontece SÓ no servidor; quem
 * decide se o valor pode ser EXIBIDO é o chamador (grupo Dados Sensíveis).
 */
import type { Prisma } from "@jumpflow/database";
import {
  ENCRYPTED_FIELDS,
  decryptMoney,
} from "@jumpflow/database/field-encryption";

interface EncryptedCompensationRow {
  hourlyRateEncrypted: string | null;
  cltAmountEncrypted: string | null;
  pjAmountEncrypted: string | null;
  benefitCardAmountEncrypted: string | null;
}

export type DecryptedCompensation<T extends EncryptedCompensationRow> = Omit<
  T,
  keyof EncryptedCompensationRow
> & {
  hourlyRate: Prisma.Decimal | null;
  cltAmount: Prisma.Decimal | null;
  pjAmount: Prisma.Decimal | null;
  benefitCardAmount: Prisma.Decimal | null;
};

export function decryptCompensation<T extends EncryptedCompensationRow>(
  row: T,
): DecryptedCompensation<T> {
  const {
    hourlyRateEncrypted,
    cltAmountEncrypted,
    pjAmountEncrypted,
    benefitCardAmountEncrypted,
    ...rest
  } = row;
  return {
    ...rest,
    hourlyRate: decryptMoney(
      ENCRYPTED_FIELDS.compensationHourlyRate,
      hourlyRateEncrypted,
    ),
    cltAmount: decryptMoney(
      ENCRYPTED_FIELDS.compensationCltAmount,
      cltAmountEncrypted,
    ),
    pjAmount: decryptMoney(
      ENCRYPTED_FIELDS.compensationPjAmount,
      pjAmountEncrypted,
    ),
    benefitCardAmount: decryptMoney(
      ENCRYPTED_FIELDS.compensationBenefitCardAmount,
      benefitCardAmountEncrypted,
    ),
  };
}

export function decryptBenefit<T extends { amountEncrypted: string }>(
  row: T,
): Omit<T, "amountEncrypted"> & { amount: Prisma.Decimal } {
  const { amountEncrypted, ...rest } = row;
  return {
    ...rest,
    amount: decryptMoney(ENCRYPTED_FIELDS.benefitAmount, amountEncrypted),
  };
}

export function decryptAdHocPayment<T extends { amountEncrypted: string }>(
  row: T,
): Omit<T, "amountEncrypted"> & { amount: Prisma.Decimal } {
  const { amountEncrypted, ...rest } = row;
  return {
    ...rest,
    amount: decryptMoney(ENCRYPTED_FIELDS.adHocPaymentAmount, amountEncrypted),
  };
}

/** Compensações + benefícios de um consultor, prontos para o cálculo. */
export function decryptConsultantRemuneration<
  T extends {
    compensations: EncryptedCompensationRow[];
    benefits: { amountEncrypted: string }[];
  },
>(
  record: T,
): Omit<T, "compensations" | "benefits"> & {
  compensations: DecryptedCompensation<T["compensations"][number]>[];
  benefits: (Omit<T["benefits"][number], "amountEncrypted"> & {
    amount: Prisma.Decimal;
  })[];
} {
  return {
    ...record,
    compensations: record.compensations.map((row) =>
      decryptCompensation<T["compensations"][number]>(row),
    ),
    benefits: record.benefits.map((row) =>
      decryptBenefit<T["benefits"][number]>(row),
    ),
  };
}
