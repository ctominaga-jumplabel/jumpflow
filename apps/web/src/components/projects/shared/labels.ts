import type {
  AdjustmentIndex,
  AllocationStatus,
  BillingPeriodicity,
  BillingRoundingRule,
  OverageTreatment,
  SkillLevel,
} from "@/lib/projects/types";

/**
 * pt-BR display labels for project enums, shared by the Operação, Comercial and
 * Financeiro surfaces so the wording never drifts between screens.
 */

export const periodicityLabels: Record<BillingPeriodicity, string> = {
  MONTHLY: "Mensal",
  BIWEEKLY: "Quinzenal",
  WEEKLY: "Semanal",
  PER_EVENT: "Por evento",
};

export const overageLabels: Record<OverageTreatment, string> = {
  BILL_EXTRA: "Cobrar excedente",
  BLOCK_AT_LIMIT: "Bloquear no limite",
  INCLUDE_FREE: "Incluir sem custo",
  CARRY_OVER: "Acumular p/ próximo período",
};

export const adjustmentLabels: Record<AdjustmentIndex, string> = {
  NONE: "Sem reajuste",
  IPCA: "IPCA",
  IGPM: "IGP-M",
  CDI: "CDI",
  FIXED: "Percentual fixo",
};

export const billingRoundingLabels: Record<BillingRoundingRule, string> = {
  NONE: "Sem arredondamento",
  NEAREST_15_MINUTES: "Mais próximo 15min",
  NEAREST_30_MINUTES: "Mais próximo 30min",
  NEAREST_HOUR: "Mais próxima hora",
  CEIL_15_MINUTES: "Teto 15min",
  CEIL_30_MINUTES: "Teto 30min",
  CEIL_HOUR: "Teto hora",
};

export const skillLevelLabels: Record<SkillLevel, string> = {
  BASIC: "Básico",
  INTERMEDIATE: "Intermediário",
  ADVANCED: "Avançado",
  SPECIALIST: "Especialista",
};

export const allocationStatusLabels: Record<AllocationStatus, string> = {
  PLANNED: "Planejado",
  ACTIVE: "Ativo",
  ENDED: "Encerrado",
  CANCELLED: "Cancelado",
  INACTIVE: "Inativo",
};
