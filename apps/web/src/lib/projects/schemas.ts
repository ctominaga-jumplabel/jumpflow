import { z } from "zod";

// Entity ids are opaque strings. Prisma generates cuids for new rows, but
// seeded/imported data may use readable ids (e.g. "seed-project-portal").
// Referential integrity is enforced by the database FK and the `where: { id }`
// lookup, so we only sanity-check shape here instead of forcing the cuid format
// (which silently rejected every update against seeded rows).
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

const optionalCuid = z
  .string()
  .trim()
  .optional()
  .transform((value) => (value ? value : undefined))
  .pipe(entityId.optional());

const optionalDate = z
  .string()
  .trim()
  .optional()
  .transform((value) => (value ? value : undefined));

const optionalNumber = z.preprocess(
  (value) => (value === "" || value === null ? undefined : value),
  z.coerce.number().nonnegative().optional(),
);

const optionalPercent = z.preprocess(
  (value) => (value === "" || value === null ? undefined : value),
  z.coerce.number().min(0).max(100).optional(),
);

const optionalDayOfMonth = z.preprocess(
  (value) => (value === "" || value === null ? undefined : value),
  z.coerce.number().int().min(1).max(31).optional(),
);

export const projectInputSchema = z
  .object({
    clientId: entityId,
    name: z.string().trim().min(2).max(120),
    description: optionalText(500),
    status: z.enum(["PROPOSAL", "ACTIVE", "PAUSED", "CLOSED"]),
    startDate: z.string().trim().min(10).max(10),
    endDate: optionalDate,
    managerUserId: optionalText(80),
    billingTypeId: optionalCuid,
    billingHourlyRate: optionalNumber,
    budgetHours: optionalNumber,
    costCenter: optionalText(80),
  })
  .refine((value) => !value.endDate || value.endDate >= value.startDate, {
    message: "Data final deve ser maior ou igual ao inicio.",
    path: ["endDate"],
  });

export const projectUpdateSchema = projectInputSchema.extend({
  id: entityId,
});

// Campos comerciais do projeto, editados na superfície Comercial (separados do
// ciclo de vida operacional). Tipo de cobrança e budget de horas; o valor de
// venda por vigência fica em ProjectSaleRate (saleRate schemas abaixo).
export const projectCommercialSchema = z.object({
  id: entityId,
  billingTypeId: optionalCuid,
  budgetHours: optionalNumber,
});

// Tipo de cobrança por projeto, editado pelo Financeiro junto da regra de
// cobrança (o BillingType define o chargeType que o motor consome). Patch
// isolado para não tocar nos campos comerciais (budget/valor de venda).
export const projectBillingTypeSchema = z.object({
  id: entityId,
  billingTypeId: optionalCuid,
});

// Configuracao de cobranca por projeto (motor de regras parametrizavel).
// Editada pelo Financeiro. Todos os parametros numericos sao opcionais: cada
// tipo de cobranca usa apenas os que fazem sentido (ex.: HOUR_PACKAGE usa
// includedHours + overageRate; MONTHLY usa fixedAmount).
export const projectBillingConfigSchema = z.object({
  projectId: entityId,
  periodicity: z.enum(["MONTHLY", "BIWEEKLY", "WEEKLY", "PER_EVENT"]),
  roundingRule: z.enum([
    "NONE",
    "NEAREST_15_MINUTES",
    "NEAREST_30_MINUTES",
    "NEAREST_HOUR",
    "CEIL_15_MINUTES",
    "CEIL_30_MINUTES",
    "CEIL_HOUR",
  ]),
  fixedAmount: optionalNumber,
  includedHours: optionalNumber,
  overageRate: optionalNumber,
  overageTreatment: z.enum([
    "BILL_EXTRA",
    "BLOCK_AT_LIMIT",
    "INCLUDE_FREE",
    "CARRY_OVER",
  ]),
  perConsultantAmount: optionalNumber,
  reimbursableExpenses: z.boolean(),
  reimbursableMarkupPct: optionalPercent,
  discountPct: optionalPercent,
  penaltyPct: optionalPercent,
  adjustmentIndex: z.enum(["NONE", "IPCA", "IGPM", "CDI", "FIXED"]),
  adjustmentPct: optionalPercent,
  withholdIss: z.boolean(),
  withholdingPct: optionalPercent,
  closingDay: optionalDayOfMonth,
  dueDay: optionalDayOfMonth,
  requireApproval: z.boolean(),
  notes: optionalText(500),
});

