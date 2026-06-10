import { z } from "zod";
import { parseIsoDateUtc } from "@/lib/timesheet/week";

/**
 * Shared Zod schemas for the Despesas server actions (and their tests).
 * The server is the validation authority; client-side checks are a
 * pre-flight convenience only.
 */

/**
 * Entity ids. Seeded validation data uses human-readable ids (e.g.
 * "seed-exp-draft"), so we only require a non-empty string and let the
 * database resolve existence.
 */
const idSchema = z.string().trim().min(1, "Identificador obrigatório.");

const isoDateSchema = z
  .string()
  .refine((value) => parseIsoDateUtc(value) !== null, {
    message: "Data inválida (use o formato aaaa-mm-dd).",
  });

const amountSchema = z
  .number()
  .gt(0, "Valor deve ser maior que zero.")
  .lte(999999.99, "Valor máximo é R$ 999.999,99.")
  .refine((value) => Math.abs(value * 100 - Math.round(value * 100)) < 1e-9, {
    message: "Use no máximo 2 casas decimais.",
  });

const descriptionSchema = z
  .string()
  .trim()
  .min(1, "Descreva a despesa.")
  .max(500, "Descrição deve ter no máximo 500 caracteres.");

const invoiceNumberSchema = z
  .string()
  .trim()
  .max(60, "Número da nota fiscal deve ter no máximo 60 caracteres.")
  .optional();

export const expenseInputSchema = z.object({
  projectId: idSchema,
  date: isoDateSchema,
  amount: amountSchema,
  description: descriptionSchema,
  invoiceNumber: invoiceNumberSchema,
});

export type ExpenseInput = z.infer<typeof expenseInputSchema>;

export const updateExpenseInputSchema = z.object({
  id: idSchema,
  /** Optional move to another project (re-checks allocation). */
  projectId: idSchema.optional(),
  /** Optional date change (re-checks allocation coverage). */
  date: isoDateSchema.optional(),
  amount: amountSchema,
  description: descriptionSchema,
  invoiceNumber: invoiceNumberSchema,
});

export type UpdateExpenseInput = z.infer<typeof updateExpenseInputSchema>;

export const expenseIdInputSchema = z.object({ id: idSchema });

export type ExpenseIdInput = z.infer<typeof expenseIdInputSchema>;

/** Marker used by actions to map the comment issue to COMMENT_REQUIRED. */
export const COMMENT_REQUIRED_MESSAGE =
  "Comentário é obrigatório para reprovar.";

export const decideExpenseSchema = z
  .object({
    expenseId: idSchema,
    decision: z.enum(["APPROVED", "REJECTED"]),
    comment: z.string(),
  })
  .superRefine((value, ctx) => {
    if (value.decision === "REJECTED" && value.comment.trim().length === 0) {
      ctx.addIssue({
        code: "custom",
        path: ["comment"],
        message: COMMENT_REQUIRED_MESSAGE,
      });
    }
  });

export type DecideExpenseInput = z.infer<typeof decideExpenseSchema>;

/** Marker used by actions to map the reason issue to COMMENT_REQUIRED. */
export const REASON_REQUIRED_MESSAGE =
  "Motivo é obrigatório para cancelar o agendamento.";

export const setPaymentSchema = z
  .object({
    expenseId: idSchema,
    action: z.enum(["SCHEDULE", "MARK_PAID", "CANCEL_SCHEDULE"]),
    reason: z.string().optional(),
  })
  .superRefine((value, ctx) => {
    if (
      value.action === "CANCEL_SCHEDULE" &&
      (value.reason ?? "").trim().length === 0
    ) {
      ctx.addIssue({
        code: "custom",
        path: ["reason"],
        message: REASON_REQUIRED_MESSAGE,
      });
    }
  });

export type SetPaymentInput = z.infer<typeof setPaymentSchema>;

export const receiptInputSchema = z.object({ expenseId: idSchema });

export type ReceiptInput = z.infer<typeof receiptInputSchema>;
