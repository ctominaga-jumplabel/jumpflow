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

// Data-only estrita (YYYY-MM-DD) que também precisa ser um dia de calendário
// real (ex.: rejeita 2026-02-31). Evita vazar erro do Prisma como UNEXPECTED
// quando o valor não é uma data válida.
const strictDateOnly = z
  .string()
  .trim()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Informe uma data no formato AAAA-MM-DD.")
  .refine((value) => {
    const [year, month, day] = value.split("-").map(Number);
    const date = new Date(Date.UTC(year, month - 1, day));
    return (
      date.getUTCFullYear() === year &&
      date.getUTCMonth() === month - 1 &&
      date.getUTCDate() === day
    );
  }, "Data invalida.");

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
    status: z.enum(["PROPOSAL", "ACTIVE", "PAUSED", "CLOSED", "CANCELLED"]),
    startDate: z.string().trim().min(10).max(10),
    endDate: optionalDate,
    managerUserId: optionalText(80),
    billingTypeId: optionalCuid,
    billingHourlyRate: optionalNumber,
    budgetHours: optionalNumber,
    costCenter: optionalText(80),
    // Flag INFORMATIVA de termo de aceite (operacional). Default false mantém a
    // chave opcional no tipo inferido; nunca bloqueia lançamento/faturamento.
    requiresAcceptanceTerm: z.boolean().default(false),
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
  // Sem transform: mantém a chave opcional no tipo inferido (form converte ""→undefined).
  commercialContractRef: z.string().trim().max(120).optional(),
});

// Tipo de cobrança por projeto, editado pelo Financeiro junto da regra de
// cobrança (o BillingType define o chargeType que o motor consome). Patch
// isolado para não tocar nos campos comerciais (budget/valor de venda).
export const projectBillingTypeSchema = z.object({
  id: entityId,
  billingTypeId: optionalCuid,
});

// Tipo/condição de pagamento do cliente (prazo/arranjo). Campo comercial,
// isolado para não tocar os demais campos do projeto. Opcional: "" → undefined
// (grava null no banco). Gated por SALE_RATE_ROLES na action.
export const projectPaymentTypeSchema = z.object({
  id: entityId,
  paymentType: z.preprocess(
    (value) => (value === "" || value === null ? undefined : value),
    z.enum(["ONE_TIME", "INSTALLMENTS", "MONTHLY", "ON_MILESTONE"]).optional(),
  ),
});

// Tipo de oportunidade de origem (classificação do projeto). Vem do CRM, mas é
// sobrescrevível manualmente. Patch isolado (não toca os demais campos do
// projeto). Opcional: "" → undefined (grava null no banco). Gated pelo mesmo
// papel do tipo de pagamento (SALE_RATE_ROLES) na action.
export const projectOpportunityTypeSchema = z.object({
  id: entityId,
  opportunityType: z.preprocess(
    (value) => (value === "" || value === null ? undefined : value),
    z
      .enum([
        "PROJECT",
        "ALLOCATION",
        "SQUAD",
        "LICENSING",
        "BPO",
        "SUPPORT",
        "OTHER",
      ])
      .optional(),
  ),
});

// Marca o termo de aceite (INFORMATIVO) como aceito. Operacional
// (PROJECT_WRITE_ROLES); grava data + usuário atual. Não bloqueia nada.
export const projectAcceptanceTermSchema = z.object({ id: entityId });

// Recebimento previsto do cliente (ProjectReceivableSchedule — lado receita).
// Data (date-only), valor, rótulo e situação. Dado financeiro: gated por
// SALE_RATE_ROLES/FINANCIAL_ROLES e auditado.
export const receivableInputSchema = z.object({
  projectId: entityId,
  dueAt: strictDateOnly,
  amount: z.coerce.number().positive().max(9999999999.99),
  label: z.string().trim().min(1).max(120),
  status: z.enum(["FORECAST", "RECEIVED", "CANCELLED"]).default("FORECAST"),
  // `.optional()` extra mantém a chave opcional no tipo inferido (o transform de
  // optionalText, sozinho, a tornaria obrigatória com valor string|undefined).
  note: optionalText(300).optional(),
});

export const receivableUpdateSchema = receivableInputSchema.extend({
  id: entityId,
});

export const receivableRemoveSchema = z.object({ id: entityId });

// Acompanhamento do projeto (Onda C): leitura de margem/custo/receita de um
// projeto. Só o id do projeto entra; o RBAC/escopo (D5) é aplicado na action.
export const projectTrackingInputSchema = z.object({ projectId: entityId });
export type ProjectTrackingRequestInput = z.infer<
  typeof projectTrackingInputSchema