export const allocationInputSchema = z
  .object({
    projectId: entityId,
    consultantId: entityId,
    role: z.string().trim().min(2).max(80),
    allocationPercent: z.coerce.number().int().min(1).max(100),
    startDate: z.string().trim().min(10).max(10),
    endDate: optionalDate,
    status: z.enum(["ACTIVE", "PLANNED", "ENDED", "CANCELLED", "INACTIVE"]),
  })
  .refine((value) => !value.endDate || value.endDate >= value.startDate, {
    message: "Data final deve ser maior ou igual ao inicio.",
    path: ["endDate"],
  });

export const allocationUpdateSchema = allocationInputSchema.extend({
  id: entityId,
});

export const allocationRemoveSchema = z.object({ id: entityId });

export const saleRateInputSchema = z
  .object({
    projectId: entityId,
    consultantId: optionalCuid,
    allocationId: optionalCuid,
    startsAt: z.string().trim().min(10).max(10),
    endsAt: optionalDate,
    hourlyRate: z.coerce.number().positive().max(999999.99),
    currency: z.string().trim().length(3).default("BRL"),
    note: optionalText(300),
  })
  .refine((value) => !value.endsAt || value.endsAt > value.startsAt, {
    message: "Fim da vigencia deve ser maior que o inicio.",
    path: ["endsAt"],
  })
  .refine((value) => !(value.consultantId && value.allocationId), {
    message: "Escolha consultor ou alocacao, nao ambos.",
    path: ["allocationId"],
  });

export const saleRateUpdateSchema = saleRateInputSchema.extend({
  id: entityId,
});

const skillLevel = z.enum(["BASIC", "INTERMEDIATE", "ADVANCED", "SPECIALIST"]);

const optionalSkillLevel = z.preprocess(
  (value) => (value === "" || value === null ? undefined : value),
  skillLevel.optional(),
);

// Skill tagged on a specific Allocation (consultant on a project). This is a
// catalog Skill reference scoped to the allocation; it is intentionally
// independent from ConsultantSkill (the consultant's validated profile).
// `level`/`note` keys stay optional (may be omitted entirely) while empty
// strings normalize to undefined.
export const allocationSkillInputSchema = z.object({
  allocationId: entityId,
  skillId: entityId,
  level: optionalSkillLevel.optional(),
  note: optionalText(300).optional(),
});

export const allocationSkillRemoveSchema = z.object({
  id: entityId,
});

export const allocationSkillUpdateSchema = z.object({
  id: entityId,
  level: optionalSkillLevel.optional(),
  note: optionalText(300).optional(),
});

export type ProjectInput = z.infer<typeof projectInputSchema>;
export type ProjectUpdateInput = z.infer<typeof projectUpdateSchema>;
export type ProjectCommercialInput = z.infer<typeof projectCommercialSchema>;
export type ProjectBillingTypeInput = z.infer<typeof projectBillingTypeSchema>;
export type ProjectBillingConfigInput = z.infer<
  typeof projectBillingConfigSchema
>;
export type AllocationInput = z.infer<typeof allocationInputSchema>;
export type AllocationUpdateInput = z.infer<typeof allocationUpdateSchema>;
export type AllocationRemoveInput = z.infer<typeof allocationRemoveSchema>;
export type SaleRateInput = z.infer<typeof saleRateInputSchema>;
export type SaleRateUpdateInput = z.infer<typeof saleRateUpdateSchema>;
export type AllocationSkillInput = z.infer<typeof allocationSkillInputSchema>;
export type AllocationSkillRemoveInput = z.infer<
  typeof allocationSkillRemoveSchema
>;
export type AllocationSkillUpdateInput = z.infer<
  typeof allocationSkillUpdateSchema
>;
