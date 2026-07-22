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

// Empty input becomes undefined (field is optional); a non-empty value must be
// a valid e-mail. Mirrors the optionalText shape used by the other fields.
const optionalEmail = z.preprocess(
  (value) =>
    typeof value === "string" && value.trim() === "" ? undefined : value,
  z.string().trim().max(254).email().optional(),
);

const nullableNumber = z.preprocess(
  (value) => (value === "" || value === null ? undefined : value),
  z.coerce.number().nonnegative().optional(),
);

const dayOfMonth = z.preprocess(
  (value) => (value === "" || value === null ? undefined : value),
  z.coerce.number().int().min(1).max(31).optional(),
);

// Lista de e-mails de cobranca (P4). Aceita tanto um array (UI de chips) quanto
// um texto multi-linha/virgula (textarea): normaliza para array, apara espacos,
// descarta vazios e valida o formato de cada e-mail. Vazio => [] (usa o
// contactEmail no envio da pre-fatura).
const emailList = z
  .preprocess((value) => {
    if (Array.isArray(value)) {
      return value
        .map((item) => (typeof item === "string" ? item.trim() : item))
        .filter((item) => item !== "");
    }
    if (typeof value === "string") {
      return value
        .split(/[\n,;]+/)
        .map((item) => item.trim())
        .filter((item) => item !== "");
    }
    if (value === null || value === undefined) return [];
    return value;
  }, z.array(z.string().max(254).email()).max(50))
  .default([]);

export const clientInputSchema = z.object({
  name: z.string().trim().min(2).max(120),
  document: optionalText(20),
  contactEmail: optionalEmail,
  billingEmails: emailList,
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
  chargeType: z.enum([
    "HOURLY",
    "MONTHLY",
    "CONSULTANT_HOURLY",
    "FIXED",
    "HOURLY_PLUS_FIXED",
    "HOUR_PACKAGE",
    "PER_ALLOCATED_CONSULTANT",
    "PER_PROJECT",
    "MILESTONE",
    "PER_SPRINT",
    "TIME_AND_MATERIAL",
    "ON_DEMAND",
    "SUBSCRIPTION",
    "PAY_AS_YOU_GO",
    "SUCCESS_FEE",
    "MIXED",
  ]),
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
  howItWorks: optionalText(400),
  example: optionalText(400),
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