>;

export type ProjectPaymentTypeInput = z.infer<typeof projectPaymentTypeSchema>;
export type ProjectOpportunityTypeInput = z.infer<
  typeof projectOpportunityTypeSchema
>;
export type ProjectAcceptanceTermInput = z.infer<
  typeof projectAcceptanceTermSchema
>;
export type ReceivableInput = z.infer<typeof receivableInputSchema>;
export type ReceivableUpdateInput = z.infer<typeof receivableUpdateSchema>;

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
  // Hora extra (3.2) e cobranca em ferias (3.5).
  overtimeAppliesTo: z.enum(["NONE", "CLT", "PJ", "BOTH"]).default("NONE"),
  overtimeBillingPct: optionalPercent,
  overtimeExcessHours: optionalNumber,
  overtimeExcessRate: optionalNumber,
  billDuringVacation: z.boolean().default(true),
  notes: optionalText(500),
});

// Aprovacao automatica por projeto / consultor. As duas excecoes (fim de
// semana e range de horas) combinam por OU. O range usa minutos (00:01 = 1,
// 23:59 = 1439); nunca 00:00 e max >= min. A UI converte de/para HH:mm.
const minuteOfDay = z.coerce
  .number()
  .int()
  .min(1, "Não use 00:00.")
  .max(1439, "Máximo 23:59.");

const autoApprovalRuleFields = {
  weekendEnabled: z.boolean(),
  hoursRangeEnabled: z.boolean(),
  minMinutes: minuteOfDay,
  maxMinutes: minuteOfDay,
};

const refineMaxGteMin = (value: { minMinutes: number; maxMinutes: number }) =>
  value.maxMinutes >= value.minMinutes;

export const projectAutoApprovalRuleSchema = z
  .object({ projectId: entityId, ...autoApprovalRuleFields })
  .refine(refineMaxGteMin, {
    message: "Máximo deve ser maior ou igual ao mínimo.",
    path: ["maxMinutes"],
  });

export const consultantAutoApprovalRuleSchema = z
  .object({ consultantId: entityId, projectId: entityId, ...autoApprovalRuleFields })
  .refine(refineMaxGteMin, {
    message: "Máximo deve ser maior ou igual ao mínimo.",
    path: ["maxMinutes"],
  });

export const linkAutoApprovalConsultantsSchema = z.object({
  projectId: entityId,
  consultantIds: z.array(entityId).min(1, "Selecione ao menos um consultor."),
});

export const removeConsultantAutoApprovalRuleSchema = z.object({ id: entityId });

export const setProjectAutoApprovalActiveSchema = z.object({
  projectId: entityId,
  active: z.boolean(),
});

export const setConsultantAutoApprovalActiveSchema = z.object({
  id: entityId,
  active: z.boolean(),
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

// Cost rate (what we PAY) for a consultant on a specific allocation, with
// vigência. Allocation-scoped only (the allocation implies project+consultant).
// Mirrors the sale-rate shape; FINANCIAL_ROLES only.
export const costRateInputSchema = z
  .object({
    allocationId: entityId,
    startsAt: z.string().trim().min(10).max(10),
    endsAt: optionalDate,
    hourlyCost: z.coerce.number().positive().max(999999.99),
    currency: z.string().trim().length(3).default("BRL"),
    note: optionalText(300),
  })
  .refine((value) => !value.endsAt || value.endsAt > value.startsAt, {
    message: "Fim da vigencia deve ser maior que o inicio.",
    path: ["endsAt"],
  });

export const costRateUpdateSchema = costRateInputSchema.extend({
  id: entityId,
});
export const costRateRemoveSchema = z.object({ id: entityId });

export type CostRateInput = z.infer<typeof costRateInputSchema>;
export type CostRateUpdateInput = z.infer<typeof costRateUpdateSchema>;

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
export type ProjectAutoApprovalRuleInput = z.infer<
  typeof projectAutoApprovalRuleSchema
>;
export type ConsultantAutoApprovalRuleInput = z.infer<
  typeof consultantAutoApprovalRuleSchema
>;
export type LinkAutoApprovalConsultantsInput = z.infer<
  typeof linkAutoApprovalConsultantsSchema
>;
export type SetProjectAutoApprovalActiveInput = z.infer<
  typeof setProjectAutoApprovalActiveSchema
>;
export type SetConsultantAutoApprovalActiveInput = z.infer<
  typeof setConsultantAutoApprovalActiveSchema
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
