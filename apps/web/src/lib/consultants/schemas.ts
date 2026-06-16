import { z } from "zod";

// Entity ids are opaque strings. Prisma generates cuids for new rows, but
// seeded/imported data may use readable ids. Referential integrity is enforced
// by the database, so we only sanity-check shape instead of forcing the cuid
// format (which silently rejected updates against seeded rows).
const entityId = z
  .string()
  .trim()
  .min(1)
  .max(64)
  .regex(/^[A-Za-z0-9_-]+$/, "Identificador invalido.");

const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .optional()
    .transform((value) => (value ? value : undefined));

const optionalDate = z
  .string()
  .trim()
  .optional()
  .transform((value) => (value ? value : undefined));

const optionalNumber = z.preprocess(
  (value) => (value === "" || value === null ? undefined : value),
  z.coerce.number().nonnegative().optional(),
);

export const consultantIdentitySchema = z.object({
  id: optionalText(80),
  name: z.string().trim().min(2).max(120),
  email: z.string().trim().email().max(160),
  jobTitle: optionalText(120),
  seniority: z.enum(["INTERN", "JUNIOR", "MID_LEVEL", "SENIOR", "SPECIALIST", "PRINCIPAL"]),
  area: optionalText(80),
  status: z.enum(["ACTIVE", "INACTIVE", "ON_LEAVE"]),
});

export const personalInfoSchema = z.object({
  consultantId: entityId,
  cpf: optionalText(20),
  birthDate: optionalDate,
  phone: optionalText(30),
});

export const companyInfoSchema = z.object({
  consultantId: entityId,
  cnpj: optionalText(20),
  legalName: optionalText(160),
  tradeName: optionalText(160),
  municipalRegistration: optionalText(60),
  taxRegime: optionalText(80),
});

export const addressSchema = z.object({
  consultantId: entityId,
  postalCode: optionalText(12),
  street: optionalText(160),
  district: optionalText(120),
  city: optionalText(120),
  state: optionalText(2),
  number: optionalText(30),
  complement: optionalText(120),
});

export const bankAccountSchema = z.object({
  id: optionalText(80),
  consultantId: entityId,
  kind: z.enum(["CLT", "PJ", "PRIMARY"]),
  bankCode: optionalText(20),
  bankName: optionalText(120),
  agency: optionalText(30),
  accountNumber: optionalText(40),
  accountDigit: optionalText(10),
  pixKey: optionalText(120),
  holderDocument: optionalText(20),
  active: z.boolean(),
});

export const compensationSchema = z
  .object({
    id: optionalText(80),
    consultantId: entityId,
    contractType: z.enum(["CLT", "PJ", "CLT_FLEX"]),
    startsAt: z.string().trim().min(10).max(10),
    endsAt: optionalDate,
    hourlyRate: optionalNumber,
    cltAmount: optionalNumber,
    pjAmount: optionalNumber,
    benefitCardAmount: optionalNumber,
    discountRulesJson: optionalText(2000),
    note: optionalText(300),
  })
  .refine((value) => !value.endsAt || value.endsAt >= value.startsAt, {
    message: "Fim deve ser maior ou igual ao inicio.",
    path: ["endsAt"],
  })
  .refine(
    (value) =>
      value.contractType !== "CLT_FLEX" ||
      (Number(value.cltAmount ?? 0) > 0 && Number(value.pjAmount ?? 0) > 0),
    {
      message: "CLT FLEX exige valores CLT e PJ.",
      path: ["contractType"],
    },
  );

export const benefitSchema = z
  .object({
    id: optionalText(80),
    consultantId: entityId,
    type: z.enum([
      "MEAL_VOUCHER",
      "FOOD_VOUCHER",
      "TRANSPORTATION_VOUCHER",
      "BENEFIT_CARD",
      "OTHER",
    ]),
    amount: z.coerce.number().positive(),
    startsAt: z.string().trim().min(10).max(10),
    endsAt: optionalDate,
    note: optionalText(300),
  })
  .refine((value) => !value.endsAt || value.endsAt >= value.startsAt, {
    message: "Fim deve ser maior ou igual ao inicio.",
    path: ["endsAt"],
  });

/**
 * VA/VR/VT shortcuts shown next to "Valor acordado". Each maps to a single
 * active {@link benefitSchema} row of the corresponding type:
 * - vr (Vale Refeicao)      -> MEAL_VOUCHER
 * - va (Vale Alimentacao)   -> FOOD_VOUCHER
 * - vt (Vale Transporte)    -> TRANSPORTATION_VOUCHER
 * A value of 0/undefined means "no benefit of that type" and ends any current
 * row (does not create a zero-amount benefit, since benefit.amount is positive).
 */
export const voucherBenefitsSchema = z.object({
  consultantId: entityId,
  startsAt: z.string().trim().min(10).max(10),
  vr: optionalNumber,
  va: optionalNumber,
  vt: optionalNumber,
});

export const lookupInputSchema = z.object({
  consultantId: entityId,
  value: z.string().trim().min(8).max(20),
});

export type ConsultantIdentityInput = z.infer<typeof consultantIdentitySchema>;
export type PersonalInfoInput = z.infer<typeof personalInfoSchema>;
export type CompanyInfoInput = z.infer<typeof companyInfoSchema>;
export type AddressInput = z.infer<typeof addressSchema>;
export type BankAccountInput = z.infer<typeof bankAccountSchema>;
export type CompensationInput = z.infer<typeof compensationSchema>;
export type BenefitInput = z.infer<typeof benefitSchema>;
export type VoucherBenefitsInput = z.infer<typeof voucherBenefitsSchema>;

/** Maps the pt-BR voucher shortcut keys to ConsultantBenefit.type values. */
export const VOUCHER_TYPE_BY_KEY = {
  vr: "MEAL_VOUCHER",
  va: "FOOD_VOUCHER",
  vt: "TRANSPORTATION_VOUCHER",
} as const;

export type VoucherKey = keyof typeof VOUCHER_TYPE_BY_KEY;

