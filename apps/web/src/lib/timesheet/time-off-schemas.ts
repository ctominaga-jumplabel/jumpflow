import { z } from "zod";
import { parseIsoDateUtc } from "./week";

/**
 * Schemas Zod das server actions de Ausência (Onda D/ausência-backend). O
 * servidor é a autoridade de validação; checagens no cliente são só conveniência.
 */

const idSchema = z.string().trim().min(1, "Identificador obrigatório.");

const isoDateSchema = z
  .string()
  .refine((value) => parseIsoDateUtc(value) !== null, {
    message: "Data inválida (use o formato aaaa-mm-dd).",
  });

/** Mensagem única para "início depois do fim". */
export const INVALID_RANGE_MESSAGE = "A data de início deve ser anterior ou igual à data de fim.";

/**
 * Solicitação de ausência (consultor). `kind` restrito ao enum; `paid` é
 * DERIVADO do kind no servidor (não vem do cliente). `vacationId` opcional
 * (usado só em férias para debitar o saldo).
 */
export const requestTimeOffSchema = z
  .object({
    kind: z.enum(["VACATION", "LEAVE", "OTHER"]),
    startDate: isoDateSchema,
    endDate: isoDateSchema,
    note: z
      .string()
      .trim()
      .max(500, "Observação deve ter no máximo 500 caracteres.")
      .optional()
      .transform((v) => (v && v.length > 0 ? v : null)),
    vacationId: idSchema.optional(),
  })
  .refine(
    (v) => {
      const start = parseIsoDateUtc(v.startDate);
      const end = parseIsoDateUtc(v.endDate);
      return start && end && start.getTime() <= end.getTime();
    },
    { message: INVALID_RANGE_MESSAGE, path: ["endDate"] },
  );

export type RequestTimeOffInput = z.input<typeof requestTimeOffSchema>;

/** Comentário obrigatório ao reprovar (espelha COMMENT_REQUIRED de Horas). */
export const TIME_OFF_REJECT_COMMENT_REQUIRED =
  "Informe o motivo da reprovação.";

/**
 * Decisão de uma ausência (papel PEOPLE). `approve=false` exige comentário
 * (motivo da reprovação); aprovação aceita comentário opcional.
 */
export const decideTimeOffSchema = z
  .object({
    id: idSchema,
    approve: z.boolean(),
    comment: z
      .string()
      .trim()
      .max(500, "Comentário deve ter no máximo 500 caracteres.")
      .optional()
      .transform((v) => (v && v.length > 0 ? v : null)),
  })
  .refine((v) => v.approve || Boolean(v.comment), {
    message: TIME_OFF_REJECT_COMMENT_REQUIRED,
    path: ["comment"],
  });

export type DecideTimeOffInput = z.input<typeof decideTimeOffSchema>;

/** Cancelamento de uma ausência (dono ou PEOPLE). */
export const cancelTimeOffSchema = z.object({
  id: idSchema,
  comment: z
    .string()
    .trim()
    .max(500, "Comentário deve ter no máximo 500 caracteres.")
    .optional()
    .transform((v) => (v && v.length > 0 ? v : null)),
});

export type CancelTimeOffInput = z.input<typeof cancelTimeOffSchema>;
