/**
 * Tipos, rotulos e defaults do SLA do fluxo de horas. PURO — importavel por
 * Client Components. Os enums espelham o schema Prisma (SlaProcess,
 * SlaStageKey, SlaArea, SlaAnchor); os defaults espelham o seed/migracao
 * 20261027120000 e so sao usados quando o banco nao esta disponivel (demo) ou a
 * tabela ainda esta vazia.
 */
import type { SlaAnchorKey } from "./business-days";

export type SlaProcessKey = "HOURS_TO_BILLING" | "HOURS_TO_PAYMENT";

export type SlaStageKeyName =
  | "TIMESHEET_SUBMISSION"
  | "MANAGER_APPROVAL"
  | "OPERATION_CLOSING"
  | "BILLING_RELEASE"
  | "PEOPLE_PAYMENT_RELEASE"
  | "INVOICE_REQUEST"
  | "INVOICE_RECEIPT"
  | "PAYMENT";

export type SlaAreaKey = "CONSULTANT" | "OPERATION" | "PEOPLE" | "FINANCE";

export const SLA_PROCESSES: readonly SlaProcessKey[] = [
  "HOURS_TO_BILLING",
  "HOURS_TO_PAYMENT",
];

export const SLA_AREAS: readonly SlaAreaKey[] = [
  "OPERATION",
  "PEOPLE",
  "FINANCE",
  "CONSULTANT",
];

export const SLA_PROCESS_LABEL: Record<SlaProcessKey, string> = {
  HOURS_TO_BILLING: "Horas → Faturamento",
  HOURS_TO_PAYMENT: "Horas → Pagamento",
};

/** Slug usado na URL (?p=). */
export const SLA_PROCESS_SLUG: Record<SlaProcessKey, string> = {
  HOURS_TO_BILLING: "faturamento",
  HOURS_TO_PAYMENT: "pagamento",
};

export function processFromSlug(slug: string | undefined): SlaProcessKey {
  return slug === "pagamento" ? "HOURS_TO_PAYMENT" : "HOURS_TO_BILLING";
}

export const SLA_AREA_LABEL: Record<SlaAreaKey, string> = {
  CONSULTANT: "Consultores",
  OPERATION: "Operação",
  PEOPLE: "DP",
  FINANCE: "Financeiro",
};

export const SLA_STAGE_SHORT_LABEL: Record<SlaStageKeyName, string> = {
  TIMESHEET_SUBMISSION: "Lançamento",
  MANAGER_APPROVAL: "Aprovação",
  OPERATION_CLOSING: "Fechamento",
  BILLING_RELEASE: "Liberação faturamento",
  PEOPLE_PAYMENT_RELEASE: "Liberação DP",
  INVOICE_REQUEST: "Solicitação NF",
  INVOICE_RECEIPT: "Recebimento NF",
  PAYMENT: "Pagamento",
};

/** Tela onde a acao da etapa acontece (drill-down). */
export const SLA_STAGE_ACTION_HREF: Record<SlaStageKeyName, string> = {
  TIMESHEET_SUBMISSION: "/app/operacao/fechamento?tab=detalhamento",
  MANAGER_APPROVAL: "/app/aprovacoes",
  OPERATION_CLOSING: "/app/operacao/fechamento",
  BILLING_RELEASE: "/app/financeiro",
  PEOPLE_PAYMENT_RELEASE: "/app/pagamentos",
  INVOICE_REQUEST: "/app/pagamentos",
  INVOICE_RECEIPT: "/app/pagamentos",
  PAYMENT: "/app/pagamentos",
};

export const SLA_ANCHOR_LABEL: Record<SlaAnchorKey, string> = {
  COMPETENCE_MONTH_END: "Após o fim do mês",
  PAYMENT_DATE: "Antes do pagamento",
};

/** Configuracao de uma etapa (linha de SlaStage). */
export interface SlaStageConfig {
  process: SlaProcessKey;
  stageKey: SlaStageKeyName;
  area: SlaAreaKey;
  label: string;
  anchor: SlaAnchorKey;
  businessDays: number;
  warningBusinessDays: number;
  sortOrder: number;
  active: boolean;
}

