import { z } from "zod";

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
  .pipe(z.string().cuid().optional());

const optionalDate = z
  .string()
  .trim()
  .optional()
  .transform((value) => (value ? value : undefined));

const optionalNumber = z.preprocess(
  (value) => (value === "" || value === null ? undefined : value),
  z.coerce.number().nonnegative().optional(),
);

export const projectInputSchema = z
  .object({
    clientId: z.string().cuid(),
    name: z.string().trim().min(2).max(120),
    description: optionalText(500),
    status: z.enum(["PROPOSAL", "ACTIVE", "PAUSED", "CLOSED"]),
    startDate: z.string().trim().min(10).max(10),
    endDate: optionalDate,
    managerUserId: optionalText(80),
    billingHourlyRate: optionalNumber,
    budgetHours: optionalNumber,
    costCenter: optionalText(80),
  })
  .refine((value) => !value.endDate || value.endDate >= value.startDate, {
    message: "Data final deve ser maior ou igual ao inicio.",
    path: ["endDate"],
  });

export const projectUpdateSchema = projectInputSchema.extend({
  id: z.string().cuid(),
});

export const allocationInputSchema = z
  .object({
    projectId: z.string().cuid(),
    consultantId: z.string().cuid(),
    role: z.string().trim().min(2).max(80),
    allocationPercent: z.coerce.number().int().min(1).max(100),
    startDate: z.string().trim().min(10).max(10),
    endDate: optionalDate,
    status: z.enum(["ACTIVE", "PLANNED", "ENDED", "CANCELLED"]),
  })
  .refine((value) => !value.endDate || value.endDate >= value.startDate, {
    message: "Data final deve ser maior ou igual ao inicio.",
    path: ["endDate"],
  });

export const allocationUpdateSchema = allocationInputSchema.extend({
  id: z.string().cuid(),
});

export const saleRateInputSchema = z
  .object({
    projectId: z.string().cuid(),
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
  id: z.string().cuid(),
});

export type ProjectInput = z.infer<typeof projectInputSchema>;
export type ProjectUpdateInput = z.infer<typeof projectUpdateSchema>;
export type AllocationInput = z.infer<typeof allocationInputSchema>;
export type AllocationUpdateInput = z.infer<typeof allocationUpdateSchema>;
export type SaleRateInput = z.infer<typeof saleRateInputSchema>;
export type SaleRateUpdateInput = z.infer<typeof saleRateUpdateSchema>;
