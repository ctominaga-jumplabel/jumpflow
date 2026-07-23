import { z } from "zod";
import { ROLE_NAMES } from "@/lib/auth/roles";

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

const optionalEmail = z
  .string()
  .trim()
  .max(160)
  .email()
  .optional()
  .or(z.literal("").transform(() => undefined));

export const CONTRACT_TYPES = ["CLT", "PJ", "CLT_FLEX"] as const;
export const GENDERS = [
  "FEMALE",
  "MALE",
  "NON_BINARY",
  "OTHER",
  "UNDISCLOSED",
] as const;
export const MARITAL_STATUSES = [
  "SINGLE",
  "MARRIED",
  "STABLE_UNION",
  "DIVORCED",
  "WIDOWED",
  "SEPARATED",
  "OTHER",
] as const;
export const CONSULTANT_DOCUMENT_TYPES = [
  "PROOF_OF_ADDRESS",
  "RG",
  "CPF",
  "CTPS",
  "CERTIFICATE",
  "EMPLOYMENT_CONTRACT",
  "ASO_ADMISSIONAL",
  "SERVICE_CONTRACT",
  "CNPJ_CARD",
  "ARTICLES_OF_ASSOCIATION",
  "NEGATIVE_CERTIFICATE",
  "BANK_PROOF",
  "OTHER",
] as const;

/** Coerces "" -> undefined before validating against the given enum tuple. */
const optionalEnum = <T extends readonly [string, ...string[]]>(values: T) =>
  z.preprocess(
    (value) => (value === "" || value === null ? undefined : value),
    z.enum(values).optional(),
  );

/**
 * Catalogo de senioridade (espelha o enum Prisma `Seniority`). Fonte unica
 * usada pelo schema de identidade, pelo cadastro de novo consultor e pelos
 * rotulos pt-BR em {@link labels}.
 */
export const SENIORITIES = [
  "INTERN",
  "JUNIOR",
  "MID_LEVEL",
  "SENIOR",
  "SPECIALIST",
  "PRINCIPAL",
  "TRAINEE",
  "TECH_LEAD",
  "ARCHITECT",
  "COORDINATOR",
  "MANAGER",
] as const;

/** Situacao do consultor (espelha o enum Prisma `ConsultantStatus`). */
export const CONSULTANT_STATUSES = ["ACTIVE", "INACTIVE", "ON_LEAVE"] as const;

export const consultantIdentitySchema = z.object({
  id: optionalText(80),
  name: z.string().trim().min(2).max(120),
  email: z.string().trim().email().max(160),
  jobTitle: optionalText(120),
  seniority: z.enum(SENIORITIES),
  area: optionalText(80),
  status: z.enum(CONSULTANT_STATUSES),
  contractType: optionalEnum(CONTRACT_TYPES),
});

/**
 * Cadastro de NOVO consultor (formulario completo). Diferente do
 * {@link consultantIdentitySchema} (edicao), captura de uma vez a identidade, os
 * perfis de acesso (RBAC), os dados pessoais essenciais, a empresa/CNPJ, os
 * dados bancarios/PIX e a remuneracao acordada. Os campos opcionais so viram
 * linhas nas tabelas-fonte quando preenchidos; o restante do cadastro e
 * completado depois no perfil. A remuneracao (financeira) so e persistida pelo
 * servidor quando o operador tem papel financeiro (mascara de RBAC).
 */
