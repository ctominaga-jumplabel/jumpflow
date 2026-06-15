import { z } from "zod";

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
  consultantId: z.string().cuid(),
  cpf: optionalText(20),
  birthDate: optionalDate,
  phone: optionalText(30),
});

export const companyInfoSchema = z.object({
  consultantId: z.string().cuid(),
  cnpj: optionalText(20),
  legalName: optionalText(160),
  tradeName: optionalText(160),
  municipalRegistration: optionalText(60),
  taxRegime: optionalText(80),
});

export const addressSchema = z.object({
  consultantId: z.string().cuid(),
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
  consultantId: z.string().cuid(),
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
    consultantId: z.string().cuid(),
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
    consultantId: z.string().cuid(),
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

export const lookupInputSchema = z.object({
  consultantId: z.string().cuid(),
  value: z.string().trim().min(8).max(20),
});

export type ConsultantIdentityInput = z.infer<typeof consultantIdentitySchema>;
export type PersonalInfoInput = z.infer<typeof personalInfoSchema>;
export type CompanyInfoInput = z.infer<typeof companyInfoSchema>;
export type AddressInput = z.infer<typeof addressSchema>;
export type BankAccountInput = z.infer<typeof bankAccountSchema>;
export type CompensationInput = z.infer<typeof compensationSchema>;
export type BenefitInput = z.infer<typeof benefitSchema>;