/** Configuracao global (SlaSettings "default"). */
export interface SlaSettingsConfig {
  paymentDay: number;
  considerStateHolidays: boolean;
}

export interface SlaConfig {
  settings: SlaSettingsConfig;
  stages: SlaStageConfig[];
}

export const SLA_SETTINGS_DEFAULTS: SlaSettingsConfig = {
  paymentDay: 16,
  considerStateHolidays: false,
};

/** Mesmo conteudo de SLA_STAGE_DEFAULTS em packages/database/prisma/seed.mjs. */
export const SLA_STAGE_DEFAULTS: SlaStageConfig[] = [
  { process: "HOURS_TO_BILLING", stageKey: "TIMESHEET_SUBMISSION", area: "CONSULTANT", label: "Lançamento das horas pelo consultor", anchor: "COMPETENCE_MONTH_END", businessDays: 0, warningBusinessDays: 1, sortOrder: 10, active: true },
  { process: "HOURS_TO_BILLING", stageKey: "MANAGER_APPROVAL", area: "OPERATION", label: "Aprovação das horas pelo gestor", anchor: "COMPETENCE_MONTH_END", businessDays: 1, warningBusinessDays: 1, sortOrder: 20, active: true },
  { process: "HOURS_TO_BILLING", stageKey: "OPERATION_CLOSING", area: "OPERATION", label: "Fechamento operacional", anchor: "COMPETENCE_MONTH_END", businessDays: 1, warningBusinessDays: 1, sortOrder: 30, active: true },
  { process: "HOURS_TO_BILLING", stageKey: "BILLING_RELEASE", area: "OPERATION", label: "Liberação para faturamento", anchor: "COMPETENCE_MONTH_END", businessDays: 1, warningBusinessDays: 1, sortOrder: 40, active: true },
  { process: "HOURS_TO_PAYMENT", stageKey: "TIMESHEET_SUBMISSION", area: "CONSULTANT", label: "Lançamento das horas pelo consultor", anchor: "COMPETENCE_MONTH_END", businessDays: 0, warningBusinessDays: 1, sortOrder: 10, active: true },
  { process: "HOURS_TO_PAYMENT", stageKey: "MANAGER_APPROVAL", area: "OPERATION", label: "Aprovação das horas pelo gestor", anchor: "COMPETENCE_MONTH_END", businessDays: 1, warningBusinessDays: 1, sortOrder: 20, active: true },
  { process: "HOURS_TO_PAYMENT", stageKey: "OPERATION_CLOSING", area: "OPERATION", label: "Fechamento operacional", anchor: "COMPETENCE_MONTH_END", businessDays: 1, warningBusinessDays: 1, sortOrder: 30, active: true },
  { process: "HOURS_TO_PAYMENT", stageKey: "PEOPLE_PAYMENT_RELEASE", area: "PEOPLE", label: "Liberação do pagamento pelo DP", anchor: "COMPETENCE_MONTH_END", businessDays: 4, warningBusinessDays: 1, sortOrder: 40, active: true },
  { process: "HOURS_TO_PAYMENT", stageKey: "INVOICE_REQUEST", area: "FINANCE", label: "Solicitação da NF ao consultor", anchor: "PAYMENT_DATE", businessDays: 5, warningBusinessDays: 1, sortOrder: 50, active: true },
  { process: "HOURS_TO_PAYMENT", stageKey: "INVOICE_RECEIPT", area: "CONSULTANT", label: "Envio da NF pelo consultor", anchor: "PAYMENT_DATE", businessDays: 2, warningBusinessDays: 1, sortOrder: 60, active: true },
  { process: "HOURS_TO_PAYMENT", stageKey: "PAYMENT", area: "FINANCE", label: "Pagamento ao consultor", anchor: "PAYMENT_DATE", businessDays: 0, warningBusinessDays: 1, sortOrder: 70, active: true },
];

export function stagesOfProcess(
  stages: readonly SlaStageConfig[],
  process: SlaProcessKey,
  { activeOnly = true }: { activeOnly?: boolean } = {},
): SlaStageConfig[] {
  return stages
    .filter((s) => s.process === process && (!activeOnly || s.active))
    .sort((a, b) => a.sortOrder - b.sortOrder);
}