export const createConsultantSchema = z.object({
  // Identidade
  name: z.string().trim().min(2, "Informe o nome completo.").max(120),
  email: z.string().trim().email("Informe um e-mail valido.").max(160),
  jobTitle: optionalText(120),
  seniority: z.enum(SENIORITIES),
  area: optionalText(80),
  status: z.enum(CONSULTANT_STATUSES).default("ACTIVE"),
  contractType: optionalEnum(CONTRACT_TYPES),
  // Perfis de acesso (RBAC). Default: apenas Consultor.
  roles: z
    .array(z.enum(ROLE_NAMES))
    .min(1, "Selecione ao menos um perfil de acesso.")
    .default(["CONSULTANT"]),
  // Dados pessoais essenciais
  cpf: optionalText(20),
  birthDate: optionalDate,
  phone: optionalText(30),
  // Empresa (PJ)
  cnpj: optionalText(20),
  legalName: optionalText(160),
  tradeName: optionalText(160),
  // Dados bancarios / PIX (uma conta inicial)
  bankName: optionalText(120),
  agency: optionalText(30),
  accountNumber: optionalText(40),
  pixKey: optionalText(120),
  // Remuneracao acordada (financeiro; gated no servidor)
  compensationStartsAt: optionalDate,
  cltAmount: optionalNumber,
  pjAmount: optionalNumber,
  benefitCardAmount: optionalNumber,
});

export const personalInfoSchema = z.object({
  consultantId: entityId,
  cpf: optionalText(20),
  birthDate: optionalDate,
  phone: optionalText(30),
  socialName: optionalText(120),
  rg: optionalText(20),
  gender: optionalEnum(GENDERS),
  maritalStatus: optionalEnum(MARITAL_STATUSES),
  nationality: optionalText(60),
  personalEmail: optionalEmail,
  corporateEmail: optionalEmail,
  mobilePhone: optionalText(30),
  emergencyPhone: optionalText(30),
  emergencyContact: optionalText(120),
});

export const companyInfoSchema = z.object({
  consultantId: entityId,
  cnpj: optionalText(20),
  legalName: optionalText(160),
  tradeName: optionalText(160),
  municipalRegistration: optionalText(60),
  stateRegistration: optionalText(60),
  cnaePrimary: optionalText(20),
  taxRegime: optionalText(80),
});

export const LANGUAGE_LEVELS = [
  "BASIC",
  "INTERMEDIATE",
  "ADVANCED",
  "FLUENT",
  "NATIVE",
] as const;
export const EDUCATION_DEGREES = [
  "HIGH_SCHOOL",
  "TECHNICAL",
  "UNDERGRADUATE",
  "POSTGRADUATE",
  "MASTERS",
  "DOCTORATE",
  "OTHER",
] as const;

const optionalYear = z.preprocess(
  (value) => (value === "" || value === null ? undefined : value),
  z.coerce.number().int().min(1950).max(2100).optional(),
);

export const languageSchema = z.object({
  id: optionalText(80),
  consultantId: entityId,
  name: z.string().trim().min(1, "Informe o idioma.").max(60),
  level: z.enum(LANGUAGE_LEVELS),
});

export const educationSchema = z
  .object({
    id: optionalText(80),
    consultantId: entityId,
    institution: z.string().trim().min(1, "Informe a instituicao.").max(160),
    course: z.string().trim().min(1, "Informe o curso.").max(160),
    degree: z.enum(EDUCATION_DEGREES),
    startYear: optionalYear,
    endYear: optionalYear,
    completed: z.boolean().default(false),
  })
  .refine(
    (value) =>
      value.startYear === undefined ||
      value.endYear === undefined ||
      value.endYear >= value.startYear,
    { message: "Ano de conclusao deve ser maior ou igual ao de inicio.", path: ["endYear"] },
  );

export const deleteLanguageSchema = z.object({ id: entityId });
export const deleteEducationSchema = z.object({ id: entityId });

export const CLT_CONTRACT_KINDS = [
  "INDEFINITE",
  "FIXED_TERM",
  "INTERNSHIP",
  "APPRENTICESHIP",
] as const;
export const HOUR_BANK_ENTRY_KINDS = [
  "OVERTIME",
  "COMPENSATION",
  "ADJUSTMENT",
] as const;

const optionalDays = z.preprocess(
  (value) => (value === "" || value === null ? undefined : value),
  z.coerce.number().int().min(0).max(366).optional(),
);

