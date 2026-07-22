import { z } from "zod";
import { EXPENSE_CATEGORIES, type ExpenseCategory } from "./types";

/**
 * Schemas Zod compartilhados das server actions da Politica de Reembolso
 * (Onda 3, P12). Apenas valores puros (sem "use server"), seguros para importar
 * do cliente e dos testes. O servidor e a autoridade de validacao.
 */

const idSchema = z.string().trim().min(1, "Identificador obrigatorio.");

/**
 * Categoria opcional: `null` (regra Geral) OU um valor do enum. O formulario
 * envia string vazia para "Geral"; o preprocess converte para null.
 */
const categorySchema = z.preprocess(
  (value) => (value === "" || value === undefined ? null : value),
  z
    .enum(EXPENSE_CATEGORIES as unknown as [ExpenseCategory, ...ExpenseCategory[]])
    .nullable(),
);

const maxAgeDaysSchema = z.preprocess(
  (value) =>
    value === "" || value === null || value === undefined
      ? null
      : Number(value),
  z
    .number()
    .int("Prazo deve ser um numero inteiro de dias.")
    .gt(0, "Prazo deve ser maior que zero.")
    .lte(3650, "Prazo maximo e 3650 dias.")
    .nullable(),
);

const maxAmountSchema = z.preprocess(
  (value) =>
    value === "" || value === null || value === undefined
      ? null
      : Number(value),
  z
    .number()
    .gt(0, "Teto deve ser maior que zero.")
    .lte(999999.99, "Teto maximo e R$ 999.999,99.")
    .refine((v) => Math.abs(v * 100 - Math.round(v * 100)) < 1e-9, {
      message: "Use no maximo 2 casas decimais.",
    })
    .nullable(),
);

const notesSchema = z
  .string()
  .trim()
  .max(500, "Observacao deve ter no maximo 500 caracteres.")
  .optional();

export const reimbursementPolicyInputSchema = z
  .object({
    category: categorySchema,
    maxAgeDays: maxAgeDaysSchema,
    maxAmount: maxAmountSchema,
    active: z.boolean().default(true),
    notes: notesSchema,
  })
  .superRefine((value, ctx) => {
    // Uma regra sem nenhum limite nao restringe nada — recuse para evitar lixo.
    if (value.maxAgeDays === null && value.maxAmount === null) {
      ctx.addIssue({
        code: "custom",
        path: ["maxAmount"],
        message: "Informe ao menos um limite (prazo ou valor).",
      });
    }
  });

export type ReimbursementPolicyInput = z.infer<
  typeof reimbursementPolicyInputSchema
>;

export const updateReimbursementPolicySchema = z
  .object({ id: idSchema })
  .and(reimbursementPolicyInputSchema);

export type UpdateReimbursementPolicyInput = z.infer<
  typeof updateReimbursementPolicySchema
>;

export const reimbursementPolicyIdSchema = z.object({ id: idSchema });

export type ReimbursementPolicyIdInput = z.infer<
  typeof reimbursementPolicyIdSchema
>;
