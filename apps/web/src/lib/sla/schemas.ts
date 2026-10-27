/**
 * Validacao (Zod) e checagens de coerencia da configuracao de SLA. PURO —
 * usado pela server action (fonte da verdade) e pela previa no navegador.
 */
import { z } from "zod";
import {
  computeStageDeadline,
  formatDeadlineShort,
  resolvePaymentDate,
  shiftCompetence,
  type BusinessCalendar,
  type Competence,
  type IsoDate,
} from "./business-days";
import {
  SLA_PROCESS_LABEL,
  stagesOfProcess,
  type SlaConfig,
  type SlaProcessKey,
  type SlaStageKeyName,
} from "./types";

export const SLA_MAX_BUSINESS_DAYS = 30;
export const SLA_MAX_WARNING_DAYS = 10;

const stageKeyEnum = z.enum([
  "TIMESHEET_SUBMISSION",
  "MANAGER_APPROVAL",
  "OPERATION_CLOSING",
  "BILLING_RELEASE",
  "PEOPLE_PAYMENT_RELEASE",
  "INVOICE_REQUEST",
  "INVOICE_RECEIPT",
  "PAYMENT",
]);

export const slaStageUpdateSchema = z.object({
  process: z.enum(["HOURS_TO_BILLING", "HOURS_TO_PAYMENT"]),
  stageKey: stageKeyEnum,
  label: z
    .string()
    .trim()
    .min(3, "Nome da etapa muito curto.")
    .max(80, "Nome da etapa muito longo."),
  businessDays: z
    .number()
    .int("Use dias inteiros.")
    .min(0, "Dias úteis não podem ser negativos.")
    .max(SLA_MAX_BUSINESS_DAYS, `Máximo de ${SLA_MAX_BUSINESS_DAYS} dias úteis.`),
  warningBusinessDays: z
    .number()
    .int("Use dias inteiros.")
    .min(0, "Aviso não pode ser negativo.")
    .max(SLA_MAX_WARNING_DAYS, `Aviso de no máximo ${SLA_MAX_WARNING_DAYS} dias úteis.`),
  active: z.boolean(),
});

export const slaConfigUpdateSchema = z
  .object({
    settings: z.object({
      paymentDay: z
        .number()
        .int("Use um dia inteiro.")
        .min(1, "Dia de pagamento entre 1 e 31.")
        .max(31, "Dia de pagamento entre 1 e 31."),
      considerStateHolidays: z.boolean(),
    }),
    stages: z.array(slaStageUpdateSchema).min(1).max(20),
  })
  .superRefine((value, ctx) => {
    const seen = new Set<string>();
    for (const s of value.stages) {
      const key = `${s.process}:${s.stageKey}`;
      if (seen.has(key)) {
        ctx.addIssue({ code: "custom", message: `Etapa duplicada: ${key}.` });
      }
      seen.add(key);
    }
  });

export type SlaConfigUpdateInput = z.infer<typeof slaConfigUpdateSchema>;

/** Previa: prazos de cada etapa ativa para as proximas competencias. */
export interface SlaDeadlinePreview {
  competence: Competence;
  paymentDate: IsoDate;
  deadlines: Record<string, IsoDate>; // `${process}:${stageKey}` -> data
}

export function previewDeadlines(
  config: SlaConfig,
  from: Competence,
  count: number,
  calendar: BusinessCalendar,
): SlaDeadlinePreview[] {
  const out: SlaDeadlinePreview[] = [];
  for (let i = 0; i < count; i++) {
    const competence = shiftCompetence(from, i);
    const deadlines: Record<string, IsoDate> = {};
    for (const stage of config.stages) {
      deadlines[`${stage.process}:${stage.stageKey}`] = computeStageDeadline(
        stage,
        competence,
        config.settings,
        calendar,
      );
    }
    out.push({
      competence,
      paymentDate: resolvePaymentDate(competence, config.settings.paymentDay, calendar),
      deadlines,
    });
  }
  return out;
}

/**
 * Pares cuja ordem cronologica e obrigatoria alem da ordem de exibicao. A
 * checagem generica (etapa N antes da etapa N-1 na sequencia) ja cobre o
 * fluxo; a lista abaixo e para mensagens mais especificas.
 */
const EXPLICIT_ORDER: Array<[SlaStageKeyName, SlaStageKeyName]> = [
  ["PEOPLE_PAYMENT_RELEASE", "INVOICE_REQUEST"],
  ["INVOICE_REQUEST", "INVOICE_RECEIPT"],
  ["INVOICE_RECEIPT", "PAYMENT"],
  ["OPERATION_CLOSING", "BILLING_RELEASE"],
];

/**
 * Avisos (nao bloqueantes) de coerencia: uma etapa que vence ANTES da etapa
 * anterior do mesmo processo (ex.: solicitar NF antes de o DP liberar). Checado
 * nas competencias informadas (feriados podem gerar o problema so num mes).
 */
export function stageOrderWarnings(
  config: SlaConfig,
  competences: readonly Competence[],
  calendar: BusinessCalendar,
): string[] {
  const warnings = new Set<string>();
  for (const competence of competences) {
    for (const process of ["HOURS_TO_BILLING", "HOURS_TO_PAYMENT"] as SlaProcessKey[]) {
      const stages = stagesOfProcess(config.stages, process);
      const dates = stages.map((s) =>
        computeStageDeadline(s, competence, config.settings, calendar),
      );
      const byKey = new Map(stages.map((s, i) => [s.stageKey, { stage: s, date: dates[i] }]));
      const explicit = new Set<string>();
      for (const [before, after] of EXPLICIT_ORDER) {
        const a = byKey.get(before);
        const b = byKey.get(after);
        if (a && b && b.date < a.date) {
          explicit.add(`${before}>${after}`);
          warnings.add(
            `${SLA_PROCESS_LABEL[process]}: "${b.stage.label}" (${formatDeadlineShort(b.date)}) vence antes de "${a.stage.label}" (${formatDeadlineShort(a.date)}).`,
          );
        }
      }
      for (let i = 1; i < stages.length; i++) {
        if (dates[i] < dates[i - 1]) {
          const key = `${stages[i - 1].stageKey}>${stages[i].stageKey}`;
          if (explicit.has(key)) continue;
          warnings.add(
            `${SLA_PROCESS_LABEL[process]}: "${stages[i].label}" (${formatDeadlineShort(dates[i])}) vence antes da etapa anterior "${stages[i - 1].label}" (${formatDeadlineShort(dates[i - 1])}).`,
          );
        }
      }
    }
  }
  return [...warnings];
}