export const cltInfoSchema = z.object({
  consultantId: entityId,
  registrationNumber: optionalText(40),
  pisPasep: optionalText(30),
  ctpsNumber: optionalText(30),
  ctpsSeries: optionalText(20),
  admissionDate: optionalDate,
  dismissalDate: optionalDate,
  contractKind: optionalEnum(CLT_CONTRACT_KINDS),
  workSchedule: optionalText(120),
  workShift: optionalText(120),
  union: optionalText(160),
  registeredRole: optionalText(120),
});

export const vacationSchema = z
  .object({
    id: optionalText(80),
    consultantId: entityId,
    accrualPeriodStart: z.string().trim().min(10).max(10),
    accrualPeriodEnd: z.string().trim().min(10).max(10),
    entitledDays: optionalDays,
    takenDays: optionalDays,
    note: optionalText(300),
  })
  .refine((value) => value.accrualPeriodEnd >= value.accrualPeriodStart, {
    message: "Fim do periodo deve ser maior ou igual ao inicio.",
    path: ["accrualPeriodEnd"],
  })
  .refine(
    (value) => (value.takenDays ?? 0) <= (value.entitledDays ?? 30),
    { message: "Dias gozados nao podem exceder o direito.", path: ["takenDays"] },
  );

export const deleteVacationSchema = z.object({ id: entityId });

export const hourBankEntrySchema = z.object({
  id: optionalText(80),
  consultantId: entityId,
  occurredAt: z.string().trim().min(10).max(10),
  kind: z.enum(HOUR_BANK_ENTRY_KINDS),
  // Valor de horas. OVERTIME/COMPENSATION normalizam o sinal pelo tipo na
  // Server Action; ADJUSTMENT mantem o sinal informado (pode ser negativo).
  hours: z
    .coerce.number()
    .refine((value) => value !== 0, "Informe um valor diferente de zero.")
    .refine((value) => Math.abs(value) <= 9999.99, "Valor de horas muito alto."),
  note: optionalText(300),
});

export const deleteHourBankEntrySchema = z.object({ id: entityId });

export const INVOICE_TYPES = ["NFSE", "NFE", "RPA", "OTHER"] as const;

const optionalMonths = z.preprocess(
  (value) => (value === "" || value === null ? undefined : value),
  z.coerce.number().int().min(0).max(600).optional(),
);

const optionalRate = z.preprocess(
  (value) => (value === "" || value === null ? undefined : value),
  z.coerce.number().min(0).max(100).optional(),
);

export const pjInfoSchema = z.object({
  consultantId: entityId,
  contractStart: optionalDate,
  contractEnd: optionalDate,
  contractTermMonths: optionalMonths,
  autoRenew: z.boolean().default(false),
  issuesInvoice: z.boolean().default(true),
  invoiceType: optionalEnum(INVOICE_TYPES),
  issuingMunicipality: optionalText(120),
  issRate: optionalRate,
});

export const legalRepresentativeSchema = z.object({
  consultantId: entityId,
  name: optionalText(160),
  cpf: optionalText(20),
  email: optionalEmail,
  phone: optionalText(30),
});

export const consultantDocumentUploadSchema = z.object({
  consultantId: entityId,
  type: z.enum(CONSULTANT_DOCUMENT_TYPES),
});

export const consultantDocumentDeleteSchema = z.object({
  documentId: entityId,
});

