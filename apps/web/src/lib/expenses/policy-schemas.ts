import { z } from "zod";

/**
 * Schemas Zod compartilhados das server actions da Politica de Reembolso
 * (Onda 3, P12). Apenas valores puros (sem "use server"), seguros para importar
 * do cliente e dos testes. O servidor e a autoridade de validacao.
 */

const idSchema = z.string().trim().min(1, "Identificador obrigatorio.");

/**
 * Categoria opcional: `null` (regra Geral) OU um código de ExpenseType. O
 * formulario envia string vazia para "Geral"; o preprocess converte para null.
 * A existencia do codigo e validada no servidor contra o registro.
 */
const categorySchema = z.preprocess(
  (value) => (value === "" || value === undefined ? null : value),
  z.string().trim().min(1).max(80).nullable(),
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

// --- Cadastro de tipos de despesa (ExpenseType, item 12) --------------------

const expenseTypeLabelSchema = z
  .string()
  .trim()
  .min(2, "Informe o nome do tipo de despesa.")
  .max(60, "Nome deve ter no máximo 60 caracteres.");

export const createExpenseTypeSchema = z.object({
  label: expenseTypeLabelSchema,
  active: z.boolean().default(true),
});

export type CreateExpenseTypeInput = z.infer<typeof createExpenseTypeSchema>;

export const updateExpenseTypeSchema = z.object({
  id: idSchema,
  label: expenseTypeLabelSchema,
  active: z.boolean(),
});

export type UpdateExpenseTypeInput = z.infer<typeof updateExpenseTypeSchema>;

export const expenseTypeIdSchema = z.object({ id: idSchema });

export type ExpenseTypeIdInput = z.infer<typeof expenseTypeIdSchema>;

/**
 * Deriva um código estável (UPPER_SNAKE, ASCII) a partir do rótulo. Puro para
 * ser testável; o servidor garante unicidade (sufixo _2, _3, …). Ex.:
 * "Alimentação em viagem" → "ALIMENTACAO_EM_VIAGEM".
 */
export function slugifyExpenseTypeCode(label: string): string {
  const ascii = label
    .normalize("NFD") // separa acentos das letras base
    .replace(/[^\x00-\x7f]/g, "") // remove tudo que não é ASCII (os acentos)
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
  return ascii || "TIPO";
}
