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

const nullableNumber = z.preprocess(
  (value) => (value === "" || value === null ? undefined : value),
  z.coerce.number().nonnegative().optional(),
);

const dayOfMonth = z.preprocess(
  (value) => (value === "" || value === null ? undefined : value),
  z.coerce.number().int().min(1).max(31).optional(),
);

export const clientInputSchema = z.object({
  name: z.string().trim().min(2).max(120),
  document: optionalText(20),
  logoUrl: optionalText(500),
  billingTypeId: optionalText(80),
  defaultHourlyRate: nullableNumber,
  monthlyFee: nullableNumber,
  hourLimit: nullableNumber,
  roundingRule: z.enum([
    "NONE",
    "NEAREST_15_MINUTES",
    "NEAREST_30_MINUTES",
    "NEAREST_HOUR",
    "CEIL_15_MINUTES",
    "CEIL_30_MINUTES",
    "CEIL_HOUR",
  ]),
  billingDay: dayOfMonth,
  dueDay: dayOfMonth,
  invoiceKind: z.enum(["SERVICE", "PRODUCT"]),
  municipality: optionalText(120),
  issRate: z.preprocess(
    (value) => (value === "" || value === null ? undefined : value),
    z.coerce.number().min(0).max(100).optional(),
  ),
  taxRules: optionalText(1000),
  status: z.enum(["ACTIVE", "INACTIVE"]),
});

export const clientUpdateSchema = clientInputSchema.extend({
  id: entityId,
});

export const billingTypeInputSchema = z.object({
  name: z.string().trim().min(2).max(80),
  chargeType: z.enum(["HOURLY", "MONTHLY", "CONSULTANT_HOURLY", "FIXED"]),
  roundingRule: z.enum([
    "NONE",
    "NEAREST_15_MINUTES",
    "NEAREST_30_MINUTES",
    "NEAREST_HOUR",
    "CEIL_15_MINUTES",
    "CEIL_30_MINUTES",
    "CEIL_HOUR",
  ]),
  description: optionalText(300),
  active: z.boolean(),
});

export const billingTypeUpdateSchema = billingTypeInputSchema.extend({
  id: entityId,
});

export const cnpjLookupSchema = z.object({
  document: z
    .string()
    .trim()
    .min(8)
    .max(20)
    .transform((value) => value.replace(/\D/g, "")),
});

export type ClientInput = z.infer<typeof clientInputSchema>;
export type ClientUpdateInput = z.infer<typeof clientUpdateSchema>;
export type BillingTypeInput = z.infer<typeof billingTypeInputSchema>;
export type BillingTypeUpdateInput = z.infer<typeof billingTypeUpdateSchema>;