export const consultantPhotoDeleteSchema = z.object({
  consultantId: entityId,
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

export const AD_HOC_PAYMENT_KINDS = ["BONUS", "ADJUSTMENT", "OTHER"] as const;
export const AD_HOC_PAYMENT_STATUSES = [
  "PLANNED",
  "PAID",
  "CANCELLED",
] as const;

/**
 * Remuneracao pontual do consultor (Onda D / decisao D2). Sempre vinculada a UM
 * projeto (projectId obrigatorio): a pontual entra no custo/margem realizada
 * daquele projeto. `allocationId` e opcional (vinculo fino a uma alocacao).
 * `payAt` e date-only (YYYY-MM-DD), mesma convencao de Expense/Benefit. Dado
 * financeiro: escrita restrita a FINANCIAL_ROLES e sempre auditada.
 */
export const adHocPaymentSchema = z.object({
  id: optionalText(80),
  consultantId: entityId,
  projectId: entityId,
  allocationId: optionalText(80),
  amount: z.coerce.number().positive().max(9_999_999.99),
  payAt: z.string().trim().min(10).max(10),
  reason: z.string().trim().min(1, "Informe o motivo.").max(300),
  kind: z.enum(AD_HOC_PAYMENT_KINDS),
  status: z.enum(AD_HOC_PAYMENT_STATUSES),
});

export const deleteAdHocPaymentSchema = z.object({ id: entityId });

/**
 * M2: valor/hora diferenciado do consultor NUM projeto, com vigência. Quando
 * ativo para a data do lançamento, substitui o `hourlyRate` acordado nesse
 * projeto — no custo/margem e no pagamento. `startsAt`/`endsAt` são date-only
 * (YYYY-MM-DD); `endsAt` opcional (vigência aberta). Dado financeiro: escrita
 * restrita ao grupo de remuneração (role OU matriz) e sempre auditada.
 */
export const projectRateSchema = z
  .object({
    id: optionalText(80),
    consultantId: entityId,
    projectId: entityId,
    hourlyRate: z.coerce.number().positive().max(9_999_999.99),
    startsAt: z.string().trim().min(10).max(10),
    endsAt: z.string().trim().min(10).max(10).optional().or(z.literal("")),
    note: optionalText(300),
  })
  .transform((value) => ({
    ...value,
    endsAt: value.endsAt ? value.endsAt : undefined,
  }))
  .refine((value) => !value.endsAt || value.endsAt >= value.startsAt, {
    message: "A data final deve ser maior ou igual à inicial.",
    path: ["endsAt"],
  });

export const deleteProjectRateSchema = z.object({ id: entityId });

export const lookupInputSchema = z.object({
  consultantId: entityId,
  value: z.string().trim().min(8).max(20),
});

/**
 * Bio curada do curriculo (EP-M06 / US-M06.03). Unica parte NAO-derivada do
 * curriculo. Campos livres e opcionais (sem dados financeiros). Vazio limpa.
 */
export const curriculumBioSchema = z.object({
  consultantId: entityId,
  headline: optionalText(160),
  summary: optionalText(2000),
});

/** Gerar snapshot do curriculo (US-M06.04): congela o agregado atual. */
export const generateCurriculumSnapshotSchema = z.object({
  consultantId: entityId,
});

/** Data ISO (yyyy-mm-dd) obrigatoria. */
const requiredIsoDate = z
  .string()
  .trim()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Informe uma data valida (aaaa-mm-dd).");

/**
 * Campos comuns de uma experiencia profissional DECLARADA (P27 — curriculo-first).
 * Sem NENHUM campo financeiro (nem valor, nem custo). Reaproveitados pela versao
 * de People (com consultantId) e pela versao de autosservico (sem consultantId).
 */
const experienceFields = {
  company: z.string().trim().min(1, "Informe a empresa.").max(160),
  role: z.string().trim().min(1, "Informe o cargo.").max(160),
  startDate: requiredIsoDate,
  endDate: optionalDate,
  description: optionalText(2000),
  location: optionalText(160),
};

/** `endDate` vazio = experiencia atual; quando existe, nao pode ser antes do inicio. */
const experienceEndAfterStart = (value: {
  startDate: string;
  endDate?: string;
}): boolean => value.endDate === undefined || value.endDate >= value.startDate;

const experienceEndError = {
  message: "A data de termino nao pode ser anterior ao inicio.",
  path: ["endDate"],
};

/** Experiencia declarada gerenciada por People/RH (consultantId explicito). */
export const experienceSchema = z
  .object({ id: optionalText(80), consultantId: entityId, ...experienceFields })
  .refine(experienceEndAfterStart, experienceEndError);

/**
 * Experiencia declarada no autosservico do consultor: NUNCA aceita consultantId
 * do cliente (o dono e resolvido do usuario logado no servidor).
 */
export const myExperienceSchema = z
  .object({ id: optionalText(80), ...experienceFields })
  .refine(experienceEndAfterStart, experienceEndError);

export const deleteExperienceSchema = z.object({ id: entityId });

export type ConsultantIdentityInput = z.infer<typeof consultantIdentitySchema>;
export type ConsultantSeniority = (typeof SENIORITIES)[number];
export type ConsultantStatusValue = (typeof CONSULTANT_STATUSES)[number];
// Tipo de ENTRADA (boundary da action): campos com default podem ser omitidos.
export type CreateConsultantInput = z.input<typeof createConsultantSchema>;
export type PersonalInfoInput = z.infer<typeof personalInfoSchema>;
export type CompanyInfoInput = z.infer<typeof companyInfoSchema>;
export type ConsultantDocumentUploadInput = z.infer<
  typeof consultantDocumentUploadSchema
>;
export type ConsultantDocumentType = (typeof CONSULTANT_DOCUMENT_TYPES)[number];
export type ConsultantContractType = (typeof CONTRACT_TYPES)[number];
export type Gender = (typeof GENDERS)[number];
export type MaritalStatus = (typeof MARITAL_STATUSES)[number];
export type LanguageInput = z.infer<typeof languageSchema>;
export type EducationInput = z.infer<typeof educationSchema>;
export type LanguageLevel = (typeof LANGUAGE_LEVELS)[number];
export type EducationDegree = (typeof EDUCATION_DEGREES)[number];
export type CltInfoInput = z.infer<typeof cltInfoSchema>;
export type VacationInput = z.infer<typeof vacationSchema>;
export type HourBankEntryInput = z.infer<typeof hourBankEntrySchema>;
export type CltContractKind = (typeof CLT_CONTRACT_KINDS)[number];
export type HourBankEntryKind = (typeof HOUR_BANK_ENTRY_KINDS)[number];
export type PjInfoInput = z.infer<typeof pjInfoSchema>;
export type LegalRepresentativeInput = z.infer<typeof legalRepresentativeSchema>;
export type InvoiceType = (typeof INVOICE_TYPES)[number];
export type AddressInput = z.infer<typeof addressSchema>;
export type BankAccountInput = z.infer<typeof bankAccountSchema>;
export type CompensationInput = z.infer<typeof compensationSchema>;
export type BenefitInput = z.infer<typeof benefitSchema>;
export type VoucherBenefitsInput = z.infer<typeof voucherBenefitsSchema>;
export type AdHocPaymentInput = z.infer<typeof adHocPaymentSchema>;
export type AdHocPaymentKind = (typeof AD_HOC_PAYMENT_KINDS)[number];
export type AdHocPaymentStatus = (typeof AD_HOC_PAYMENT_STATUSES)[number];
// Saída pós-transform (hourlyRate: number, endsAt: string | undefined),
// consistente com AdHocPaymentInput; o form e a action usam esta forma.
export type ProjectRateInput = z.infer<typeof projectRateSchema>;
export type CurriculumBioInput = z.infer<typeof curriculumBioSchema>;
// Tipo de ENTRADA (boundary da action): campos opcionais podem ser omitidos.
export type ExperienceInput = z.input<typeof experienceSchema>;
export type MyExperienceInput = z.input<typeof myExperienceSchema>;
export type GenerateCurriculumSnapshotInput = z.infer<
  typeof generateCurriculumSnapshotSchema
>;

/** Maps the pt-BR voucher shortcut keys to ConsultantBenefit.type values. */
export const VOUCHER_TYPE_BY_KEY = {
  vr: "MEAL_VOUCHER",
  va: "FOOD_VOUCHER",
  vt: "TRANSPORTATION_VOUCHER",
} as const;

export type VoucherKey = keyof typeof VOUCHER_TYPE_BY_KEY;

