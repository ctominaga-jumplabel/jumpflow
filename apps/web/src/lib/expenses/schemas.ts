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

/**
 * Lançamento "em nome de" (on-behalf): id do consultor-alvo. Opcional — presente
 * só quando um Gestor de Área/Admin lança despesas por outro consultor. A
 * AUTORIZAÇÃO e a existência do consultor são reforçadas no servidor
 * (resolveActingConsultant); aqui só carregamos o id.
 */
const onBehalfField = {
  onBehalfOfConsultantId: idSchema.optional(),
} as const;

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

// Categoria = código de um ExpenseType (registro no banco). A EXISTÊNCIA do
// código (e se está ativo) é validada no servidor contra o registro; aqui só
// garantimos que algo foi selecionado.
const categorySchema = z
  .string()
  .trim()
  .min(1, "Selecione o tipo de lançamento.")
  .max(80, "Tipo de lançamento inválido.");

/** Código do tipo nativo de Reembolso Quilometragem. */
export const MILEAGE_CATEGORY = "MILEAGE_REIMBURSEMENT";

const addressSchema = z
  .string()
  .trim()
  .min(3, "Informe o endereço.")
  .max(300, "Endereço deve ter no máximo 300 caracteres.");

const distanceKmSchema = z
  .number()
  .gt(0, "A quilometragem deve ser maior que zero.")
  .lte(100000, "Quilometragem máxima é 100.000 km.")
  .refine((value) => Math.abs(value * 100 - Math.round(value * 100)) < 1e-9, {
    message: "Use no máximo 2 casas decimais.",
  });

/**
 * Campos do Reembolso Quilometragem enviados pelo formulário (opcionais no tipo
 * base; obrigatórios só quando a categoria é milhagem — reforçado por
 * `refineMileage`). O valor por km NÃO vem do cliente: é resolvido no servidor a
 * partir da taxa global (Política de Reembolso) e gravado como snapshot.
 */
export const mileageFieldsSchema = {
  originAddress: addressSchema.optional(),
  destinationAddress: addressSchema.optional(),
  roundTrip: z.boolean().optional(),
  distanceKm: distanceKmSchema.optional(),
  distanceOutboundKm: distanceKmSchema.optional(),
  distanceReturnKm: distanceKmSchema.optional(),
};

/**
 * Exige os campos de milhagem quando (e só quando) a categoria é milhagem.
 * Usado no item do lote e na edição. O `amount` continua sendo enviado pelo
 * cliente (total previsto), mas o servidor recomputa a partir de distanceKm ×
 * taxa — nunca confia no valor do cliente para milhagem.
 */
export function refineMileage(
  value: {
    category?: string | null;
    originAddress?: string;
    destinationAddress?: string;
    distanceKm?: number;
  },
  ctx: z.RefinementCtx,
): void {
  if (value.category !== MILEAGE_CATEGORY) return;
  if (!value.originAddress) {
    ctx.addIssue({
      code: "custom",
      path: ["originAddress"],
      message: "Informe o endereço de origem.",
    });
  }
  if (!value.destinationAddress) {
    ctx.addIssue({
      code: "custom",
      path: ["destinationAddress"],
      message: "Informe o endereço de destino.",
    });
  }
  if (value.distanceKm === undefined) {
    ctx.addIssue({
      code: "custom",
      path: ["distanceKm"],
      message: "Calcule (ou informe) a quilometragem antes de continuar.",
    });
  }
}

export const expenseInputSchema = z.object({
  projectId: idSchema,
  date: isoDateSchema,
  amount: amountSchema,
  description: descriptionSchema,
  invoiceNumber: invoiceNumberSchema,
  ...onBehalfField,
});

export type ExpenseInput = z.infer<typeof expenseInputSchema>;

/**
 * Um lançamento por NF: cabeçalho único (projeto, descrição, nota fiscal) com
 * vários itens, cada um com data, valor, tipo (e anexo enviado à parte por id).
 * O servidor cria N linhas Expense numa transação compartilhando o cabeçalho e
 * um groupId — "uma descrição para várias despesas" sem entidade pai.
 */
export const expenseItemSchema = z
  .object({
    date: isoDateSchema,
    amount: amountSchema,
    category: categorySchema,
    ...mileageFieldsSchema,
  })
  .superRefine(refineMileage);

export type ExpenseItemInput = z.infer<typeof expenseItemSchema>;

export const createExpenseBatchSchema = z.object({
  projectId: idSchema,
  description: descriptionSchema,
  invoiceNumber: invoiceNumberSchema,
  items: z
    .array(expenseItemSchema)
    .min(1, "Adicione ao menos um item de despesa.")
    .max(50, "Máximo de 50 itens por lançamento."),
  ...onBehalfField,
});

export type CreateExpenseBatchInput = z.infer<typeof createExpenseBatchSchema>;

export const updateExpenseInputSchema = z
  .object({
    id: idSchema,
    /** Optional move to another project (re-checks allocation). */
    projectId: idSchema.optional(),
    /** Optional date change (re-checks allocation coverage). */
    date: isoDateSchema.optional(),
    amount: amountSchema,
    description: descriptionSchema,
    invoiceNumber: invoiceNumberSchema,
    /** Optional so legacy rows (sem categoria) can still be edited. */
    category: categorySchema.optional(),
    ...mileageFieldsSchema,
    ...onBehalfField,
  })
  .superRefine(refineMileage);

export type UpdateExpenseInput = z.infer<typeof updateExpenseInputSchema>;

/** Entrada da action que calcula a quilometragem (origem/destino/ida-volta). */
export const mileageCalcInputSchema = z.object({
  origin: addressSchema,
  destination: addressSchema,
  roundTrip: z.boolean().default(false),
  ...onBehalfField,
});

export type MileageCalcInput = z.infer<typeof mileageCalcInputSchema>;

export const expenseIdInputSchema = z.object({
  id: idSchema,
  ...onBehalfField,
});

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

export const receiptInputSchema = z.object({
  expenseId: idSchema,
  ...onBehalfField,
});

export type ReceiptInput = z.infer<typeof receiptInputSchema>;
